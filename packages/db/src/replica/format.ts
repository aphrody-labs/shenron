// SPDX-License-Identifier: Apache-2.0
import type { TableReport } from "./mirror";

/** One line per table for the operator; the JSON report stays the machine-readable record. */
export function formatStateReport(reports: Record<string, TableReport>): string {
  const lines = ["table                   status    sqlite  pg      +insert ~update -delete  note"];
  for (const [table, report] of Object.entries(reports)) {
    const notes = [
      report.reason,
      report.drift,
      report.duplicates ? `${report.duplicates} duplicated key(s)` : undefined,
      report.sqliteOnlyColumns.length
        ? `not in PostgreSQL: ${report.sqliteOnlyColumns.join(",")}`
        : undefined,
      Object.keys(report.changedColumns).length
        ? `changed: ${Object.entries(report.changedColumns)
            .map(([column, count]) => `${column}(${count})`)
            .join(",")}`
        : undefined,
    ].filter(Boolean);
    lines.push(
      [
        table.padEnd(23),
        report.status.padEnd(9),
        String(report.source).padEnd(7),
        String(report.target).padEnd(7),
        String(report.insert).padEnd(7),
        String(report.update).padEnd(7),
        String(report.delete).padEnd(8),
        notes.join("; "),
      ].join(" "),
    );
  }
  return lines.join("\n");
}
