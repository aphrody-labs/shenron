// Compare key sets and placeholder tokens of edited message files against a base ref.
import { execSync } from "child_process";
import { readFileSync } from "fs";
const base = process.argv[2] ?? "origin/main";
const files = execSync(`git diff --name-only ${base} -- apps/site/messages`, { encoding: "utf8" })
  .split("\n")
  .filter((f) => f.endsWith(".json"));
const flat = (o: any, p = "", out: Record<string, string> = {}) => {
  for (const k in o) {
    const v = o[k];
    if (typeof v === "string") out[p + k] = v;
    else if (v && typeof v === "object") flat(v, p + k + ".", out);
  }
  return out;
};
const tok = (s: string) => (s.match(/\{[^}]*\}|<\/?[a-zA-Z][^>]*>|%[sd]/g) ?? []).toSorted().join("|");
let bad = 0;
for (const f of files) {
  const a = flat(JSON.parse(execSync(`git show ${base}:${f}`, { encoding: "utf8" })));
  const b = flat(JSON.parse(readFileSync(f, "utf8")));
  if (Object.keys(a).toSorted().join() !== Object.keys(b).toSorted().join()) {
    console.log("KEY MISMATCH", f);
    bad++;
  }
  let ch = 0;
  for (const k in a) {
    if (a[k] !== b[k]) {
      ch++;
      if (tok(a[k]) !== tok(b[k])) {
        console.log("TOKEN MISMATCH", f, k);
        bad++;
      }
    }
  }
  console.log(f, "changed strings:", ch);
}
console.log(bad ? "FAIL" : "PARITY OK");
process.exit(bad ? 1 : 0);
