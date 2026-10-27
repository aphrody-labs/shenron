import { readFileSync, writeFileSync } from "fs";

const path = "apps/site/src/lib/wiki-tables.ts";
let code = readFileSync(path, "utf8");
const target = "  db_character_variants: {";
const relSpec = `  db_character_relations: {
    name: "db_character_relations",
    pk: "id",
    mutableColumns: [
      "characterId",
      "relatedCharacterId",
      "category",
      "relationType",
      "name",
      "nameJa",
      "image",
      "slug",
      "description",
      "sortOrder",
      "visible",
    ],
  },
  db_character_variants: {`;

if (!code.includes("db_character_relations")) {
  code = code.replace(target, relSpec);
  writeFileSync(path, code, "utf8");
  console.log("Added db_character_relations to wiki-tables.ts");
} else {
  console.log("Already present");
}
