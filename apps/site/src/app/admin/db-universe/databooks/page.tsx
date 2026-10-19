import Link from "next/link";
import { Scan } from "@aphrody/shenron-ui/icones";
import { AdminHeader } from "../_Header";
import { DbAddButton } from "@/components/admin/DbCrud";
import { DatabookAdminList } from "@/components/admin/DatabookAdminList";
import { listWikiSnake } from "@/lib/wiki-admin";
import { toMillis } from "@/lib/epoch";

export const dynamic = "force-dynamic";

const TABLE = "db_databooks";

type Databook = {
  id: number;
  kind: string;
  title: string;
  title_ja: string | null;
  author: string | null;
  published_at: number | null;
  cover: string | null;
  description: string | null;
  source_url: string | null;
  category?: string | null;
  pages?: unknown;
  visible?: boolean | null;
};

function pagesCount(pages: unknown): number {
  return Array.isArray(pages) ? pages.length : 0;
}

function publishedMs(v: number | null): number {
  if (!v) return 0;
  return toMillis(v);
}

const GROUPS: { key: string; label: string }[] = [
  { key: "databook", label: "Databooks" },
  { key: "interview", label: "Interviews" },
  { key: "artbook", label: "Art Books" },
  { key: "guidebook", label: "Saikyō Jump" },
];

function resolveKind(d: Databook): string {
  const cat = (d.category ?? "").trim();
  if (cat === "Interview") return "interview";
  if (cat === "Art Book") return "artbook";
  if (cat === "Saikyō Jump" || cat === "Guidebook") return "guidebook";
  if (cat === "Databook") return "databook";
  const k = (d.kind ?? "").toLowerCase();
  if (k === "interview" || k === "artbook" || k === "guidebook" || k === "databook") return k;
  return "databook";
}

export default async function AdminDatabooksPage() {
  const raw = (await listWikiSnake("db_databooks", { limit: 500 })) as Databook[];
  const items = raw
    .slice()
    .toSorted((a, b) => publishedMs(b.published_at) - publishedMs(a.published_at) || a.id - b.id);

  const normalizedItems = items.map((d) => ({ ...d, category: resolveKind(d) }));

  const visibleCount = items.filter((d) => d.visible !== false).length;
  const withCover = items.filter((d) => !!d.cover).length;
  const withDesc = items.filter((d) => !!d.description?.trim()).length;
  const withPages = items.filter((d) => pagesCount(d.pages) > 0).length;
  const totalPages = items.reduce((n, d) => n + pagesCount(d.pages), 0);

  return (
    <div className="mx-auto w-full max-w-6xl">
      <AdminHeader
        title="Databooks & interviews"
        subtitle={
          items.length > 0
            ? `${items.length} entrée${items.length > 1 ? "s" : ""} · ${visibleCount} visible${visibleCount > 1 ? "s" : ""}`
            : undefined
        }
      />
      <div className="mb-6 rounded-xl border border-white/10 bg-white/[0.025] p-4 text-sm text-white/70">
        <p>
          Guides officiels, artbooks, daizenshuu et interviews. L&apos;édition du contenu se fait
          dans le <strong className="text-white">studio visuel</strong> (aperçu live, upload
          couverture, markdown). L&apos;index public est disponible sur{" "}
          <Link
            href="/wiki/databooks"
            className="font-mono text-xs text-dbz-orange hover:underline"
          >
            /wiki/databooks
          </Link>
          .
        </p>
        <div className="mt-3 flex flex-wrap gap-4 text-xs font-semibold text-dbz-orange">
          <Link
            href="/workshop/transcription"
            className="hover:underline flex items-center gap-1.5"
          >
            → Suivi & arbitrage des transcriptions
          </Link>
          <Link href="/workshop/translation" className="hover:underline flex items-center gap-1.5">
            → Campagnes de traduction & indexation
          </Link>
        </div>
      </div>

      {items.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-center">
            <span className="block font-mono text-lg font-bold text-white">
              {withCover}/{items.length}
            </span>
            <span className="text-[11px] uppercase tracking-wider text-white/50">Couvertures</span>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-center">
            <span className="block font-mono text-lg font-bold text-white">
              {withDesc}/{items.length}
            </span>
            <span className="text-[11px] uppercase tracking-wider text-white/50">Descriptions</span>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-center">
            <span className="block font-mono text-lg font-bold text-dbz-orange">{totalPages}</span>
            <span className="text-[11px] uppercase tracking-wider text-white/50">
              {withPages} avec planches
            </span>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-center">
            <span className="block font-mono text-lg font-bold text-dbz-yellow">
              {items.filter((d) => resolveKind(d) === "databook").length}
            </span>
            <span className="text-[11px] uppercase tracking-wider text-white/50">
              Databooks purs
            </span>
          </div>
        </div>
      )}

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link
            href="/workshop/translation"
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-xs font-medium text-white transition hover:bg-white/10 hover:border-dbz-orange/50"
          >
            <Scan className="h-3.5 w-3.5 text-dbz-orange" />
            Campagnes de traduction
          </Link>
          <Link
            href="/workshop/transcription"
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-xs font-medium text-white transition hover:bg-white/10 hover:border-dbz-orange/50"
          >
            Transcription des planches
          </Link>
        </div>
        <DbAddButton table={TABLE} label="Ajouter une entrée" />
      </div>

      {items.length === 0 ? (
        <div className="dbz-panel p-12 text-center">
          <p className="mb-1 font-saiyan text-xl uppercase text-white/50">Aucune entrée</p>
          <p className="text-sm text-white/50">
            Ajoutez un databook ou une interview pour commencer.
          </p>
        </div>
      ) : (
        <DatabookAdminList items={normalizedItems} groups={GROUPS} />
      )}
    </div>
  );
}
