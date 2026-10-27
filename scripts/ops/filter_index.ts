import { readFileSync, writeFileSync } from "fs";

const path = "apps/site/src/app/wiki/characters/(index)/page.tsx";
let code = readFileSync(path, "utf8");
const target = "  const cartes = characters";
const filterCode = `  // Restriction stricte demandée : Son Goku (1) et Kid Buu (90) uniquement
  const allowedCharacters = characters.filter((c) => c.id === 1 || c.id === 90 || c.slug === "son-goku" || c.slug === "kid-buu");
  const cartes = allowedCharacters`;
code = code.replace(target, filterCode);
code = code.replace(
  "lead={`${characters.length} fiches, des héros du récit aux figures d'un seul chapitre.`}",
  "lead={`${allowedCharacters.length} fiches, des héros du récit aux figures d'un seul chapitre.`}",
);
writeFileSync(path, code, "utf8");
console.log("Filtered characters index page successfully!");
