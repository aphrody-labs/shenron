#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Extrait d'un dump complet du cluster Supabase local (`pg_dumpall`, texte) le seul schéma
 * `aphrody_ai` du RAG (documents, vecteurs, index, déclencheurs, droits) : de quoi reconstruire
 * la base du calcul d'Aphrody sur un PostgreSQL 16 avec pgvector, sans le reste de Supabase.
 *
 *   bun scripts/ops/extract-rag-schema.ts <dump.sql> <sortie.sql>
 *
 * Voir docs/operations/compute-rag.md pour la restauration complète. Le dump et la sortie sont
 * des données privées : jamais dans Git.
 */
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

const [source, target] = process.argv.slice(2);
if (!source || !target) throw new Error("usage: extract-rag-schema.ts <dump.sql> <sortie.sql>");

const out = Bun.file(target).writer();
out.write(
  "SET client_encoding='UTF8';\nSET standard_conforming_strings=on;\n" +
    "CREATE EXTENSION IF NOT EXISTS vector;\nCREATE EXTENSION IF NOT EXISTS pg_trgm;\n" +
    "CREATE SCHEMA IF NOT EXISTS extensions;\nCREATE SCHEMA aphrody_ai;\n",
);

const isHeader = (line: string) => /^-- (Name|Data for Name): /.test(line);
const isRagBlock = (line: string) =>
  /^-- (Name|Data for Name): .*Schema: aphrody_ai;/.test(line) ||
  /^-- Name: SCHEMA aphrody_ai; Type: ACL/.test(line);

let capturing = false;
let inCopy = false;
let held: string | null = null;
let blocks = 0;
let copies = 0;
const lines = createInterface({ input: createReadStream(source), crlfDelay: Infinity });
for await (const line of lines) {
  if (inCopy) {
    out.write(`${line}\n`);
    if (line === "\\.") inCopy = false;
    continue;
  }
  if (!capturing) {
    if (isRagBlock(line)) {
      capturing = true;
      blocks++;
      out.write(`--\n${line}\n`);
    }
    continue;
  }
  if (held !== null) {
    if (isHeader(line)) {
      held = null;
      capturing = isRagBlock(line);
      if (capturing) {
        blocks++;
        out.write(`--\n${line}\n`);
      }
      continue;
    }
    out.write(`${held}\n`);
    held = null;
  }
  if (line === "--") {
    held = line;
    continue;
  }
  out.write(`${line}\n`);
  if (/^COPY aphrody_ai\./.test(line)) {
    inCopy = true;
    copies++;
  }
}
await out.end();
console.log(`${blocks} blocs, ${copies} tables copiées → ${target}`);
