import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import postgres from "postgres";

const apply = process.argv.includes("--apply");
const sourcePath = resolve(import.meta.dir, "../../../docs/products/powerscaling-vsbw.md");
const body = await readFile(sourcePath, "utf8");
// Le gabarit wiki affiche déjà le titre en H1.
const wikiBody = body.replace(/^# [^\r\n]*\r?\n(?:\r?\n)?/, "");
const category = {
  id: "cat_vsbw_methodology",
  slug: "methodologie-powerscaling",
  name: "Méthodologie de Power Scaling",
};
const page = {
  id: "page_vsbw_methodology",
  slug: "methodologie-powerscaling-vsbw",
  title: "Méthodologie de powerscaling : outils et règles VSBW",
};

if (!apply) {
  console.log("Aperçu uniquement — aucune connexion ni écriture en base.");
  console.log("Catégorie à créer : " + category.name + " (/wiki/" + category.slug + ")");
  console.log("Page à créer : " + page.title + " (/wiki/" + page.slug + ")");
  console.log("Source : " + sourcePath + " (" + body.length + " caractères)");
  console.log("Corps wiki : H1 retiré, " + wikiBody.length + " caractères.");
  console.log(
    "Pour insérer seulement si ces identifiants et slugs sont libres : bun apps/site/scripts/seed-vsbw-methodology.ts --apply",
  );
  process.exit(0);
}

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required with --apply.");
const sql = postgres(connectionString);

try {
  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO "WikiCategory" (id, slug, name, "order")
      VALUES (${category.id}, ${category.slug}, ${category.name}, 5)
      ON CONFLICT DO NOTHING
    `;

    const categoryRows = await tx`
      SELECT id, slug, name FROM "WikiCategory"
      WHERE id = ${category.id} OR slug = ${category.slug}
    `;
    if (
      categoryRows.length !== 1 ||
      categoryRows[0]?.id !== category.id ||
      categoryRows[0]?.slug !== category.slug ||
      categoryRows[0]?.name !== category.name
    ) {
      throw new Error(
        "Category ID or slug is already used by different content; no changes committed.",
      );
    }

    await tx`
      INSERT INTO "WikiPage" (id, "categoryId", title, slug, body, "order", "updatedAt")
      VALUES (
        ${page.id},
        ${category.id},
        ${page.title},
        ${page.slug},
        ${wikiBody},
        1,
        NOW()
      )
      ON CONFLICT DO NOTHING
    `;

    const pageRows = await tx`
      SELECT id, "categoryId", title, slug, body FROM "WikiPage"
      WHERE id = ${page.id} OR slug = ${page.slug}
    `;
    if (
      pageRows.length !== 1 ||
      pageRows[0]?.id !== page.id ||
      pageRows[0]?.categoryId !== category.id ||
      pageRows[0]?.title !== page.title ||
      pageRows[0]?.slug !== page.slug ||
      pageRows[0]?.body !== wikiBody
    ) {
      throw new Error("Page ID or slug exists with different content; no changes committed.");
    }
  });
  console.log("Page ajoutée : /wiki/" + page.slug);
} finally {
  await sql.end();
}
