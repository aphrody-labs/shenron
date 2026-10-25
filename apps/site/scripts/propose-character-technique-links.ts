#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";
import { DEFAULT_PUBLIC_ORIGINS } from "@aphrody/shenron-config/public-urls";
import { wikiUpdateSnapshotHash } from "../src/lib/wiki-update-precondition";

const origin = DEFAULT_PUBLIC_ORIGINS.site;
const positiveId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const text = (max: number) => z.string().trim().min(1).max(max);
const primaryUrl = z
  .string()
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        !url.port &&
        url.href === value &&
        ((url.hostname === "dragonballfr.com" &&
          /^\/wiki\/(manga|databooks)(\/|$)/.test(url.pathname)) ||
          ([
            "en.dragon-ball-official.com",
            "fr.dragon-ball-official.com",
            "dragon-ball-official.com",
          ].includes(url.hostname) &&
            url.pathname.startsWith("/news/"))) &&
        ![...url.searchParams.keys()].some((key) =>
          /token|auth|secret|signature|credential|api.?key/i.test(key),
        )
      );
    } catch {
      return false;
    }
  });
const evidence = z
  .object({
    kind: z.enum(["manga-scan", "official-editorial"]),
    continuity: z.literal("manga"),
    chapter: positiveId,
    url: primaryUrl,
    title: text(300),
    locator: text(1000),
    attests: z.literal("character-uses-technique"),
    reviewed: z.literal(true),
  })
  .strict();
const candidate = z
  .object({
    characterId: positiveId,
    techniqueId: positiveId,
    expectedCharacterName: text(200),
    expectedTechniqueName: text(200),
    expectedTechniqueType: text(100),
    references: z.array(evidence).min(1).max(12),
    dependentVariantIds: z.array(positiveId).max(50).default([]),
  })
  .strict();
const manifestSchema = z.object({ candidates: z.array(candidate).min(1).max(100) }).strict();
export type CharacterTechniqueCandidate = z.infer<typeof candidate>;
type Row = Record<string, unknown>;
export type CharacterTechniqueSnapshots = {
  origin: string;
  observedAt: string;
  characters: Record<string, Row>;
  techniques: Record<string, Row>;
  relations: Record<
    string,
    { rows: Array<{ characterId: number; techniqueId: number }>; total: number }
  >;
};
const GAME_TYPES = new Set([
  "super",
  "ultimate",
  "evasive",
  "awoken",
  "super_soul",
  "strike_super",
  "ki_blast_super",
  "strike_ultimate",
  "ki_blast_ultimate",
]);

/** This module only proposes requests. It has no mutation or apply capability. */
export function proposeCharacterTechniqueLinks(
  input: unknown,
  snapshots: CharacterTechniqueSnapshots,
) {
  const manifest = manifestSchema.parse(input);
  if (snapshots.origin !== origin || !Number.isFinite(Date.parse(snapshots.observedAt)))
    throw new Error("Invalid official administrative snapshot provenance");
  const seen = new Set<string>();
  const proposals = manifest.candidates.map((entry) => {
    const blockers: string[] = [];
    const key = `${entry.characterId},${entry.techniqueId}`;
    if (seen.has(key)) blockers.push("duplicate_candidate");
    seen.add(key);
    const character = snapshots.characters[entry.characterId];
    const technique = snapshots.techniques[entry.techniqueId];
    const relationSnapshot = snapshots.relations[entry.characterId];
    const relations = relationSnapshot?.rows;
    if (!character || Number(character.id) !== entry.characterId)
      blockers.push("character_snapshot_missing_or_mismatched");
    else if (character.name !== entry.expectedCharacterName || character.visible !== true)
      blockers.push("character_identity_or_visibility_drifted");
    if (!technique || Number(technique.id) !== entry.techniqueId)
      blockers.push("technique_snapshot_missing_or_mismatched");
    else {
      if (
        technique.name !== entry.expectedTechniqueName ||
        technique.type !== entry.expectedTechniqueType ||
        technique.visible !== true
      )
        blockers.push("technique_identity_type_or_visibility_drifted");
      if (typeof technique.type !== "string" || GAME_TYPES.has(technique.type.toLowerCase()))
        blockers.push("game_skill_identity_requires_separate_review");
    }
    if (
      !Array.isArray(relations) ||
      relationSnapshot.total !== relations.length ||
      relations.some(
        (row) =>
          row.characterId !== entry.characterId ||
          !Number.isSafeInteger(row.techniqueId) ||
          row.techniqueId <= 0,
      )
    )
      blockers.push("complete_character_relations_snapshot_required");
    const linked =
      Array.isArray(relations) && relations.some((row) => row.techniqueId === entry.techniqueId);
    const status = blockers.length
      ? "blocked"
      : linked
        ? "already-linked"
        : "proposed-not-executed";
    return {
      characterId: entry.characterId,
      techniqueId: entry.techniqueId,
      status,
      blockers,
      observedAt: snapshots.observedAt,
      snapshots: {
        characterSha256: character ? wikiUpdateSnapshotHash(character) : null,
        techniqueSha256: technique ? wikiUpdateSnapshotHash(technique) : null,
        relationsSha256: Array.isArray(relations) ? wikiUpdateSnapshotHash({ relations }) : null,
      },
      references: entry.references,
      request:
        status === "proposed-not-executed"
          ? {
              method: "POST",
              url: `${origin}/api/wiki-admin/db_character_techniques`,
              body: { characterId: entry.characterId, techniqueId: entry.techniqueId },
            }
          : null,
      verification: {
        beforeApply: [
          `${origin}/api/wiki-admin/db_characters/${entry.characterId}`,
          `${origin}/api/wiki-admin/db_techniques/${entry.techniqueId}`,
          `${origin}/api/wiki-admin/db_character_techniques?as=byParent&col=characterId&id=${entry.characterId}`,
        ],
        afterApply: `${origin}/api/wiki-admin/db_character_techniques/${key}`,
        audit: "/admin/wiki/history: check the exact characterId:techniqueId creation revision",
      },
      dependentVariants: entry.dependentVariantIds.map((id) => ({
        id,
        status: "blocked-until-relationship-created-and-read-back",
      })),
    };
  });
  return {
    mode: "proposal-only",
    productionWrites: 0,
    proposals,
    limitations: [
      "A primary source must attest this character using this exact technique; the planner validates the reviewed manifest, not the truth of the scan.",
      "A matching name or game moveset never establishes a manga relationship. Technique creatorId is not changed.",
      "The generic relation POST accepts only the two IDs, without atomic source snapshots or per-link reference fields. Revalidate all three administrative reads before a separately authorized operation; this tool never applies.",
      "Dependent variant techniqueIds are separate reviewed edits and remain blocked until independent relationship read-back.",
    ],
  };
}

