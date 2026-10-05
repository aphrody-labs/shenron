/**
 * Registre public des contributions d'un membre : chaque note déposée, la fiche
 * visée, le score, l'avis rédigé et l'horodatage. Rendu côté serveur, partagé
 * entre le profil public (`/profile/[id]`) et l'arbitrage du concours
 * (`/admin/concours`).
 *
 * `showSignals` n'est vrai que côté admin : les indices de triche sont des
 * mesures brutes, pas un verdict, et les afficher publiquement équivaudrait à
 * accuser un membre sur la page que tout le monde lit.
 */
import Link from "next/link";
import { Stars } from "@shenron/ui/public/Stars";
import { T } from "@/components/T";
import type { CheatSignal, MemberContributions } from "@/lib/contributors";

const dateFmt = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const TARGET_KEY: Record<string, string> = {
  episode: "profile.target.episode",
  movie: "profile.target.movie",
  game: "profile.target.game",
  arc: "profile.target.arc",
};

const SIGNAL_TONE: Record<CheatSignal["level"], string> = {
  info: "border-white/15 bg-white/5 text-white/65",
  warn: "border-amber-400/50 bg-amber-400/10 text-amber-200",
  alert: "border-red-500/60 bg-red-500/10 text-red-200",
};

const KIND_LABEL: Record<string, string> = {
  post: "Article",
  wiki: "Fiche wiki",
  databook: "Databook",
  tierlist: "Tier list",
  comment: "Réponse",
};

/** Note d’une ligne : les étoiles du site, et le chiffre écrit à côté. */
function Score({ score }: { score: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <Stars value={score} size="sm" label="Note" />
      <span aria-hidden className="text-[0.75rem] font-bold tabular-nums text-white/70">
        {score}/5
      </span>
    </span>
  );
}

function TargetLabel({ type }: { type: string }) {
  return (
    <span className="mr-2 rounded border border-white/15 px-1.5 py-0.5 text-[0.6875rem] text-white/55">
      <T k={TARGET_KEY[type] ?? "profile.target.other"} />
    </span>
  );
}

function TargetLink({
  href,
  title,
  targetId,
}: {
  href: string | null;
  title: string | null;
  targetId: string;
}) {
  return href ? (
    <Link href={href} className="font-medium text-white/85 hover:text-dbz-orange">
      {title ?? `#${targetId}`}
    </Link>
  ) : (
    <span className="text-white/50">{title ?? `#${targetId}`}</span>
  );
}

export function CheatSignals({ signals }: { signals: CheatSignal[] }) {
  if (signals.length === 0) {
    return (
      <p className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-200">
        Aucun signal automatique sur cette activité.
      </p>
    );
  }
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {signals.map((s) => (
        <li key={s.code} className={`rounded-xl border p-3 text-sm ${SIGNAL_TONE[s.level]}`}>
          <p className="font-semibold">{s.label}</p>
          <p className="mt-0.5 text-xs opacity-80">{s.detail}</p>
        </li>
      ))}
    </ul>
  );
}

export function MemberLedger({
  data,
  showSignals = false,
}: {
  data: MemberContributions;
  showSignals?: boolean;
}) {
  const { counts, ratings, comments } = data;
  return (
    <section
      aria-labelledby="ledger-title"
      className="mt-8 rounded-lg border border-white/12 p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2
            id="ledger-title"
            className="text-[clamp(1.5rem,1.2rem+1.2vw,2rem)] font-[850] leading-tight tracking-[-0.02em] text-white"
          >
            <T k="profile.ledgerTitle" />
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-white/60">
            <T k="profile.ledgerLead" />
          </p>
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm tabular-nums text-white/65">
          <li>{counts.ratings} ★</li>
          <li>
            {counts.ratingComments} <T k="profile.ledgerWritten" />
          </li>
          <li>
            <T k="profile.ledgerAverage" /> {counts.averageScore}/5
          </li>
        </ul>
      </div>

      {showSignals && (
        <div className="mt-5">
          <h3 className="mb-2 text-sm font-semibold text-white/75">
            Contrôle d&apos;intégrité (staff)
          </h3>
          <CheatSignals signals={data.signals} />
        </div>
      )}

      {ratings.length === 0 ? (
        <p className="mt-6 text-sm text-white/45">
          <T k="profile.ledgerEmpty" />
        </p>
      ) : (
        <div className="mt-6">
          {/* Mobile : une carte par note. Le tableau à quatre colonnes imposait un
					    défilement horizontal de 38rem sur un écran de 360 px. */}
          <ul className="divide-y divide-white/[0.06] md:hidden">
            {ratings.map((r) => (
              <li key={r.id} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 text-sm">
                    <TargetLabel type={r.targetType} />
                    <TargetLink href={r.href} title={r.title} targetId={r.targetId} />
                  </p>
                  <Score score={r.score} />
                </div>
                {(r.comment ?? "").trim() && (
                  <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-white/70">
                    {r.comment}
                  </p>
                )}
                <p className="mt-1 text-[0.75rem] text-white/45">{dateFmt(r.updatedAt)}</p>
              </li>
            ))}
          </ul>
          <table className="hidden w-full border-collapse text-sm md:table">
            <thead>
              <tr className="border-b border-white/10 text-left text-[0.75rem] text-white/50">
                <th scope="col" className="py-2 pr-3 font-semibold">
                  <T k="profile.ledgerColTarget" />
                </th>
                <th scope="col" className="py-2 pr-3 font-semibold">
                  <T k="profile.ledgerColScore" />
                </th>
                <th scope="col" className="py-2 pr-3 font-semibold">
                  <T k="profile.ledgerColComment" />
                </th>
                <th scope="col" className="py-2 font-semibold">
                  <T k="profile.ledgerColDate" />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {ratings.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="py-2.5 pr-3">
                    <TargetLabel type={r.targetType} />
                    <TargetLink href={r.href} title={r.title} targetId={r.targetId} />
                  </td>
                  <td className="py-2.5 pr-3">
                    <Score score={r.score} />
                  </td>
                  <td className="max-w-[24rem] py-2.5 pr-3 text-white/65">
                    {(r.comment ?? "").trim() || <span className="text-white/25">—</span>}
                  </td>
                  <td className="whitespace-nowrap py-2.5 text-xs text-white/45">
                    {dateFmt(r.updatedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.truncated && (
            <p className="mt-3 text-xs text-white/45">
              <T k="profile.ledgerTruncated" />
            </p>
          )}
        </div>
      )}

      {comments.length > 0 && (
        <div className="mt-8">
          <h3 className="text-sm font-semibold text-white/75">
            <T k="profile.ledgerCommentsTitle" />
          </h3>
          <ul className="mt-3 divide-y divide-white/5">
            {comments.map((c) => (
              <li key={c.id} className="py-2.5">
                <div className="flex flex-wrap items-center gap-2 text-xs text-white/40">
                  <span className="rounded border border-white/15 px-1.5 py-0.5">
                    {KIND_LABEL[c.kind] ?? c.kind}
                  </span>
                  <span>{dateFmt(c.createdAt)}</span>
                  {c.isReply && <span className="text-white/30">↳ réponse</span>}
                  {c.status !== "visible" && (
                    <span className="rounded border border-red-500/40 px-1.5 py-0.5 text-red-300">
                      {c.status}
                    </span>
                  )}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-white/75">
                  {c.body}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
