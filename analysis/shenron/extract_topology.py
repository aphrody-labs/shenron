#!/usr/bin/env python3
"""Dependency and topology map of the Shenron monorepo (apps, packages, crates).

Run from the repository root:  python analysis/shenron/extract_topology.py
Writes analysis/shenron/topology.json and prints a summary.

Sources, all read from tracked files (git ls-files):
  - crates/*/Cargo.toml   package name, [[bin]], path and workspace dependencies
  - root Cargo.toml       [workspace.dependencies] entries with a path, to resolve `workspace = true`
  - apps/*/package.json, packages/*/package.json   workspace dependencies (`workspace:*` or a known name)
  - source text           datastore use (Postgres, Redis, SQLite, S3), SQL verbs for read versus write
Edges between modules are manifest dependencies (kind `call`). Datastore edges are heuristics from
source text: `write` when the module contains a write statement or call for that store (SQL verbs, Redis set, hash and stream commands, S3 put or upload), else `read`.
Dead-end candidates are modules with no inbound edge, no entry point and whose name does not appear in
any file outside the module (so a dynamic import by name keeps it alive).
"""
from __future__ import annotations

import json
import re
import subprocess
import tomllib
from pathlib import Path

ROOT = Path(subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True, check=True).stdout.strip())
OUT = ROOT / "analysis" / "shenron" / "topology.json"
FILES = subprocess.run(["git", "ls-files", "-z"], cwd=ROOT, capture_output=True, check=True).stdout.decode("utf-8", "replace").split("\0")
TRACKED = {f for f in FILES if f}


def read(path: str) -> str:
    try:
        return (ROOT / path).read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""


def loc(prefix: str, suffixes: tuple[str, ...]) -> int:
    return sum(read(f).count("\n") for f in TRACKED if f.startswith(prefix) and f.endswith(suffixes))


modules: dict[str, dict] = {}   # id -> node
edges: list[dict] = []
by_name: dict[str, str] = {}    # package or crate name -> id
text_of: dict[str, str] = {}    # id -> concatenated source text (bounded) for datastore scans


def domain_of(kind: str, name: str) -> str:
    if kind == "app":
        return "Applications"
    if kind == "crate":
        if name.startswith("koharu-"):
            return "Koharu (manga studio)"
        if name in ("dragon-pixel", "shenron-gallery", "shenron-engine", "shenron-gpu", "shenron-jev"):
            return "Games and rendering"
        if name in ("shenron-deployd", "shenron-edge", "shenron-migrate", "xtask", "shenron-tv", "shenron-video", "shenron-home", "shenron-memory"):
            return "Operations and media services"
        if name in ("shenron-api", "shenron-mcp", "shenron-cli", "shenron-rag", "shenron-rag-core", "shenron-lexicon", "shenron-manga", "shenron-ocr-core", "shenron-re"):
            return "API, MCP and knowledge"
        return "Desktop and UI crates"
    return "TypeScript packages"


def add_module(node_id: str, name: str, kind: str, language: str, directory: str, suffixes: tuple[str, ...], source_prefix: str) -> None:
    modules[node_id] = {"id": node_id, "name": name, "kind": "module", "language": language, "loc": loc(source_prefix, suffixes), "file": directory, "_group": domain_of(kind, name), "_kind": kind}
    by_name[name] = node_id
    text = ""
    for f in sorted(TRACKED):
        if f.startswith(source_prefix) and f.endswith(suffixes) and len(text) < 3_000_000:
            text += read(f)
    text_of[node_id] = text


entry_points: set[str] = set()

# Rust crates
root_cargo = tomllib.loads(read("Cargo.toml"))
workspace_paths = {n: v["path"] for n, v in root_cargo.get("workspace", {}).get("dependencies", {}).items() if isinstance(v, dict) and "path" in v}
crate_dirs = sorted({f.split("/")[1] for f in TRACKED if f.startswith("crates/") and f.endswith("/Cargo.toml") and f.count("/") == 2})
crate_manifests: dict[str, dict] = {}
for d in crate_dirs:
    manifest = tomllib.loads(read(f"crates/{d}/Cargo.toml"))
    name = manifest.get("package", {}).get("name", d)
    crate_manifests[name] = manifest
    add_module(f"crate:{name}", name, "crate", "rust", f"crates/{d}", (".rs",), f"crates/{d}/src/")
    if f"crates/{d}/src/main.rs" in TRACKED or manifest.get("bin"):
        entry_points.add(f"crate:{name}")

