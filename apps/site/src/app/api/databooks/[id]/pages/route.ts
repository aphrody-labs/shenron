/**
 * API Databooks — édition d'UNE planche.
 *
 *   PATCH /api/databooks/:id/pages   { number, text?, verified? }   (admin connecté ou jeton)
 *
 * Réponse : `{ id, number, text, verified, totalPages, transcribedPages }`. Les anciens
 * noms (`verifiee` en entrée comme en sortie, `pagesTotal`, `pagesTranscrites`) restent
 * servis en doublon déprécié jusqu'à la version 1.4.0.
 *
 * Le studio sait déjà écrire les pages, mais seulement en bloc : il renvoie le
 * tableau `pages` entier. Pour corriger une ligne dans un ouvrage de 362
 * planches, cela veut dire réémettre ~300 Ko de jsonb — et surtout écraser tout
 * dépôt de transcription arrivé entre-temps, puisque le tableau envoyé date du
 * chargement de la page. C'est intenable pendant que la transcription tourne.
 *
 * Ici l'écriture est **ciblée et atomique** : la substitution se fait en SQL,
 * dans un seul `UPDATE`, sur la seule planche visée. Les autres planches ne sont
 * jamais réécrites, donc jamais perdues.
 *
 * `verified` (ancien nom `verifiee`) acquitte la planche : les signatures mécaniques de défaut se
 * taisent pour elle. C'est le pendant indispensable d'un juge automatique — une
 * couverture qui ne porte que « 3月号 » et « COVER » est jugée « trop courte »
 * et « idéogrammes sans kana » alors que sa transcription est exacte, et rien
 * ne permettait de le dire. Le drapeau ne change pas le texte, seulement le
 * verdict, et il se retire par le même appel (`verified: false`).
 *
 * `text: null` efface la transcription de la planche (l'image reste). Une chaîne
 * vide fait la même chose — ici, contrairement au dépôt de masse, l'intention
 * vient d'un humain qui a vidé un champ, pas d'un modèle qui n'a rien su lire.
 */
