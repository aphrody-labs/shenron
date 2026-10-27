import { execSync } from "child_process";

export function runRemoteSql(sql: string) {
  const child = execSync('ssh dbfr "sudo docker exec -i shenron-postgres psql -U postgres -d shenron_site -t -A"', {
    input: sql,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
  });
  return child;
}

if (import.meta.main) {
  const sql = process.argv[2] ?? "SELECT table_name FROM information_schema.tables WHERE table_schema = 'bot' ORDER BY table_name;";
  console.log(runRemoteSql(sql));
}
