#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/** Explicit one-note private job. All retrieval and embedding stay with their existing owners. */
import { chmodSync, closeSync, existsSync, mkdirSync, openSync, renameSync } from "node:fs";
import { join } from "node:path";
import { createLocalApi } from "../../packages/api/src/host";
import { openShenronVfs } from "../../packages/db/src/vfs";
import type { RagHit } from "../../packages/db/src/vfs/rag";
import { createAphrodyCompute, type AphrodyCompute } from "../../packages/pipeline/src/ai/aphrody";
import {
  requireAiHttpToken,
  requireAiHttpUrl,
  SHENRON_E5,
} from "../../packages/pipeline/src/ai/config";
import { prepareNativeNoteImport } from "./agent-home-native-note";
import {
  chunkReviewedMarkdown,
  indexPrivateNotes,
  privateQueryEmbedder,
  type PrivateVectorOptions,
} from "./agent-home-notes-index";
import { ownedDirectory, resolveNotesHome, sha256 } from "./agent-home-notes";

interface PrivateVectorJob {
  home: string;
  baseline: string;
  manifest: string;
  receipt: string;
  ownerConfigContainer: string;
  expected: PrivateVectorOptions["expected"];
}
const probes = [
  {
    id: "nail-paraphrase",
    query: "Réunion de deux combattants verts sur une planète lointaine, sans mutation orangée.",
    expected: "Nail",
  },
  {
    id: "masenko-paraphrase",
    query:
      "Le très jeune élève du guerrier vert déclenche un rayon et affiche deux mille huit cents unités.",
    expected: "Masenko",
  },
  {
    id: "unrelated-lemon-cake",
    query: "Donne une recette de gâteau au citron avec farine et levure.",
    expected: null,
  },
  {
    id: "unrelated-wifi-router",
    query: "Configurer routeur Wi-Fi : canal radio, WPA3 et adresse réseau.",
    expected: null,
  },
] as const;

async function privateWrite(path: string, value: unknown) {
  const temporary = path + ".tmp";
  if (existsSync(temporary)) throw new Error("Private receipt temporary already exists");
  const descriptor = openSync(temporary, "wx", 0o600);
  closeSync(descriptor);
  await Bun.write(temporary, JSON.stringify(value, null, 2) + "\n");
  renameSync(temporary, path);
}
function ownerCompute(container: string): AphrodyCompute {
  if (!/^[a-zA-Z0-9_.-]+$/.test(container))
    throw new Error("Invalid owner configuration container");
  const p = Bun.spawnSync(["docker", "inspect", container], { stdout: "pipe", stderr: "pipe" });
  if (p.exitCode) throw new Error("Owner configuration unavailable");
  const config = JSON.parse(p.stdout.toString())[0];
  const env = Object.fromEntries(
    config.Config.Env.map((entry: string) => {
      const at = entry.indexOf("=");
      return [entry.slice(0, at), entry.slice(at + 1)];
    }),
  );
  const baseUrl = requireAiHttpUrl(env);
  if (!["127.0.0.1", "localhost", "[::1]", "::1"].includes(baseUrl.hostname))
    throw new Error("Private vector job only permits the configured loopback owner API");
  return createAphrodyCompute({ baseUrl, token: requireAiHttpToken(env) });
}
function metadata(hit: RagHit, expected: string | null) {
  return {
    chunkId: hit.chunkId,
    entityId: hit.entityId,
    contentSha256: sha256(hit.content),
    score: hit.score,
    similarity: hit.similarity,
    lexicalRank: hit.lexicalRank,
    vectorRank: hit.vectorRank,
    expectedTokenPresent: expected ? hit.content.includes(expected) : false,
  };
}

