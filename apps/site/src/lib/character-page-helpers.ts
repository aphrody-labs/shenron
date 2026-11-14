import type { DEFAULT_POWER_SCALING_CONFIG } from "@/lib/canon-engine";

export type OfficialBattlePower = (typeof DEFAULT_POWER_SCALING_CONFIG)["officialBps"][number];

export interface CharacterVersionCandidate {
  id: number;
  name: string;
  slug: string;
  label?: string | null;
  isMain?: boolean;
  seriesGroup?: string;
}

export interface GokuIdentityLabels {
  xenoGoku: string;
  gokuCc: string;
  gokuFusion: string;
  gokuJumpForce: string;
}

/**
 * Strips version suffixes from character names so sibling continuities resolve
 * to a single root identity ("Son Goku (Xeno)" / "Son Gokû God Fusion" -> "Son Goku").
 */
export function stripCharacterVersionSuffix(name: string): string {
  return name.replace(/(?:\s+god\s+fusion|\s*\([^)]*\))+\s*$/i, "").trim();
}

/**
 * Normalizes a character or saga label into an accent-free alphanumeric token
 * while ignoring standalone "saga" / "arc" prefixes.
 */
export function normalizeCharacterVersionLabel(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\b(?:saga|arc)\b/g, " ")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Returns true only when a variant form string describes a transformed-only
 * state rather than a base form or a multi-form summary starting from base.
 */
export function isTransformedCharacterForm(value: string | null | undefined): boolean {
  const form = value
    ?.normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
  if (!form) return false;
  if (/^(?:base|forme de base|normal)\b/.test(form)) return false;
  return /super saiyan|super guerrier|\bssj\b|ultra instinct|instinct superieur|great ape|ozaru|kaio.?ken|kaioken|golden great ape|forme bestiale/i.test(
    form,
  );
}

function transformationProgressionRank(item: { name: string; slug: string }): number {
  const token = `${item.slug} ${item.name}`
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

  if (/golden.?great.?ape|ozaru.?dore|singe.?geant.?dore|黄金大猿/.test(token)) return 60;
  if (/great.?ape|ozaru|grand.?singe|大猿/.test(token)) return 10;
  if (/faux.?super.?saiyan|pseudo.?super.?saiyan|false.?super.?saiyan/.test(token)) return 20;
  if (/^(?:kaio.?ken|kaioken)\b/.test(token.trim())) return 25;

  if (/ultra.?instinct|instinct.?superieur|migatte|身勝手/.test(token)) {
    if (/sign|omen|premices|兆/.test(token)) return 100;
    return 110;
  }
  if (/ultra.?ego|wagamama|beast|bestiale|orange|black.?freez/.test(token)) return 120;

  if (/super.?saiyan.?blue|ssgss|super.?saiyan.?god.?super.?saiyan|\bssb\b|ブルー/.test(token)) {
    if (/kaio.?ken|kaioken|evolution|evolved|shinka/.test(token)) return 92;
    return 90;
  }
  if (/super.?saiyan.?rose|\bssr\b|ロゼ/.test(token)) return 94;
  if (/super.?saiyan.?god|\bssg\b|ゴッド/.test(token)) return 80;

  if (/super.?saiyan.?4|\bssj\s*4\b|超サイヤ人4/.test(token)) {
    if (/full.?power|limit.?breaker|pleine.?puissance/.test(token)) return 72;
    return 70;
  }
  if (/potentiel|ultimate|mystic/.test(token)) return 55;
  if (/super.?saiyan.?3|\bssj\s*3\b|超サイヤ人3/.test(token)) return 50;
  if (/super.?saiyan.?2|\bssj\s*2\b|超サイヤ人2/.test(token)) return 40;
  if (/dai.?ni.?dankai|dai.?san.?dankai|super.?vegeta|grade\s*[23]|full.?power/.test(token)) {
    return 32;
  }
  if (/super.?saiyan|super.?guerrier|\bssj\s*1?\b|超サイヤ人/.test(token)) return 30;

  return 999;
}

/**
 * Sorts character transformations in canonical narrative/progression order
 * with deterministic ID tie-breaking.
 */
export function sortCharacterTransformations<T extends { id: number; name: string; slug: string }>(
  items: readonly T[],
): T[] {
  return items.toSorted(
    (left, right) =>
      transformationProgressionRank(left) - transformationProgressionRank(right) ||
      left.id - right.id,
  );
}

function classifyGokuIdentityKind(
  candidate: Pick<CharacterVersionCandidate, "name" | "label">,
): "main" | "xeno" | "cc" | "fusion" | "jumpforce" | null {
  const rootToken = normalizeCharacterVersionLabel(stripCharacterVersionSuffix(candidate.name));
  if (rootToken !== "songoku") return null;
  const fullToken = normalizeCharacterVersionLabel(`${candidate.name} ${candidate.label ?? ""}`);
  if (fullToken === "songoku") return "main";
  if (fullToken.includes("xeno")) return "xeno";
  if (fullToken.includes("jumpforce")) return "jumpforce";
  if (fullToken.includes("cc")) return "cc";
  if (fullToken.includes("fusion")) return "fusion";
  return null;
}

