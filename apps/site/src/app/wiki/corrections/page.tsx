/**
 * /wiki/corrections?table=&row=&col=&returnTo= — page dédiée à une proposition.
 *
 * Pourquoi une page plutôt que la modale partout : chaque rubrique affichée
 * portait son propre `WikiContribute`, soit un composant client par section sur
 * ~1 400 pages statiques. **Trois builds sont morts en OOM à la compilation**
 * avant que la corrélation soit établie (mêmes conditions mémoire aux six
 * lancements — c'était le code, pas la machine). Les rubriques pointent
 * désormais un lien rendu côté serveur, qui ne coûte rien, et l'éditeur n'est
 * instancié qu'ici, une fois.
 *
 * Bénéfice de côté : l'URL est partageable (« corrige ce paragraphe, tiens »),
 * et la page fonctionne sans avoir à ouvrir une modale par-dessus la lecture.
 */
import { PageHeader } from "@aphrody/shenron-ui/layout/PageHeader";
import Link from "next/link";
import { FlecheGauche } from "@aphrody/shenron-ui/icones";
import type { Metadata } from "next";
import { WikiContribute } from "@/components/wiki/WikiContribute";
import { CONTRIBUTABLE_COLUMNS } from "@/lib/contributions-shared";
import { champPlanche, estCiblePlanche, numeroDePlanche } from "@/lib/databook-pages-shared";
import { estCibleStats } from "@/lib/stats-personnage";
import { WIKI_TABLE_SPECS } from "@/lib/wiki-tables";
import { sanitizeInternalPath } from "@aphrody/shenron-config/favorites";
import { WikiCorrectionText } from "@/components/wiki/WikiCorrectionText";
import correctionText from "../../../../messages/wiki-corrections/fr.json";
import { PageShell } from "@/components/kit";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: correctionText.title,
  // Une page de formulaire paramétrée par query string n'a rien à faire dans
  // l'index : elle n'a pas de contenu propre et sa combinatoire est infinie.
  robots: { index: false, follow: true },
};

export default async function PageCorriger({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const lire = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) ?? "";

  const table = lire("table");
  const row = lire("row");
  const col = lire("col");
  // `returnTo` (ancien `retour`, encore lu) vient de la query string, donc du visiteur. `startsWith("/")` ne
  // suffit PAS : `//evil.tld` et `/\evil.tld` commencent par « / » et sont
  // pourtant des URL réseau — le lien « Revenir » devenait une redirection
  // ouverte, prête à l'emploi pour un hameçonnage depuis un lien dbfr. On passe
  // par le normalisateur commun (`sanitizeInternalPath`), déjà utilisé par les
  // routes qui acceptent un chemin de retour.
  const retourSur = sanitizeInternalPath(lire("returnTo") || lire("retour")) ?? "/wiki/contribute";

  const spec = WIKI_TABLE_SPECS[table];
  // `pages#42` : la transcription d'UNE planche de databook. Ce n'est pas une
  // colonne de la table, donc ni `CONTRIBUTABLE_COLUMNS` ni `mutableColumns`
  // ne peuvent la valider — c'est `estCiblePlanche` qui fait foi, exactement
  // comme dans le circuit de dépôt.
  const planche = estCiblePlanche(table, col) ? numeroDePlanche(col) : null;
  const stats = estCibleStats(table, col);
  const champ =
    planche !== null
      ? champPlanche(planche)
      : stats
        ? {
            label: "Statistiques",
            hint: "Une mesure par ligne, sous la forme « Intitulé : valeur ». Les intitulés sont libres : rien n'oblige à parler de ki.",
            long: true,
          }
        : CONTRIBUTABLE_COLUMNS[col];
  const valide = Boolean(
    row && champ && (planche !== null || stats || (spec && spec.mutableColumns.includes(col))),
  );

  return (
    <PageShell width="prose" rhythm="loose" wikiDecorative>
      <Link
        href={retourSur}
        className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--wiki-muted)] transition-colors hover:text-dbz-orange"
      >
        <FlecheGauche className="h-3.5 w-3.5" /> <WikiCorrectionText name="back" />
      </Link>

      <PageHeader
        eyebrow={<WikiCorrectionText name="eyebrow" />}
        title={<WikiCorrectionText name="title" />}
        size="md"
        className="mt-6 mb-0"
      />

      {!valide ? (
        <p className="mt-4 rounded-lg border border-dbz-red/30 bg-dbz-red/[0.07] px-4 py-3 text-sm text-dbz-red">
          <WikiCorrectionText name="invalid" />
        </p>
      ) : (
        <>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-[var(--wiki-muted)]">
            <WikiCorrectionText name="process" />
          </p>
          <div className="mt-8">
            <WikiContribute table={table} rowId={row} columns={[col]} />
          </div>
          <p className="mt-8 border-t border-[var(--wiki-border)] pt-5 text-xs leading-relaxed text-[var(--wiki-muted)]">
            <WikiCorrectionText name="sourcesIntro" />{" "}
            <Link
              href="/wiki/contribute"
              className="text-[var(--color-os)] underline underline-offset-2 hover:text-dbz-orange"
            >
              <WikiCorrectionText name="sourcesLink" />
            </Link>
            .
          </p>
        </>
      )}
    </PageShell>
  );
}
