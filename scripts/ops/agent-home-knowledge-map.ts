#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { writeAtomicSync } from "../../packages/db/src/agent-homes/dir";
import { ownedDirectory, resolveNotesHome } from "./agent-home-notes";
import { readReviewedPrivateNotes } from "./agent-home-notes-index";

export function renderKnowledgeMap(
  notes: readonly { id: string; title: string; reviewedAt: string }[],
): string {
  const label = (text: string) =>
    text
      .replace(/[\r\n]/g, " ")
      .replaceAll("[", "(")
      .replaceAll("]", ")");
  return [
    "---",
    "visibility: private",
    "kind: knowledge-map",
    "canonical_evidence: false",
    "tags:",
    "  - shenron",
    "  - navigation",
    "---",
    "",
    "# Carte des connaissances privées",
    "",
    `Notes revues disponibles : ${notes.length}. Cette carte de navigation ne constitue pas une preuve canonique ni un second cerveau complet.`,
    "",
    "## Notes revues",
    "",
    ...(notes.length
      ? notes.map(
          (note) =>
            `- [${label(note.title)}](${note.id}.md) — revue ${note.reviewedAt.slice(0, 10)}`,
        )
      : ["Aucune note revue disponible."]),
    "",
    "## De la capture à la consultation",
    "",
    "1. Capturer une observation et sa continuité avec le scan original, son SHA-256, le localisateur et les limites. Conserver le brouillon dans notes/inbox, hors du corpus mémoire.",
    "2. Relire les faits depuis la source. Une image de candidat ou générée peut alimenter une note de qualité distincte, jamais une preuve canonique.",
    "3. Valider le manifeste privé et tous les SHA cités, puis archiver les originaux dans attachments. Toute correction conserve la provenance et compare le SHA de la version précédente.",
    "4. Promouvoir la note revue dans memory puis indexer par les propriétaires existants : VFS privé dérivé ou home natif sur une entrée dédiée et un label borné. Sauvegarder avant la mutation native.",
    "5. Vérifier le chemin exact du résultat et les citations du consommateur privé. Les configurations privées ne se transmettent ni au MCP public ni à un endpoint public. Une modification Obsidian exige une nouvelle revue avant réindexation.",
    "",
    "Les pièces ne sont pas indexées comme des faits ; les notes, leurs citations et leurs limites font foi. Cette carte reste hors du registre de preuves revues.",
    "",
  ].join("\n");
}

export async function writeKnowledgeMap(home: string, apply = false) {
  const notes = await readReviewedPrivateNotes(home);
  const path = join(home, "memory", "Knowledge-map.md");
  ownedDirectory(home, path);
  const markdown = renderKnowledgeMap(notes);
  if (apply) {
    const current = Bun.file(path);
    if (
      (await current.exists()) &&
      !(await current.text()).startsWith("---\nvisibility: private\nkind: knowledge-map\n")
    )
      throw new Error("Refuse to replace an unrelated vault note");
    mkdirSync(join(home, "memory"), { recursive: true, mode: 0o700 });
    writeAtomicSync(path, markdown);
  }
  return {
    mode: apply ? "written" : "preview",
    notes: notes.length,
    path,
    canonicalEvidence: false,
  };
}

if (import.meta.main) {
  const args = Bun.argv.slice(2);
  const at = args.indexOf("--home");
  console.log(
    JSON.stringify(
      await writeKnowledgeMap(
        resolveNotesHome(at >= 0 ? args[at + 1] : undefined),
        args.includes("--apply"),
      ),
      null,
      2,
    ),
  );
}
