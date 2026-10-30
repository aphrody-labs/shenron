import { readFileSync, writeFileSync } from "fs";

const path = "apps/site/src/app/admin/database/page.tsx";
let code = readFileSync(path, "utf8");
const target = '  db_character_variants: { label: "Versions par saga", group: "Encyclopédie" },';
const addition = `  db_character_variants: { label: "Versions par saga", group: "Encyclopédie" },
  db_character_relations: { label: "Relations des personnages (Famille, Amis, Ennemis)", group: "Encyclopédie" },`;

if (!code.includes("db_character_relations")) {
  code = code.replace(target, addition);
  writeFileSync(path, code, "utf8");
  console.log("Added db_character_relations to admin database page");
} else {
  console.log("Already added");
}