const GOKU_IDENTITY_ORDER: Record<"main" | "xeno" | "cc" | "fusion" | "jumpforce", number> = {
  main: 0,
  xeno: 1,
  cc: 2,
  fusion: 3,
  jumpforce: 4,
};

/**
 * Merges explicit continuity rows with prefix-matched character versions so
 * Goku's 4 separate identities (Xeno, CC, Fusion, Jump Force) and main Son Goku
 * remain reachable even before continuity rows are populated, while preserving
 * non-Goku alternate versions (e.g. Future Trunks).
 */
export function buildCharacterLiveVersionChoices({
  currentCharacter,
  continuities,
  versions,
  gokuLabels,
}: {
  currentCharacter: { id: number; name: string; slug: string };
  continuities: readonly CharacterVersionCandidate[];
  versions: readonly Pick<CharacterVersionCandidate, "id" | "name" | "slug">[];
  gokuLabels: GokuIdentityLabels;
}): CharacterVersionCandidate[] {
  const mergedById = new Map<number, CharacterVersionCandidate>();
  for (const item of continuities) {
    mergedById.set(item.id, {
      id: item.id,
      name: item.name,
      slug: item.slug,
      label: item.label ?? null,
      isMain: item.isMain ?? false,
    });
  }
  for (const item of versions) {
    if (!mergedById.has(item.id)) {
      mergedById.set(item.id, {
        id: item.id,
        name: item.name,
        slug: item.slug,
        label: null,
        isMain: false,
      });
    }
  }

  const currentRoot = normalizeCharacterVersionLabel(
    stripCharacterVersionSuffix(currentCharacter.name),
  );
  const isGokuFamily = currentRoot === "songoku";
  const isGokuMain = normalizeCharacterVersionLabel(currentCharacter.name) === "songoku";

  if (!isGokuFamily) {
    return [...mergedById.values()].filter((choice) => choice.id !== currentCharacter.id);
  }

  const resolved: Array<{
    order: number;
    choice: CharacterVersionCandidate;
  }> = [];

  for (const candidate of mergedById.values()) {
    const kind = classifyGokuIdentityKind(candidate);
    if (!kind) continue;
    if (isGokuMain && kind === "main") continue;

    if (kind === "main") {
      resolved.push({
        order: GOKU_IDENTITY_ORDER.main,
        choice: {
          id: candidate.id,
          name: candidate.name,
          slug: candidate.slug,
          label: candidate.name,
          isMain: true,
        },
      });
      continue;
    }

    const displayName =
      kind === "xeno"
        ? gokuLabels.xenoGoku
        : kind === "cc"
          ? gokuLabels.gokuCc
          : kind === "fusion"
            ? gokuLabels.gokuFusion
            : gokuLabels.gokuJumpForce;

    resolved.push({
      order: GOKU_IDENTITY_ORDER[kind],
      choice: {
        id: candidate.id,
        name: displayName,
        slug: candidate.slug,
        label: displayName,
        isMain: false,
      },
    });
  }

  return resolved
    .toSorted((left, right) => left.order - right.order || left.choice.id - right.choice.id)
    .map((entry) => entry.choice);
}

/**
 * Official Goku early-era and Raditz-unweighted battle powers verified directly
 * on DBFR's transcribed Daizenshuu 7 (databook #4, plates 76 & 78) and
 * Chōzenshū 4 (databook #19, plate 30), plus Manga Chapter 199.
 */
const GOKU_SUPPLEMENTAL_OFFICIAL_BPS: ReadonlyArray<{
  sagaTokens: readonly string[];
  reading: OfficialBattlePower;
}> = [
  {
    sagaTokens: ["bardock"],
    reading: {
      character: "Son Goku",
      characterId: 1,
      saga: "Saga Bardock",
      state: "Nouveau-né sur la planète Vegeta",
      bp: 2,
      scouter: true,
      source: "TV Special Bardock · Daizenshuu 7 (pl. 76)",
      canonTier: "EXTENSION_OFFICIELLE",
    },
  },
  {
    sagaTokens: ["pilaf", "depilaf"],
    reading: {
      character: "Son Goku",
      characterId: 1,
      saga: "Saga de Pilaf",
      state: "Première apparition",
      bp: 10,
      scouter: false,
      source: "Daizenshuu 7 (pl. 78) · Chōzenshū 4 (pl. 30)",
      canonTier: "EXTENSION_OFFICIELLE",
    },
  },
  {
    sagaTokens: ["pilaf", "depilaf"],
    reading: {
      character: "Son Goku",
      characterId: 1,
      saga: "Saga de Pilaf",
      state: "Ōzaru (Grand Singe, x10)",
      bp: 100,
      scouter: false,
      source: "Chōzenshū 4 (pl. 30) · Daizenshuu 7",
      canonTier: "EXTENSION_OFFICIELLE",
    },
  },
  {
    sagaTokens: ["22etournoi", "22etenkaichibudokai", "tournament22b", "tournament22"],
    reading: {
      character: "Son Goku",
      characterId: 1,
      saga: "22e Tenkaichi Budōkai",
      state: "22e Tenkaichi Budōkai (face à Tenshinhan)",
      bp: 180,
      scouter: false,
      source: "Daizenshuu 7 (pl. 78) · Chōzenshū 4 (pl. 30)",
      canonTier: "EXTENSION_OFFICIELLE",
    },
  },
  {
    sagaTokens: ["piccolodaimao", "roipiccolo"],
    reading: {
      character: "Son Goku",
      characterId: 1,
      saga: "Piccolo Daimaō",
      state: "Après l'Eau Divine (face à Piccolo Daimaō)",
      bp: 260,
      scouter: false,
      source: "Daizenshuu 7 (pl. 78) · Chōzenshū 4 (pl. 30)",
      canonTier: "EXTENSION_OFFICIELLE",
    },
  },
  {
    sagaTokens: ["saiyan", "saiyans"],
    reading: {
      character: "Son Goku",
      characterId: 1,
      saga: "Saga Saiyan",
      state: "Sans vêtements lourds (face à Raditz)",
      bp: 416,
      scouter: true,
      source: "Manga Ch. 199 · Chōzenshū 4 (pl. 30)",
      canonTier: "CANON_ABSOLU",
    },
  },
];

