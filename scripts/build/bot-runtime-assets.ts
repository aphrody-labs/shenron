import { chmodSync, cpSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** Public runtime payloads must be readable by the deployment's configured UID. */
export function copyRuntimeFile(source: string, destination: string): void {
  cpSync(source, destination);
  chmodSync(destination, 0o644);
}

export function copyRuntimeDirectory(source: string, destination: string): void {
  cpSync(source, destination, { recursive: true });
  const normalize = (directory: string) => {
    chmodSync(directory, 0o755);
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) normalize(path);
      else if (entry.isFile()) chmodSync(path, 0o644);
    }
  };
  normalize(destination);
}