export async function runPrivateVectorJob(job: PrivateVectorJob) {
  const home = resolveNotesHome(job.home);
  if (job.expected.chunks !== 9 || job.expected.chunkSha256?.length !== 9)
    throw new Error("Reviewed job requires exactly nine frozen chunks");
  if (await Bun.file(job.receipt).exists())
    throw new Error("Private job receipt exists; inspect before rerun");
  const reviewed = await prepareNativeNoteImport({
    home,
    manifestPath: job.manifest,
    expectedSourceSha256: job.expected.sourceSha256,
    expectedManifestSha256: job.expected.manifestSha256,
  });
  if (reviewed.noteId !== job.expected.noteId || reviewed.attachments.length !== 24)
    throw new Error("Reviewed one-note job or archive scope differs");
  if (sha256(await Bun.file(job.baseline).arrayBuffer()) !== job.expected.indexSha256)
    throw new Error("Lexical baseline SHA differs");
  const baseline = openShenronVfs(job.baseline, { readOnly: true });
  try {
    const stats = baseline.rag.stats();
    const baselineChunks = baseline.vfs.query<{ content: string }>(
      "SELECT content FROM chunks ORDER BY chunk_index",
    );
    if (
      JSON.stringify(baselineChunks.map((chunk) => sha256(chunk.content))) !==
      JSON.stringify(job.expected.chunkSha256)
    )
      throw new Error("Frozen lexical chunks differ");
    if (
      stats.docs !== 1 ||
      stats.chunks !== 9 ||
      stats.vectorsF32 ||
      stats.vectorsI8 ||
      sha256(baseline.vfs.readTextSync(`/home/memory/${job.expected.noteId}.md`)) !==
        job.expected.sourceSha256
    )
      throw new Error("Lexical baseline is not the exact approved private one-note snapshot");
    if (
      baseline.vfs.query<{ n: number }>(
        "SELECT count(*) AS n FROM rag_doc_attrs WHERE visibility<>'private' OR corpus<>'home'",
      )[0]!.n
    )
      throw new Error("Baseline includes non-private rows");
    const output = join(home, "notes", "private-notes-vfs.sqlite");
    ownedDirectory(home, output);
    if (!(await Bun.file(output).exists())) {
      mkdirSync(join(home, "notes"), { recursive: true, mode: 0o700 });
      const temporary = output + ".baseline.tmp";
      const descriptor = openSync(temporary, "wx", 0o600);
      closeSync(descriptor);
      await Bun.write(temporary, Bun.file(job.baseline));
      renameSync(temporary, output);
    }
    if (sha256(await Bun.file(output).arrayBuffer()) !== job.expected.indexSha256)
      throw new Error("Current private index changed before job");
    chmodSync(output, 0o600);
    const owner = ownerCompute(job.ownerConfigContainer);
    let passageRequests = 0;
    let queryRequests = 0;
    const compute: Pick<AphrodyCompute, "embed"> = {
      embed: async (input) => {
        if (input.requireModel !== SHENRON_E5.modelId)
          throw new Error("Private embedding must require the exact qualified model");
        if (input.kind === "passage") {
          if (++passageRequests !== 1 || input.texts.length !== 9)
            throw new Error("Private job permits one passage batch of nine");
        } else if (++queryRequests > 5 || input.texts.length !== 1)
          throw new Error("Private query probe budget exceeded");
        return owner.embed(input);
      },
    };
    const embed = privateQueryEmbedder(compute);
    const measurements: unknown[] = [];
    let http: unknown;
    const indexed = await indexPrivateNotes(home, true, chunkReviewedMarkdown, {
      compute,
      expected: job.expected,
      beforePublish: async (opened) => {
        for (const probe of probes) {
          const lexical = baseline.rag.search(probe.query, { limit: 9 });
          const vector = await embed(probe.query);
          const hits = opened.rag.search(probe.query, { embedding: vector, limit: 9 });
          const publicHits = opened.rag.search(probe.query, {
            embedding: vector,
            limit: 9,
            publicOnly: true,
          });
          if (publicHits.length) throw new Error("Private vector evidence appeared publicly");
          measurements.push({
            id: probe.id,
            query: probe.query,
            lexicalHits: lexical.length,
            hybridHits: hits.length,
            publicHits: 0,
            expectedToken: probe.expected,
            expectedRank: probe.expected
              ? hits.findIndex((hit) => hit.content.includes(probe.expected!)) + 1
              : null,
            top: hits.slice(0, 3).map((hit) => metadata(hit, probe.expected)),
            irrelevantHits: probe.expected === null ? hits.length : 0,
          });
        }
        const api = createLocalApi(
          {
            SHENRON_VFS_DB: opened.vfs.db.filename,
            RAG_BACKEND: "local",
            SHENRON_CHAT_BACKENDS: "extractive",
            SHENRON_CHAT_STORE: "off",
            SHENRON_MEMORY: "off",
            SHENRON_MEMORY_REMOTE: "off",
            SHENRON_VFS_OFFLINE: "1",
            APHRODY_WORKSPACE: home,
          },
          {
            conversations: null,
            memory: null,
            betterAuth: null,
            wiki: false,
            privateQueryEmbedding: { query: embed, model: SHENRON_E5.modelId },
          },
        );
        const server = Bun.serve({
          hostname: "127.0.0.1",
          port: 0,
          fetch: api.fetch,
          websocket: api.websocket,
        });
        try {
          const response = await fetch(new URL("/api/v1/chat", server.url), {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              message: probes[0].query,
              backend: "extractive",
              surface: "desktop",
              tools: false,
            }),
          });
          const body = await response.text();
          const homeCitation = body.includes('"source":"home"');
          if (response.status !== 200 || !homeCitation)
            throw new Error("Private semantic HTTP citation qualification failed");
          const publicResponse = await fetch(new URL("/api/public/rag/search?q=Nail", server.url));
          const publicBody = (await publicResponse.json()) as { results?: unknown[] };
          if (publicResponse.status !== 200 || publicBody.results?.length !== 0)
            throw new Error("Public RAG route exposed private evidence");
          http = {
            status: response.status,
            homeCitation,
            queryEmbedding: "existing Aphrody client",
            publicStatus: publicResponse.status,
            publicHits: 0,
            externalGeneration: false,
          };
        } finally {
          server.stop(true);
          await api.close();
        }
      },
    });
    const receipt = {
      status: "qualified-private-artifact",
      noteId: job.expected.noteId,
      sourceSha256: job.expected.sourceSha256,
      manifestSha256: job.expected.manifestSha256,
      lexicalBaselineSha256: job.expected.indexSha256,
      indexSha256: sha256(await Bun.file(indexed.output).arrayBuffer()),
      indexed,
      model: SHENRON_E5.modelId,
      dimensions: 384,
      passageRequests,
      queryRequests,
      measurements,
      http,
      negativeControlLimitation:
        "Nearest-neighbour retrieval may return irrelevant private passages for unrelated queries. No arbitrary score threshold was introduced; inspect negative controls before production use.",
      nativeMcpSemanticQualified: false,
      nativeHomeVectorsChanged: false,
      publicServicesReconfigured: false,
      completedAt: new Date().toISOString(),
    };
    await privateWrite(job.receipt, receipt);
    return receipt;
  } finally {
    baseline.vfs.db.close();
  }
}

if (import.meta.main) {
  const args = Bun.argv.slice(2);
  const at = args.indexOf("--job");
  if (at < 0 || !args[at + 1]) throw new Error("Provide a reviewed private --job JSON");
  const job = (await Bun.file(args[at + 1]!).json()) as PrivateVectorJob;
  if (!args.includes("--apply"))
    console.log(
      JSON.stringify({ mode: "prepared-only", expected: job.expected, privateCorpusSent: false }),
    );
  else {
    const receipt = await runPrivateVectorJob(job);
    console.log(
      JSON.stringify({
        status: receipt.status,
        noteId: receipt.noteId,
        vectors: receipt.indexed.vectors,
        passageRequests: receipt.passageRequests,
        queryRequests: receipt.queryRequests,
        publicServicesReconfigured: false,
      }),
    );
  }
}
