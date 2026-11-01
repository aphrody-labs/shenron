"use client";

/**
 * L'état VIVANT du serveur Discord sur l'accueil : statut du bot, membres
 * connectés, chiffres de la communauté, classement et gardiens.
 *
 * Un seul abonnement pour toute la page. `useLiveBotState` sonde l'API et
 * écoute le flux d'événements ; l'appeler dans chaque bloc ouvrirait autant de
 * sondages que de blocs. `HomeLiveProvider` le monte une fois et les blocs —
 * placés librement dans la page serveur — lisent son contexte. Sans
 * fournisseur (test, aperçu), chaque bloc retombe sur un état vide.
 */
import { createContext, useContext, type ReactNode } from "react";
import Link from "next/link";
import { ExternalLink } from "@aphrody/shenron-ui/external";
import { Avatar } from "@/components/Avatar";
import { useT } from "@/components/T";
import { assetUrl } from "@/lib/assets";
import { DISCORD_INVITE } from "@/lib/config";
import { blockTitle, focusRing, secondaryButton, surface } from "./ui";
import {
  useLiveBotState,
  type BotStats,
  type LiveState,
  type PersonaLive,
  type PresenceState,
  type TopMember,
} from "./useLiveBotState";

const VIDE: LiveState = {
  stats: {
    users: 0,
    totalXp: 0,
    totalZeni: 0,
    achievementsUnlocked: 0,
    shopItems: 0,
    inventoryItems: 0,
  },
  personas: [],
  topMembers: [],
  topMembersAvailable: false,
  presence: { total: 0, online: 0, members: [] },
  onlineCount: 0,
  connected: false,
  events: [],
};

const LiveContext = createContext<LiveState>(VIDE);
export function useHomeLiveState() {
  return useContext(LiveContext);
}

export function HomeLiveProvider({
  stats,
  personas,
  topMembers,
  topMembersAvailable,
  presence,
  children,
}: {
  stats: BotStats;
  personas: PersonaLive[];
  topMembers: TopMember[];
  topMembersAvailable: boolean;
  presence: PresenceState;
  children: ReactNode;
}) {
  const live = useLiveBotState({ stats, personas, topMembers, topMembersAvailable, presence });
  return <LiveContext.Provider value={live}>{children}</LiveContext.Provider>;
}

const nf = new Intl.NumberFormat("fr-FR");

const STATUS_DOT: Record<string, string> = {
  online: "bg-dbz-green",
  idle: "bg-kinto-ombre",
  dnd: "bg-dbz-red",
};

function Pastille({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={`inline-block size-2.5 shrink-0 rounded-full ${on ? "bg-dbz-green" : "bg-os/35"}`}
    />
  );
}

/**
 * Le serveur en direct : bot, connectés, chiffres, activité. Il tient le haut
 * de la colonne d'appui sur grand écran ; sur téléphone il vient après le
 * contenu principal.
 */