# npm workspaces
npm_manifests: dict[str, dict] = {}
for f in sorted(TRACKED):
    m = re.fullmatch(r"(apps|packages)/([^/]+)/package\.json", f)
    if not m:
        continue
    manifest = json.loads(read(f) or "{}")
    name = manifest.get("name", f"{m.group(1)}/{m.group(2)}")
    kind = "app" if m.group(1) == "apps" else "package"
    node_id = f"{kind}:{m.group(1)}/{m.group(2)}"
    npm_manifests[node_id] = manifest
    add_module(node_id, name, kind, "typescript", f"{m.group(1)}/{m.group(2)}", (".ts", ".tsx"), f"{m.group(1)}/{m.group(2)}/src/")
    if kind == "app":
        entry_points.add(node_id)

# Edges from manifests
for name, manifest in crate_manifests.items():
    source = f"crate:{name}"
    for table in ("dependencies", "dev-dependencies", "build-dependencies"):
        for dep, spec in manifest.get(table, {}).items():
            target = by_name.get(dep)
            if target and target != source and (isinstance(spec, dict) and ("path" in spec or spec.get("workspace"))):
                edges.append({"source": source, "target": target, "kind": "call"})
for node_id, manifest in npm_manifests.items():
    for table in ("dependencies", "devDependencies", "peerDependencies"):
        for dep, spec in manifest.get(table, {}).items():
            target = by_name.get(dep)
            if target and target != node_id and isinstance(spec, str) and (spec.startswith("workspace:") or spec == "catalog:" or target):
                edges.append({"source": node_id, "target": target, "kind": "call"})

# Datastores from source text
STORES = {
    "ds:postgres": ("PostgreSQL", re.compile(r"sqlx|tokio_postgres|tokio-postgres|Bun\.SQL|new SQL\(|from ['\"]pg['\"]|DATABASE_URL|postgres(?:ql)?://")),
    "ds:redis": ("Redis", re.compile(r"\bioredis\b|Bun\.redis|RedisClient|redis::|REDIS_URL")),
    "ds:sqlite": ("SQLite", re.compile(r"bun:sqlite|rusqlite|\.sqlite\b|better-sqlite3")),
    "ds:s3": ("Object storage (S3: Garage, R2)", re.compile(r"S3Client|aws-sdk|object_store|s3\.|GARAGE_|R2_")),
}
SQL_WRITE = re.compile(r"\b(INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|CREATE\s+TABLE|ON\s+CONFLICT)\b", re.I)
WRITE = {
    "ds:postgres": SQL_WRITE,
    "ds:sqlite": SQL_WRITE,
    "ds:redis": re.compile(r"\.(hset|sadd|lpush|rpush|xadd|zadd|incr|expire|setex)\(|\bHSET\b|\bSADD\b|\bXADD\b|redis\.set\(|\.set\([^)]*,\s*[^)]*ex", re.I),
    "ds:s3": re.compile(r"PutObject|put_object|\.write\(|upload|\.put\(", re.I),
}
used_stores: set[str] = set()
for node_id, text in text_of.items():
    for store_id, (_, pattern) in STORES.items():
        if pattern.search(text):
            used_stores.add(store_id)
            edges.append({"source": node_id, "target": store_id, "kind": "write" if WRITE[store_id].search(text) else "read"})

# Entry points and dead ends
inbound = {e["target"] for e in edges}
all_text = None
def mentioned_elsewhere(node_id: str) -> bool:
    name = modules[node_id]["name"]
    own = modules[node_id]["file"]
    for f in TRACKED:
        if f.startswith(own + "/") or f.endswith((".lock", "bun.lock")) or not f.endswith((".ts", ".tsx", ".rs", ".toml", ".json", ".yml", ".md", ".sh")):
            continue
        if name in read(f):
            return True
    return False

dead = []
for node_id in modules:
    if node_id in inbound or node_id in entry_points:
        continue
    if not mentioned_elsewhere(node_id):
        dead.append(node_id)

# Tree
groups: dict[str, list[dict]] = {}
for node in modules.values():
    groups.setdefault(node["_group"], []).append({k: v for k, v in node.items() if not k.startswith("_")})
children = [{"id": f"dom:{name}", "name": name, "kind": "domain", "children": sorted(items, key=lambda n: n["name"])} for name, items in sorted(groups.items())]
children.append({"id": "dom:data", "name": "Data stores", "kind": "domain", "children": [{"id": sid, "name": STORES[sid][0], "kind": "datastore"} for sid in sorted(used_stores)]})