import { sql } from "drizzle-orm";
import { adminUserOrToken } from "@/lib/admin-guard";
import { db } from "@/lib/db";
import { getDatabook } from "@/lib/databooks";
import { parseDatabookId } from "@/lib/databooks-rules";
import { indexDatabook } from "@/lib/databooks-redis";
import { recordRevision } from "@/lib/wiki-revisions";
import { revalidateWikiEntity } from "@/lib/wiki-revalidate";
import { databooksFreeze } from "@/lib/databooks-freeze";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Aligné sur le dépôt de masse : au-delà, c'est une erreur, pas une planche. */
const TEXTE_MAX = 40_000;

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const freeze = databooksFreeze();
  if (freeze)
    return Response.json(
      { error: "Écritures databooks gelées.", reason: freeze.reason },
      { status: 423 },
    );
  const { allowed, me } = await adminUserOrToken(req);
  const admin = me?.user?.roleAdmin === true;
  if (!allowed) {
    return Response.json({ error: "Accès refusé." }, { status: 403 });
  }

  const id = parseDatabookId((await ctx.params).id);
  if (id === null) return Response.json({ error: "Fiche introuvable." }, { status: 404 });

  let corps: { number?: unknown; text?: unknown; verified?: unknown; verifiee?: unknown };
  try {
    corps = (await req.json()) as typeof corps;
  } catch {
    return Response.json({ error: "Corps JSON invalide." }, { status: 400 });
  }

  const numero = Number(corps.number);
  if (!Number.isSafeInteger(numero) || numero <= 0) {
    return Response.json({ error: "`number` doit être un entier positif." }, { status: 400 });
  }
  // `text` est facultatif : un acquittement (« vérifier quand même ») ne touche
  // pas à la transcription. Sans cette distinction, le drapeau aurait dû
  // renvoyer le texte avec lui — et l'aurait écrasé si la planche avait bougé
  // entre-temps.
  const changeTexte = corps.text !== undefined;
  if (changeTexte && corps.text !== null && typeof corps.text !== "string") {
    return Response.json({ error: "`text` doit être une chaîne ou null." }, { status: 400 });
  }
  const texte =
    !changeTexte || corps.text === null
      ? null
      : (corps.text as string).trim().slice(0, TEXTE_MAX) || null;

  // `verified`; the former `verifiee` is still read.
  const verifiedInput = corps.verified !== undefined ? corps.verified : corps.verifiee;
  const changeVerifiee = verifiedInput !== undefined;
  if (changeVerifiee && typeof verifiedInput !== "boolean") {
    return Response.json({ error: "`verified` doit être un booléen." }, { status: 400 });
  }
  const verifiee = verifiedInput === true;
  if (!changeTexte && !changeVerifiee) {
    return Response.json(
      { error: "Rien à écrire : fournir `text` et/ou `verified`." },
      { status: 400 },
    );
  }

  const avant = await getDatabook(id);
  if (!avant) return Response.json({ error: "Fiche introuvable." }, { status: 404 });
  if (!avant.pages.some((p) => p.number === numero)) {
    // Plutôt que d'ajouter une planche fantôme : un numéro absent signale un
    // décalage entre l'écran de relecture et la base (fiche rechargée ailleurs).
    return Response.json(
      { error: `La planche n°${numero} n'existe pas dans cette fiche.` },
      { status: 404 },
    );
  }

  // Substitution en base : on ne réécrit que l'entrée visée, `ORDER BY ord`
  // préserve l'ordre de lecture. `p - 'text'` retire la clé au lieu d'y poser
  // une chaîne vide — `normalizePages` traite les deux pareil, mais le jsonb
  // stocké reste propre.
  // Les deux écritures se composent : on part de la planche, on lui applique
  // ce que la requête demande de changer, et rien d'autre.
  let patch = sql`t.p`;
  if (changeTexte) {
    patch =
      texte === null
        ? sql`(${patch} - 'text')`
        : sql`(${patch} || jsonb_build_object('text', ${texte}::text))`;
  }
  if (changeVerifiee) {
    // L'acquittement retiré efface ses trois clés : `verifiee: false` et
    // l'absence de clé disent la même chose au juge, mais garder le nom du
    // relecteur d'un acquittement annulé raconterait une histoire fausse.
    patch = verifiee
      ? sql`(${patch} || jsonb_build_object('verifiee', true, 'verifiee_par', ${
          admin ? (me?.user?.username ?? "Admin") : "API"
        }::text, 'verifiee_le', ${Date.now()}::bigint))`
      : sql`(${patch} - 'verifiee' - 'verifiee_par' - 'verifiee_le')`;
  }

  await db.execute(sql`
		UPDATE bot.db_databooks d
		SET pages = coalesce((
			SELECT jsonb_agg(
				CASE WHEN coalesce((t.p ->> 'number')::int, t.ord::int) = ${numero}
					THEN ${patch}
					ELSE t.p
				END ORDER BY t.ord)
			FROM jsonb_array_elements(
				CASE WHEN jsonb_typeof(d.pages) = 'array' THEN d.pages ELSE '[]'::jsonb END
			) WITH ORDINALITY AS t(p, ord)
		), '[]'::jsonb)
		WHERE d.id = ${id}
	`);

  const apres = await getDatabook(id);
  if (!apres) return Response.json({ error: "Fiche introuvable." }, { status: 404 });

  await indexDatabook(apres);
  // La planche visée est journalisée sous `pages#<n>`, et non la fiche entière :
  // `snapshot()` écarte les valeurs objets, donc passer `avant`/`apres` bruts
  // faisait disparaître le tableau `pages` et ne laissait que des métadonnées
  // identiques — une révision vide, impossible à annuler.
  const cle = `pages#${numero}`;
  const texteAvant = avant.pages.find((p) => p.number === numero)?.text ?? null;
  const texteApres = apres.pages.find((p) => p.number === numero)?.text ?? null;
  // Seul le texte est journalisé : le drapeau n'est pas du contenu, il
  // s'annule d'un clic au même endroit, et une révision par acquittement
  // noierait l'historique du wiki sans rien offrir de plus.
  if (texteAvant !== texteApres) {
    await recordRevision({
      table: "db_databooks",
      id: String(id),
      action: "update",
      before: { ...(avant as unknown as Record<string, unknown>), [cle]: texteAvant },
      after: { ...(apres as unknown as Record<string, unknown>), [cle]: texteApres },
      actor: admin
        ? { id: me?.user?.id ?? "admin", name: me?.user?.username ?? "Admin" }
        : { id: "api-transcription", name: "Transcription (API)" },
    });
  }
  revalidateWikiEntity("db_databooks", { id });

  const transcribed = apres.pages.filter((p) => (p.text ?? "").length > 0).length;
  const plate = apres.pages.find((p) => p.number === numero);
  const verified = plate?.verifiee === true;
  return Response.json({
    id,
    number: numero,
    text: plate?.text ?? null,
    verified,
    totalPages: apres.pages.length,
    transcribedPages: transcribed,
    // Former names, deprecated: removed in 1.4.0.
    verifiee: verified,
    pagesTotal: apres.pages.length,
    pagesTranscrites: transcribed,
  });
}