export function HomeLivePanel({
  showCommunity = true,
  className = "",
}: {
  /** Section « communauté » activée dans `/admin/home`. */
  showCommunity?: boolean;
  className?: string;
}) {
  const t = useT();
  const live = useContext(LiveContext);
  const enLigne = live.onlineCount > 0;
  const chiffres = [
    { v: live.stats.users, label: t("home.community.warriors") },
    { v: live.stats.totalXp, label: t("home.community.totalXp") },
    { v: live.stats.totalZeni, label: t("home.community.zeni") },
    { v: live.stats.achievementsUnlocked, label: t("home.community.achievements") },
  ];
  const membres = live.presence.members.slice(0, 12);

  return (
    <section
      id="community"
      aria-labelledby="accueil-direct-titre"
      className={`${surface} flex scroll-mt-24 flex-col p-4 sm:p-5 ${className}`}
    >
      <h2 id="accueil-direct-titre" className={blockTitle}>
        {t("accueil.live.title")}
      </h2>
      <p className="mt-2 flex items-center gap-2 text-sm text-os/85">
        <Pastille on={enLigne} />
        {enLigne ? t("home.botOnline") : t("home.botOffline")}
      </p>
      <p className="mt-1 flex items-center gap-2 text-sm text-os/70">
        <Pastille on={live.connected} />
        {live.connected ? t("home.community.liveFeed") : t("home.community.synced")}
      </p>

      <div className="mt-4">
        <p className="flex items-baseline justify-between gap-3 text-sm">
          <span className="font-semibold text-os">{t("home.pantheon.onlineNow")}</span>
          <span className="tabular-nums text-os/70">
            {live.presence.online}
            {live.presence.total > 0 ? ` / ${nf.format(live.presence.total)}` : ""}
          </span>
        </p>
        {membres.length > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={t("home.pantheon.onlineNow")}>
            {membres.map((m) => (
              <li key={m.id} className="relative" title={m.username}>
                <Avatar
                  src={m.avatarUrl}
                  userId={m.id}
                  size={32}
                  alt={m.username}
                  className="border border-os/12"
                />
                <span
                  aria-hidden
                  className={`absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-dbz-bg ${STATUS_DOT[m.status] ?? "bg-os/35"}`}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-os/65">
            {live.presence.online > 0
              ? t("home.pantheon.onlineCount", { count: live.presence.online })
              : t("home.pantheon.noneOnline")}
          </p>
        )}
      </div>

      {showCommunity && (
        <dl className="mt-4 divide-y divide-os/10 border-t border-os/10">
          {chiffres.map((c) => (
            <div key={c.label} className="flex items-baseline justify-between gap-3 py-2 text-sm">
              <dt className="text-os/70">{c.label}</dt>
              <dd className="tabular-nums font-semibold text-os">{nf.format(c.v)}</dd>
            </div>
          ))}
        </dl>
      )}

      {live.events.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-os/10 pt-3" aria-live="polite">
          {live.events.slice(0, 3).map((ev) => (
            <li key={ev.key} className="truncate text-sm text-os/70">
              {ev.label}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-auto pt-4">
        <ExternalLink href={DISCORD_INVITE} className={`${secondaryButton} w-full`}>
          {t("home.joinServer")}
        </ExternalLink>
      </div>
    </section>
  );
}

/** Le classement des membres (section « panthéon »). */
export function HomePantheon({
  title,
  limit = 8,
  className = "",
}: {
  /** Title from `/admin/home`; empty, the dictionary label is used. */
  title: string;
  limit?: number;
  className?: string;
}) {
  const t = useT();
  const { topMembers, topMembersAvailable } = useContext(LiveContext);
  return (
    <section
      id="pantheon"
      aria-labelledby="accueil-pantheon-titre"
      className={`${surface} scroll-mt-24 p-4 sm:p-5 ${className}`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="accueil-pantheon-titre" className={blockTitle}>
          {title || t("profile.leaderboard")}
        </h2>
        <Link
          href="/leaderboard"
          className={`cursor-pointer inline-flex min-h-11 items-center rounded-md px-2 text-sm font-semibold text-dbz-orange transition-[color,scale] duration-150 hover:text-gi-clair active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100 ${focusRing}`}
        >
          {t("home.pantheon.allRanking")}
        </Link>
      </div>
      {!topMembersAvailable ? (
        <p className="mt-2 text-sm text-os/65">{t("home.pantheon.unavailable")}</p>
      ) : topMembers.length === 0 ? (
        <p className="mt-2 text-sm text-os/65">{t("home.pantheon.empty")}</p>
      ) : (
        <ol className="mt-1 divide-y divide-os/10">
          {topMembers.slice(0, limit).map((m) => (
            <li key={m.discordId} className="flex min-h-12 items-center gap-3 py-1.5">
              <span
                className={`grid size-6 shrink-0 place-items-center rounded-md text-xs tabular-nums ${
                  m.rank <= 3
                    ? "border border-dbz-orange/35 bg-dbz-orange/15 font-bold text-dbz-orange"
                    : "text-os/60"
                }`}
              >
                {m.rank}
              </span>
              <Avatar
                src={m.avatarUrl}
                userId={m.discordId}
                size={32}
                className="border border-os/12"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-os">
                  {m.username ?? t("home.pantheon.anonymous")}
                </span>
                <span className="block text-xs text-os/65">
                  {t("home.pantheon.level", { level: m.level })}
                </span>
              </span>
              <span className="shrink-0 text-sm tabular-nums text-os/80">{nf.format(m.xp)} XP</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

const GUARDIAN_KEYS: Array<[match: string, key: string]> = [
  ["shenron", "shenron"],
  ["beerus", "beerus"],
  ["whis", "whis"],
  ["grand prêtre", "grandPretre"],
  ["enma", "enma"],
  ["kaïo", "kaio"],
  ["kaio", "kaio"],
];

function guardianKey(name: string): string | null {
  const n = name.toLowerCase();
  return GUARDIAN_KEYS.find(([m]) => n.includes(m))?.[1] ?? null;
}

/** Les gardiens : les personas du bot, leur rôle et leur présence. */
export function HomeGuardians({ title, className = "" }: { title: string; className?: string }) {
  const t = useT();
  const { personas } = useContext(LiveContext);
  if (personas.length === 0) return null;
  return (
    <section
      id="guardians"
      aria-labelledby="accueil-gardiens-titre"
      className={`scroll-mt-24 ${className}`}
    >
      <h2 id="accueil-gardiens-titre" className={`mb-3 ${blockTitle}`}>
        {title}
      </h2>
      <ul className={`${surface} divide-y divide-os/10`}>
        {personas.map((p) => {
          const key = guardianKey(p.name);
          return (
            <li key={p.id} className="flex items-center gap-3 px-3 py-2.5">
              <span className="relative shrink-0">
                <Avatar
                  src={assetUrl(p.avatarUrl ?? p.avatar ?? "") || null}
                  size={36}
                  className="border border-os/12"
                />
                <span
                  aria-hidden
                  className={`absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-dbz-bg ${p.online ? "bg-dbz-green" : "bg-os/35"}`}
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-os">{p.name}</span>
                <span className="block truncate text-xs text-os/65">
                  {t(key ? `home.guardians.${key}.role` : "home.guardians.defaultRole")}
                </span>
              </span>
              <span className="shrink-0 text-xs text-os/70">
                {p.online ? t("home.guardians.online") : t("home.guardians.offline")}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
