import { readFileSync, writeFileSync } from "fs";

const path = "apps/site/src/lib/shenron.ts";
let code = readFileSync(path, "utf8");

const relationType = `export interface CharacterRelationItem {
  id: number;
  characterId: number;
  relatedCharacterId: number | null;
  category: "family" | "friend" | "enemy";
  relationType: string | null;
  name: string;
  nameJa: string | null;
  image: string | null;
  slug: string | null;
  description: string | null;
  sortOrder: number;
}
`;

const relationFn = `
export async function getShenronCharacterRelations(
  characterId: number,
): Promise<CharacterRelationItem[]> {
  try {
    const rows = await db.execute<{
      id: number;
      character_id: number;
      related_character_id: number | null;
      category: string;
      relation_type: string | null;
      name: string;
      name_ja: string | null;
      image: string | null;
      slug: string | null;
      description: string | null;
      sort_order: number;
    }>(
      sql\`SELECT id, character_id, related_character_id, category, relation_type, name, name_ja, image, slug, description, sort_order
          FROM bot.db_character_relations
          WHERE character_id = \${characterId} AND visible = true
          ORDER BY sort_order ASC, id ASC\`
    );
    return rows.map((r) => ({
      id: Number(r.id),
      characterId: Number(r.character_id),
      relatedCharacterId: r.related_character_id ? Number(r.related_character_id) : null,
      category: (r.category as "family" | "friend" | "enemy") || "friend",
      relationType: r.relation_type,
      name: r.name,
      nameJa: r.name_ja,
      image: r.image,
      slug: r.slug,
      description: r.description,
      sortOrder: Number(r.sort_order),
    }));
  } catch (e) {
    console.error("[shenron] getShenronCharacterRelations a échoué:", e);
    return [];
  }
}
`;

const target = "export async function getShenronCharacterVariants(";
if (!code.includes("getShenronCharacterRelations")) {
  code = code.replace(target, relationType + relationFn + "\n" + target);
  writeFileSync(path, code, "utf8");
  console.log("Added getShenronCharacterRelations to shenron.ts");
} else {
  console.log("Already added");
}
