import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@aphrody/shenron-ui/layout/PageShell";
import { PageHeader } from "@aphrody/shenron-ui/layout/PageHeader";
import { Crayon, LienExterne } from "@aphrody/shenron-ui/icones";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { GatedLink } from "@/components/GatedLink";
import { LibraryNav, WorkshopNav } from "@/components/library/LibraryNav";
import {
  TranscriptionRelecteur,
  type PlancheRelecture,
} from "@/components/admin/TranscriptionRelecteur";
import { getDatabook } from "@/lib/databooks";
import { parseDatabookId } from "@/lib/databooks-rules";
import { requireAdmin } from "@/lib/session";

/**
 * Écran de relecture d'un ouvrage transcrit.
 *
 * Les planches sont passées en entier au composant client plutôt que chargées
 * une par une : le plus gros ouvrage fait 362 planches pour ~325 Ko de texte,
 * soit un aller-retour unique contre 362 requêtes pendant une relecture — et la
 * navigation entre planches reste instantanée, ce qui est tout l'intérêt.
 */
export const dynamic = "force-dynamic";

type Filtre = "toutes" | "a-transcrire" | "transcrites" | "suspectes";

/**
 * `?filter=` (anglais) → filtre du relecteur. Les anciennes valeurs françaises
 * (`?filtre=suspectes`, liens des anciennes adresses `/admin/databooks/:id`) restent lues.
 */
const FILTER_IN_URL: Record<string, Filtre> = {
  all: "toutes",
  untranscribed: "a-transcrire",
  transcribed: "transcrites",
  suspect: "suspectes",
  toutes: "toutes",
  "a-transcrire": "a-transcrire",
  transcrites: "transcrites",
  suspectes: "suspectes",
};

export default async function RelecturePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ filter?: string; page?: string; filtre?: string; planche?: string }>;
}) {
  await requireAdmin();
  const id = parseDatabookId((await params).id);
  if (id === null) notFound();

  const fiche = await getDatabook(id);
  if (!fiche) notFound();

  const sp = await searchParams;
  const filtreDemande = sp.filter ?? sp.filtre ?? "";
  const filtreInitial = Object.hasOwn(FILTER_IN_URL, filtreDemande)
    ? FILTER_IN_URL[filtreDemande]!
    : "toutes";
  const nPlanche = Number(sp.page ?? sp.planche);

  const planches: PlancheRelecture[] = fiche.pages.map((p) => ({
    numero: p.number,
    image: p.image,
    texte: p.text ?? "",
    verifiee: p.verifiee === true,
  }));
  const transcrites = planches.filter((p) => p.texte.trim().length > 0).length;

  return (
    <PageShell width="wide" rhythm="tight">
      <Breadcrumbs
        className="mb-4"
        items={[
          { label: "Transcription et traduction", href: "/workshop" },
          { label: "Transcription", href: "/workshop/transcription" },
          { label: fiche.title },
        ]}
      />
      <PageHeader
        className="mb-6"
        eyebrow="Relecture"
        title={fiche.title}
        subtitle={
          planches.length > 0
            ? `${transcrites}/${planches.length} planches transcrites · ${Math.round((transcrites / planches.length) * 100)} %`
            : "Aucune planche"
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/admin/wiki/studio/db_databooks/${fiche.id}`}
              className="btn btn-ghost h-9 px-3 text-xs"
              title="Métadonnées, couverture, description, gestion des slots"
            >
              <Crayon className="h-3.5 w-3.5" />
              Studio
            </Link>
            <GatedLink
              href={`/wiki/databooks/${fiche.id}`}
              className="btn btn-ghost h-9 px-3 text-xs"
            >
              <LienExterne className="h-3.5 w-3.5" />
              Public
            </GatedLink>
          </div>
        }
      />
      <LibraryNav />
      <WorkshopNav />

      {planches.length === 0 ? (
        <div className="dbz-panel p-12 text-center">
          <p className="mb-1 font-saiyan text-xl uppercase text-white/50">Aucune planche</p>
          <p className="text-sm text-white/50">
            Les slots de pages se créent dans le{" "}
            <Link
              href={`/admin/wiki/studio/db_databooks/${fiche.id}`}
              className="text-dbz-orange hover:underline"
            >
              studio
            </Link>
            , avec les scans.
          </p>
        </div>
      ) : (
        <TranscriptionRelecteur
          databookId={fiche.id}
          titre={fiche.title}
          planchesInitiales={planches}
          filtreInitial={filtreInitial}
          plancheInitiale={Number.isSafeInteger(nPlanche) && nPlanche > 0 ? nPlanche : undefined}
        />
      )}
    </PageShell>
  );
}
