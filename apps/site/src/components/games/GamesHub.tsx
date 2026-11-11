"use client";
// SPDX-License-Identifier: Apache-2.0
import Link from "next/link";
import {
  ArrowRight,
  Flame,
  Gamepad2,
  Grid2X2,
  Hand,
  MessageCircle,
  MonitorPlay,
  Radar,
  ScanLine,
  Sparkles,
  Swords,
  Trophy,
  UserRound,
} from "lucide-react";
import { DEFAULT_DISCORD_INVITE } from "@aphrody/shenron-config/public-urls";
import { PageShell } from "@aphrody/shenron-ui/layout/PageShell";
import { ClientGatedWrap } from "@/components/GatedClientLink";
import type { AccessSnapshot } from "@aphrody/shenron-config/wiki-launch";
import { useLangue } from "@/lib/i18n/client";
import { DragonArcadeEngine } from "./DragonArcadeEngine";
import fr from "../../../messages/games-hub/fr.json";
import en from "../../../messages/games-hub/en.json";
import ja from "../../../messages/games-hub/ja.json";
import styles from "./games-hub.module.css";
const dictionaries = { fr, en, ja };
const games = [
  { id: "merge", href: "/games/2048", icon: Grid2X2, account: false },
  { id: "morpion", href: "/games/tic-tac-toe", icon: Swords, account: true },
  { id: "pfc", href: "/games/rock-paper-scissors", icon: Hand, account: true },
  { id: "bingo", href: "/games/bingo", icon: Radar, account: true },
] as const;
const explorers = [
  { id: "canon", href: "/games/canon", icon: Flame },
  { id: "pixel", href: "/games/dragon-pixel", icon: Gamepad2 },
  { id: "xenoverse", href: "/games/xenoverse-2", icon: ScanLine },
  { id: "bt3", href: "/games/budokai-tenkaichi-3", icon: MonitorPlay },
] as const;
/** `access` comes from the launch configuration read by the page; the wiki catalogue is gatable. */
export function GamesHub({ access = null }: { access?: AccessSnapshot | null } = {}) {
  const { locale } = useLangue();
  const t = dictionaries[locale];
  return (
    <PageShell rhythm="tight" className={styles.hub}>
      {/* Gamescope / Steam Deck Gaming HUD */}
      <section
        aria-label="Statut Gamescope et performances"
        className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#0e141b]/90 px-4 py-2 text-xs font-mono text-white/80 backdrop-blur-md shadow-lg"
      >
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 font-bold text-emerald-400">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            GAMESCOPE VERIFIED
          </span>
          <span className="text-white/20">|</span>
          <span className="text-white/70">60 FPS • 16.6ms</span>
          <span className="text-white/20">|</span>
          <span className="text-sky-400">Vulkan / WebGPU</span>
        </div>
        <div className="hidden sm:flex items-center gap-4 text-[11px] text-white/50">
          <span>
            <kbd className="rounded bg-white/10 px-1 py-0.5 text-white/90">A</kbd> Lancer
          </span>
          <span>
            <kbd className="rounded bg-white/10 px-1 py-0.5 text-white/90">X</kbd> Détails
          </span>
          <span>
            <kbd className="rounded bg-white/10 px-1 py-0.5 text-white/90">Y</kbd> Plein écran
          </span>
        </div>
      </section>

      {/* Featured Epic Canon 2.5D Game Showcase Banner */}
      <div className="relative mb-6 overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-950/40 via-zinc-950 to-slate-950 p-6 md:p-8 shadow-2xl">
        <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-amber-500/20 blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-amber-500/20 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-amber-400 border border-amber-500/30 flex items-center gap-1">
                <Sparkles className="size-3" />
                Moteur Dédié • WebGPU 60 FPS
              </span>
              <span className="rounded-full bg-sky-500/20 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-sky-400 border border-sky-500/30">
                2.5D ArcSys & Pixel Perfect
              </span>
              <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-emerald-400 border border-emerald-500/30">
                Toriyama 42 Tomes
              </span>
            </div>
            <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight">
              Dragon Ball 2.5D Canon : Le Jeu Épique
            </h2>
            <p className="text-sm text-zinc-300 leading-relaxed">
              Combattez à travers les sagas canoniques d'Akira Toriyama (du 21e Tenkaichi Budōkai au
              Chō Genki Dama contre Kid Buu), avec scénarios générés via le Wiki, Manga, Anime et
              notices du Daizenshuu 7.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0 w-full md:w-auto">
            <Link
              href="/games/canon"
              className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-amber-400 hover:bg-amber-300 px-6 py-3 font-display text-sm font-bold text-black transition-all hover:scale-[1.02] shadow-[0_0_24px_rgba(251,191,36,0.35)] focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:outline-none"
            >
              <Swords className="h-4 w-4" />
              Lancer l'Histoire Canonique
            </Link>
          </div>
        </div>
      </div>

      {/* Featured Epic / Steam Showcase Banner */}
      <div className="relative mb-6 overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-r from-zinc-950 via-[#161a23] to-zinc-950 p-6 md:p-8 shadow-2xl">
        <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-amber-500/20 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-amber-400 border border-amber-500/30">
                À la une • Émulation WASM
              </span>
              <span className="rounded-full bg-sky-500/20 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-sky-400 border border-sky-500/30">
                Wii / PS2
              </span>
              <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-emerald-400 border border-emerald-500/30">
                1080p 60 FPS
              </span>
            </div>
            <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight">
              Dragon Ball Z : Budokai Tenkaichi 3
            </h2>
            <p className="text-sm text-zinc-300 leading-relaxed">
              Le jeu de combat légendaire directement exécutable dans le navigateur sans
              installation via le moteur WebAssembly 60 FPS avec accélération WebGPU et support des
              manettes.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0 w-full md:w-auto">
            <Link
              href="/games/budokai-tenkaichi-3"
              className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 px-6 py-3 font-display text-sm font-bold text-black transition-all hover:scale-[1.02] shadow-lg focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:outline-none"
            >
              <Gamepad2 className="h-4 w-4" />
              Lancer l’arène Tenkaichi
            </Link>
            <Link
              href="/games/dragon-pixel"
              className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 px-5 py-3 font-display text-xs font-semibold text-white transition-colors focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
            >
              Dragon Pixel 2D
            </Link>
          </div>
        </div>
      </div>

      {/* Live Dragon Ball Arcade Mini-Game (Bevy 2D Canvas + Manga Trame + Episode Anime Frames) */}
      <section id="arcade-dojo" className="mb-10">
        <DragonArcadeEngine />
      </section>

      <header className={`${styles.hero} vie-speed`}>
        <div>
          <p className={styles.eyebrow}>
            <Gamepad2 size={18} aria-hidden="true" />
            {t.eyebrow}
          </p>
          <h1>{t.title}</h1>
          <p className={styles.lead}>{t.subtitle}</p>
          <a href="#browser-games" className={styles.primary}>
            {t.choose}
            <ArrowRight size={18} aria-hidden="true" />
          </a>
        </div>
        <div className={styles.heroArt} aria-hidden="true">
          <div className={styles.tiles}>
            {[2, 4, 8, 16].map((value) => (
              <span key={value}>{value}</span>
            ))}
          </div>
          <Sparkles size={32} />
        </div>
      </header>
      <nav className={styles.sections} aria-label={t.navigation}>
        <a href="#browser-games">
          {t.browserTitle}
          <span>04</span>
        </a>
        <a href="#explorers">
          {t.explorersTitle}
          <span>03</span>
        </a>
        <a href="#discord-games">
          {t.discordTitle}
          <MessageCircle size={16} aria-hidden="true" />
        </a>
      </nav>

      <aside className={styles.catalogue}>
        <div>
          <h2>{t.catalogueTitle}</h2>
          <p>{t.catalogueDescription}</p>
        </div>
        <ClientGatedWrap access={access} href="/wiki/games" className={styles.textLink}>
          {t.catalogueAction}
          <ArrowRight size={18} aria-hidden="true" />
        </ClientGatedWrap>
      </aside>
      <section id="browser-games" aria-labelledby="browser-heading" className={styles.section}>
        <div className={styles.sectionHeading}>
          <h2 id="browser-heading">{t.browserTitle}</h2>
          <p>{t.browserIntro}</p>
        </div>
        <ul className={styles.grid}>
          {games.map(({ id, href, icon: Icon, account }) => (
            <li key={id}>
              <article className={`${styles.card} vie-glow`}>
                <div className={styles.cardArt} aria-hidden="true">
                  {id === "merge" ? (
                    <div className={styles.miniTiles}>
                      {[2, 4, 8, 16].map((value) => (
                        <span key={value}>{value}</span>
                      ))}
                    </div>
                  ) : (
                    <Icon size={52} strokeWidth={1.5} />
                  )}
                </div>
                <div className={styles.cardBody}>
                  <p className={styles.category}>{t[id].category}</p>
                  <h3>{t[id].name}</h3>
                  <p className={styles.description}>{t[id].description}</p>
                  <p className={styles.access}>
                    <UserRound size={15} aria-hidden="true" />
                    {account ? t.account : t.noAccount}
                  </p>
                  <Link
                    href={href}
                    className={styles.cardLink}
                    aria-label={`${t.play} — ${t[id].name}`}
                  >
                    {t.play}
                    <ArrowRight size={18} aria-hidden="true" />
                  </Link>
                </div>
              </article>
            </li>
          ))}
        </ul>
      </section>
      <section id="explorers" aria-labelledby="explorers-heading" className={styles.section}>
        <div className={styles.sectionHeading}>
          <h2 id="explorers-heading">{t.explorersTitle}</h2>
          <p>{t.explorersIntro}</p>
        </div>
        <ul className={styles.explorerGrid}>
          {explorers.map(({ id, href, icon: Icon }) => (
            <li key={id}>
              <article className={styles.explorer}>
                <Icon className={styles.explorerIcon} size={32} aria-hidden="true" />
                <div>
                  <p className={styles.category}>{t[id].category}</p>
                  <h3>{t[id].name}</h3>
                  <p className={styles.description}>{t[id].description}</p>
                  <Link href={href} className={styles.textLink}>
                    {t[id].action}
                    <ArrowRight size={18} aria-hidden="true" />
                  </Link>
                </div>
              </article>
            </li>
          ))}
        </ul>
      </section>
      <section
        id="discord-games"
        aria-labelledby="discord-heading"
        className={`${styles.section} ${styles.discord}`}
      >
        <div>
          <p className={styles.eyebrow}>
            <MessageCircle size={18} aria-hidden="true" />
            {t.community}
          </p>
          <h2 id="discord-heading">{t.discordTitle}</h2>
          <p className={styles.description}>{t.discordIntro}</p>
          <a href={DEFAULT_DISCORD_INVITE} className={styles.primary}>
            {t.join}
            <ArrowRight size={18} aria-hidden="true" />
          </a>
        </div>
        <div>
          <h3>{t.hangman}</h3>
          <p className={styles.description}>{t.hangmanDescription}</p>
          <div className={styles.commands}>
            {["/pendu", "/morpion", "/pfc", "/bingo"].map((command) => (
              <code key={command}>{command}</code>
            ))}
          </div>
          <div className={styles.rewards}>
            <Trophy size={20} aria-hidden="true" />
            <div>
              <h3>{t.rewards}</h3>
              <p>{t.rewardsDescription}</p>
              <p>{t.rewardDefaults}</p>
            </div>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