# Deduplicate edges
seen, unique = set(), []
for e in edges:
    key = (e["source"], e["target"], e["kind"])
    if key not in seen:
        seen.add(key)
        unique.append(e)
edges = unique
edge_pairs = {(e["source"], e["target"]) for e in edges}
node_ids = set(modules) | used_stores

# Persona flows: only nodes that exist, steps in the order the graph supports
def existing(*ids: str) -> list[str]:
    return [i for i in ids if i in node_ids]

flows = [
    {"name": "A reader opens a wiki page", "persona": "Reader", "description": "A visitor requests a page of dragonballfr.com and gets rendered content from the database.",
     "steps": [
         {"label": "The request reaches the site", "nodes": existing("app:apps/site")},
         {"label": "Wiki content is read from the database", "nodes": existing("package:packages/db", "ds:postgres")},
         {"label": "The page is rendered with the shared interface kit", "nodes": existing("package:packages/ui", "package:packages/config")},
     ]},
    {"name": "A member asks the Discord bot", "persona": "Community member", "description": "A member runs a command and receives an answer built from the same data as the site.",
     "steps": [
         {"label": "The command reaches the bot", "nodes": existing("app:apps/bot")},
         {"label": "Knowledge and rules are looked up", "nodes": existing("package:packages/lexicon", "package:packages/db", "ds:sqlite", "ds:postgres")},
     ]},
    {"name": "An operator ships a release", "persona": "Operator", "description": "A signed release is published, fetched by each host agent and switched with a health check.",
     "steps": [
         {"label": "The release is published and signed", "nodes": existing("crate:shenron-deployd")},
         {"label": "The edge serves the new version", "nodes": existing("crate:shenron-edge")},
         {"label": "Repository checks gate the change", "nodes": existing("crate:xtask", "crate:shenron-migrate")},
     ]},
]
flows = [{**f, "steps": [s for s in f["steps"] if s["nodes"]]} for f in flows]
flows = [f for f in flows if len(f["steps"]) >= 2]

# Observations computed from the graph, not asserted
degree_in: dict[str, int] = {}
for e in edges:
    if e["kind"] == "call":
        degree_in[e["target"]] = degree_in.get(e["target"], 0) + 1
hub = sorted(degree_in.items(), key=lambda kv: -kv[1])[:3]
writers = {sid: sorted({e["source"] for e in edges if e["target"] == sid and e["kind"] == "write"}) for sid in used_stores}
observations = [
    "Most depended-on modules: " + ", ".join(f"{modules[i]['name']} ({n} dependents)" for i, n in hub if i in modules) + ".",
    *[f"{STORES[sid][0]} has {len(w)} writing modules: " + ", ".join(modules[x]['name'] for x in w[:6]) + ("..." if len(w) > 6 else "") + "." for sid, w in writers.items() if len(w) >= 3],
    (f"{len(dead)} modules have no inbound edge, no entry point and no mention of their name outside their directory." if dead else "Every module is either depended on, an entry point or named somewhere outside its directory: no dead-end candidate survives the suppression rule (a name mention keeps a module alive, which can hide a module that is only mentioned in documentation)."),
    "Datastore edges come from source-text patterns (read versus write by SQL verbs, or by store-specific write calls for Redis and S3), not from a typed schema; a module that builds SQL at runtime from files can be misclassified.",
    "No dynamic dispatch table was resolved: Next.js routes, Discord command registries and MCP tool registrations are not edges in this graph.",
]

topology = {
    "system": "Shenron",
    "root": {"id": "sys", "name": "Shenron", "kind": "system", "children": children},
    "edges": edges,
    "entryPoints": sorted(entry_points),
    "deadEnds": sorted(dead),
    "observations": observations,
    "flows": flows,
}
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(topology, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

print(f"modules: {len(modules)}  datastores: {len(used_stores)}  edges: {len(edges)}  entry points: {len(entry_points)}  dead-end candidates: {len(dead)}")
for name, items in sorted(groups.items()):
    print(f"  {name}: {len(items)} modules, {sum(n['loc'] for n in items)} lines")
print("observations:")
for o in observations:
    print("  -", o)
print("dead-end candidates:", ", ".join(modules[d]["name"] for d in sorted(dead)) or "none")