function canonicalSagaToken(raw: string): string {
  const token = normalizeCharacterVersionLabel(raw);
  if (token === "saiyans") return "saiyan";
  if (token === "sagafreezer" || token === "frieza") return "freezer";
  return token;
}

function isFreezerPhaseReading(reading: OfficialBattlePower): boolean {
  if (reading.bp >= 530_000) return true;
  const stateToken = normalizeCharacterVersionLabel(`${reading.character} ${reading.state}`);
  return stateToken.includes("freezer") || stateToken.includes("frieza") || reading.bp === 42_000;
}

/**
 * Resolves official scouter and databook battle power readings for a specific
 * character saga variant, normalizing "Saga Saiyans" <-> "Saga Saiyan" and
 * splitting Namek arrival/Ginyu readings from Freezer final duel readings when
 * the character has a dedicated Freezer saga variant.
 */
export function resolveCharacterSagaOfficialReadings({
  characterId,
  characterName,
  variantSagaName,
  variantSagaSlug,
  hasSeparateFreezerSaga,
  officialBps,
}: {
  characterId: number;
  characterName: string;
  variantSagaName: string;
  variantSagaSlug?: string | null;
  hasSeparateFreezerSaga: boolean;
  officialBps: readonly OfficialBattlePower[];
}): OfficialBattlePower[] {
  const characterToken = normalizeCharacterVersionLabel(characterName);
  const variantNameToken = canonicalSagaToken(variantSagaName);
  const variantSlugToken = variantSagaSlug ? canonicalSagaToken(variantSagaSlug) : "";
  const candidateTokens = new Set([variantNameToken, variantSlugToken].filter(Boolean));

  const matched = officialBps.filter((reading) => {
    const belongsToCharacter =
      reading.characterId === characterId ||
      (!reading.characterId &&
        normalizeCharacterVersionLabel(reading.character) === characterToken);
    if (!belongsToCharacter) return false;

    const readingSagaToken = canonicalSagaToken(reading.saga);
    if (readingSagaToken === "namek" && hasSeparateFreezerSaga) {
      const freezerPhase = isFreezerPhaseReading(reading);
      if (candidateTokens.has("freezer")) return freezerPhase;
      if (candidateTokens.has("namek")) return !freezerPhase;
    }

    return candidateTokens.has(readingSagaToken);
  });

  const isMainGoku = characterId === 1 || characterToken === "songoku";
  if (!isMainGoku) return matched;

  const extras = GOKU_SUPPLEMENTAL_OFFICIAL_BPS.filter(({ sagaTokens }) =>
    sagaTokens.some((token) => candidateTokens.has(token)),
  ).map(({ reading }) => reading);

  if (extras.length === 0) return matched;

  const combined = [...matched];
  for (const extra of extras) {
    if (combined.some((item) => item.bp === extra.bp && item.state === extra.state)) continue;
    combined.push(extra);
  }
  return combined.toSorted((left, right) => left.bp - right.bp);
}

/**
 * Routes a character content panel into one of the four agreed public tabs
 * ("history", "relations", "powers", "additional"), ensuring power-scaling
 * headings containing "niveaux de combat" land in "powers" rather than "history".
 */
export function classifyCharacterProfileBucket(
  key: string,
  label: string,
  group?: string | null,
): "history" | "relations" | "powers" | "additional" {
  const identity = `${key} ${label}`.toLocaleLowerCase();
  const fullIdentity = `${identity} ${(group ?? "").toLocaleLowerCase()}`;

  if (/relation|famille|family|ennemi|enemy|ami|friend/.test(identity)) {
    return "relations";
  }
  if (
    /pouvoir|power|puissance|scaling|multiplicateur|kiri|forme|form|technique|transformation|absorption|\bpws\b/.test(
      fullIdentity,
    )
  ) {
    return "powers";
  }
  if (/histoire|history|chronolog|combat|fight/.test(identity)) {
    return "history";
  }
  return "additional";
}