/** Read only GET responses from the fixed official origin; never follow credentials across redirects. */
export async function readCharacterTechniqueSnapshots(
  input: unknown,
  credential: string,
  fetcher: typeof fetch = fetch,
): Promise<CharacterTechniqueSnapshots> {
  const manifest = manifestSchema.parse(input);
  if (!credential.trim()) throw new Error("Authorized administrative credential unavailable");
  const snapshots: CharacterTechniqueSnapshots = {
    origin,
    observedAt: new Date().toISOString(),
    characters: {},
    techniques: {},
    relations: {},
  };
  const read = async (path: string) => {
    const response = await fetcher(`${origin}/api/wiki-admin/${path}`, {
      method: "GET",
      headers: { authorization: `Bearer ${credential}` },
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok)
      throw new Error(`Administrative snapshot unavailable (HTTP ${response.status})`);
    return response.json();
  };
  for (const id of new Set(manifest.candidates.map((entry) => entry.characterId))) {
    snapshots.characters[id] = await read(`db_characters/${id}`);
    const children = await read(`db_character_techniques?as=byParent&col=characterId&id=${id}`);
    if (!Array.isArray(children.rows) || children.total !== children.rows.length)
      throw new Error("Incomplete character-technique administrative snapshot");
    snapshots.relations[id] = { rows: children.rows, total: children.total };
  }
  for (const id of new Set(manifest.candidates.map((entry) => entry.techniqueId)))
    snapshots.techniques[id] = await read(`db_techniques/${id}`);
  return snapshots;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const allowed = new Set(["--manifest", "--snapshots", "--out", "--live"]);
  const options = new Map<string, string>();
  let live = false;
  for (let index = 0; index < args.length; index++) {
    const flag = args[index]!;
    if (!allowed.has(flag) || options.has(flag))
      throw new Error(
        "Expected --manifest, --out and exactly one of --snapshots or --live; no apply option exists",
      );
    if (flag === "--live") {
      if (live) throw new Error("Duplicate --live");
      live = true;
      continue;
    }
    const value = args[++index];
    if (!value || value.startsWith("--")) throw new Error("Missing proposal option value");
    options.set(flag, value);
  }
  const manifestPath = options.get("--manifest");
  const output = options.get("--out");
  if (!manifestPath || !output || live === options.has("--snapshots"))
    throw new Error("Manifest, output and exactly one snapshot source required");
  if (output === manifestPath || output === options.get("--snapshots"))
    throw new Error("Proposal output must not overwrite its input snapshots or manifest");
  const input = await Bun.file(manifestPath).json();
  let report: unknown;
  try {
    const snapshots = live
      ? await readCharacterTechniqueSnapshots(input, process.env.SHENRON_ADMIN_TOKEN ?? "")
      : await Bun.file(options.get("--snapshots")!).json();
    report = proposeCharacterTechniqueLinks(input, snapshots);
  } catch (error) {
    report = {
      mode: "proposal-only",
      productionWrites: 0,
      status: "blocked",
      error:
        error instanceof z.ZodError
          ? "invalid_reviewed_manifest"
          : error instanceof Error &&
              error.message === "Authorized administrative credential unavailable"
            ? "administrative_credential_unavailable"
            : "administrative_snapshot_unavailable_or_invalid",
    };
    process.exitCode = 1;
  }
  await Bun.write(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ output, mode: "proposal-only", productionWrites: 0 }));
}
