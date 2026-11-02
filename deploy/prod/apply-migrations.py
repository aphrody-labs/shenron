#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""Apply the pending site migrations to the production PostgreSQL, drizzle-style.

Usage: apply-migrations.py <migrations-dir> [--dry-run]

Same rule as drizzle's migrator: a journal entry is pending when its `when` is greater than
the newest `created_at` in drizzle.__drizzle_migrations; the row stores the sha256 of the SQL.
Each file runs in one transaction (psql -1, ON_ERROR_STOP) after a pg_dump backup, so a
failure leaves the schema and the journal untouched and aborts the deploy. Migrations must stay
additive: the previous release keeps serving until the new one is activated.
"""

import hashlib
import json
import subprocess
import sys
import time
from pathlib import Path

CONTAINER = "shenron-postgres"
DB = "shenron_site"
USER = "postgres"
BACKUPS = Path("/root/backups-auth")


def psql(sql: str, *, single_tx: bool = False, capture: bool = True) -> str:
    cmd = ["docker", "exec", "-i", CONTAINER, "psql", "-U", USER, "-d", DB, "-v", "ON_ERROR_STOP=1", "-Atq"]
    if single_tx:
        cmd.append("-1")
    done = subprocess.run(cmd, input=sql, text=True, capture_output=capture, check=False)
    if done.returncode != 0:
        sys.exit(f"psql failed: {done.stderr.strip()}")
    return done.stdout.strip()


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry = "--dry-run" in sys.argv
    if len(args) != 1:
        sys.exit(__doc__)
    root = Path(args[0])
    journal = json.loads((root / "meta" / "_journal.json").read_text())["entries"]

    last = int(psql("select coalesce(max(created_at), 0) from drizzle.__drizzle_migrations") or 0)
    pending = [e for e in journal if e["when"] > last]
    print(f"== migrations: {len(pending)} pending (last applied created_at={last})")
    if not pending:
        return

    for entry in pending:
        print(f"   - {entry['tag']}")
    if dry:
        return

    BACKUPS.mkdir(parents=True, exist_ok=True)
    dump = BACKUPS / f"{DB}-pre-{pending[0]['tag'][:4]}-{time.strftime('%Y%m%d-%H%M%S')}.dump"
    with dump.open("wb") as out:
        done = subprocess.run(
            ["docker", "exec", CONTAINER, "pg_dump", "-U", USER, "-Fc", DB], stdout=out, check=False
        )
    if done.returncode != 0 or dump.stat().st_size == 0:
        dump.unlink(missing_ok=True)
        sys.exit("pg_dump failed; no migration applied")
    print(f"== backup {dump} ({dump.stat().st_size} bytes)")

    for entry in pending:
        sql = (root / f"{entry['tag']}.sql").read_text()
        digest = hashlib.sha256(sql.encode()).hexdigest()
        record = (
            "insert into drizzle.__drizzle_migrations (hash, created_at) "
            f"values ('{digest}', {entry['when']});"
        )
        psql(sql.replace("--> statement-breakpoint", "") + "\n" + record, single_tx=True)
        print(f"== applied {entry['tag']}")


if __name__ == "__main__":
    main()
