"use client";
// SPDX-License-Identifier: Apache-2.0
import Link from "next/link";
import {
  ArrowRight,
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
import { useLangue } from "@/lib/i18n/client";
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
  { id: "pixel", href: "/games/dragon-pixel", icon: Gamepad2 },
  { id: "xenoverse", href: "/games/xenoverse-2", icon: ScanLine },
  { id: "console", href: "/games/console", icon: MonitorPlay },
] as const;
export function GamesHub() {
  const { locale } = useLangue();
  const t = dictionaries[locale];
  return (
    <PageShell rhythm="tight" className={styles.hub}>
      <header className={styles.hero}>
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
        <Link href="/wiki/games" className={styles.textLink}>
          {t.catalogueAction}
          <ArrowRight size={18} aria-hidden="true" />
        </Link>
      </aside>
      <section id="browser-games" aria-labelledby="browser-heading" className={styles.section}>
        <div className={styles.sectionHeading}>
          <h2 id="browser-heading">{t.browserTitle}</h2>
          <p>{t.browserIntro}</p>
        </div>
        <ul className={styles.grid}>
          {games.map(({ id, href, icon: Icon, account }) => (
            <li key={id}>
              <article className={styles.card}>
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
