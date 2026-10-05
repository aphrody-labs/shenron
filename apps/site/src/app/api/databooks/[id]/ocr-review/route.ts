/**
 * API Databooks — seconde lecture OCR d'une planche.
 *
 *   GET /api/databooks/:id/ocr-review?page=12   (admin connecté ou jeton)
 *
 * Ancienne adresse servie : `/api/databooks/:id/relecture-ocr?planche=12`.
 * Response: `page`, `noScan`, `unavailable`, `regions[].{text,score,box}`, `text`,
 * `seconds`, `cache`. The former French fields (`planche`, `sansScan`,
 * `indisponible`, `texte`, `secondes`, `regions[].{texte,boite}`) stay as
 * deprecated duplicates until 1.4.0.
 *
 * Le corpus est transcrit par dots.ocr, un modèle de vision autorégressif.
 * Cette route en fournit une **seconde lecture par un moteur d'une autre
 * famille** — détection + CRNN, sans génération — pour que le relecteur ait
 * deux avis devant les yeux plutôt qu'un seul et le scan à déchiffrer.
 *
 * Ce second moteur n'est pas « meilleur ». Il est utile parce que ses erreurs
 * ne sont pas les mêmes : son vocabulaire est **fermé** (86 hiragana,
 * 94 katakana, 15 565 kanji, zéro caractère arabe), donc il lui est
 * structurellement impossible de produire les intrusions d'alphabet qui
 * abîment 763 planches, ni les boucles dégénérées — rien n'y est généré jeton
 * par jeton. Là où il se trompe, il se trompe autrement, et c'est le
 * désaccord entre les deux lectures qui informe le relecteur.
 *
 * Il ne restitue en revanche **aucune mise en page** : ses régions sortent
 * dans l'ordre du détecteur, pas dans l'ordre de lecture japonais. C'est un
 * second avis, jamais un remplacement de la transcription — la route ne
 * propose donc aucun dépôt.
 *
 * Le travail réel est fait par `shenron-relecture-ocr.service`, résident sur
 * la boucle locale : charger les modèles coûte autant que lire une planche, et
 * un relecteur enchaîne les planches. Le service met en cache par empreinte du
 * scan, si bien qu'une planche déjà vue revient en quelques millisecondes.
 */
import { NextResponse } from "next/server";
import { isAdminUserOrToken } from "@/lib/admin-guard";
import { getDatabook } from "@/lib/databooks";
import { parseDatabookId } from "@/lib/databooks-rules";
import path from "node:path";
import { resolveRelectureOcrUrl } from "@shenron/config/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SERVICE = resolveRelectureOcrUrl(process.env);

/** Où vivent les scans : `./assets/wiki/...` en base, `public/wiki/...` sur disque. */
const RACINE_SCANS = path.join(process.cwd(), "public");

/** A region as the review service returns it (French field names). */
interface RegionLue {
  texte: string;
  score: number;
  boite: Array<[number, number]> | null;
}

/**
 * A region in the route response: `text` and `box`, with `texte` and `boite`
 * as deprecated duplicates until 1.4.0.
 */
function renderRegion(r: RegionLue) {
  return { text: r.texte, score: r.score, box: r.boite, texte: r.texte, boite: r.boite };
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAdminUserOrToken(req))) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  const id = parseDatabookId((await ctx.params).id);
  if (id === null) return NextResponse.json({ error: "Fiche introuvable." }, { status: 404 });

  const query = new URL(req.url).searchParams;
  const numero = Number(query.get("page") ?? query.get("planche"));
  if (!Number.isSafeInteger(numero) || numero <= 0) {
    return NextResponse.json({ error: "Numéro de planche invalide." }, { status: 400 });
  }

  const fiche = await getDatabook(id);
  if (!fiche) return NextResponse.json({ error: "Fiche introuvable." }, { status: 404 });

  const planche = fiche.pages.find((p) => p.number === numero);
  if (!planche) return NextResponse.json({ error: "Planche introuvable." }, { status: 404 });
  if (!planche.image) {
    // Sans scan il n'y a rien à relire, et ce n'est pas une erreur : beaucoup
    // d'emplacements existent avant que la page ne soit numérisée.
    return NextResponse.json({
      id,
      page: numero,
      noScan: true,
      regions: [],
      // Former names, deprecated.
      planche: numero,
      sansScan: true,
    });
  }

  // `./assets/wiki/databooks/x.jpg` → `<cwd>/public/wiki/databooks/x.jpg`.
  // Le service refuse de lui-même tout chemin sortant de `public/`, mais on ne
  // lui envoie que ce qu'on a construit nous-mêmes à partir de la base.
  const relatif = planche.image.replace(/^\.?\/*/, "").replace(/^assets\//, "");
  const absolu = path.join(RACINE_SCANS, relatif);

  let reponse: Response;
  try {
    reponse = await fetch(`${SERVICE}/lire`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ image: absolu }),
      // Une planche jamais lue prend quelques secondes ; une planche en
      // cache revient en millisecondes. Au-delà d'une minute, c'est que le
      // service est en peine — mieux vaut le dire que faire attendre.
      signal: AbortSignal.timeout(60_000),
    });
  } catch (e) {
    // Le service est optionnel : son absence ne doit pas casser la relecture,
    // seulement retirer le second avis.
    return NextResponse.json(
      {
        id,
        page: numero,
        unavailable: true,
        detail: e instanceof Error ? e.message : String(e),
        regions: [],
        // Former names, deprecated.
        planche: numero,
        indisponible: true,
      },
      { status: 200 },
    );
  }

  if (!reponse.ok) {
    const detail = await reponse.text().catch(() => "");
    return NextResponse.json(
      {
        id,
        page: numero,
        unavailable: true,
        detail: detail.slice(0, 300),
        regions: [],
        // Former names, deprecated.
        planche: numero,
        indisponible: true,
      },
      { status: 200 },
    );
  }

  const lu = (await reponse.json()) as {
    regions: RegionLue[];
    texte: string;
    secondes: number;
    cache: boolean;
  };

  return NextResponse.json({
    id,
    page: numero,
    regions: lu.regions.map(renderRegion),
    text: lu.texte,
    seconds: lu.secondes,
    cache: lu.cache,
    // Former names, deprecated.
    planche: numero,
    texte: lu.texte,
    secondes: lu.secondes,
  });
}
