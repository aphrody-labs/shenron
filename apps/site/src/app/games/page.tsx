import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@shenron/ui/layout/PageHeader";
import { PageShell } from "@shenron/ui/layout/PageShell";
import { T } from "@/components/T";
import { BTN_PRIMARY, PANEL } from "@/components/games/planche";
import { ogMeta } from "@/lib/og";

export const metadata: Metadata = {
  title: "Mini-jeux",
  description:
    "Les mini-jeux Dragon Ball du serveur DBFR : 2048 Ki Merge, Pierre-Feuille-Ciseaux, Morpion, Pendu, Bingo et plus.",
  ...ogMeta({
    title: "Mini-jeux — DBFR",
    description: "Les mini-jeux Dragon Ball du serveur Discord DBFR.",
    canonical: "/games",
  }),
};

// `cmd` = commande Discord équivalente (du code, d'où la mono) ; `power` = repère
// de difficulté affiché tel quel, jamais caché derrière un survol. Le filet gi
// marque les jeux jouables ici ; les autres se jouent sur Discord.
const GAMES = [
  {
    name: "Dragon Pixel",
    cmd: null as string | null,
    variant: "solo",
    desc: "Affronte les 5 vagues d'ennemis en combat 2D rétro ! Choisis ton style (équilibré, vitesse, puissance), charge ton ki et déclenche ta transformation.",
    power: "5 Vagues",
    play: "/games/dragon-pixel" as string | null,
  },
  {
    name: "2048 : Ki Merge",
    cmd: null as string | null,
    variant: "solo",
    desc: "Joue au célèbre 2048 version Dragon Ball ! Fusionne tes guerriers jusqu'à Whis pour faire exploser ton compteur de Ki.",
    power: "16 384",
    play: "/games/2048" as string | null,
  },
  {
    name: "Pendu",
    cmd: "/pendu",
    variant: "solo / joueur",
    desc: "Devine le mot caché, 7 essais. Embed avec lettres trouvées/ratées triées, ASCII frame du pendu, victoire = +100 Ƶ.",
    power: "7 essais",
    play: null,
  },
  {
    name: "Morpion",
    cmd: "/morpion",
    variant: "vs IA / vs joueur",
    desc: "Tic-tac-toe 3×3. IA défensive (gagner > bloquer > centre > coin > random). Ligne gagnante surlignée en vert.",
    power: "Duel de Ki",
    play: "/games/tic-tac-toe" as string | null,
  },
  {
    name: "Pierre-Feuille-Ciseaux",
    cmd: "/pfc",
    variant: "solo / joueur",
    desc: "Pierre Feuille Ciseaux à coups de techniques de Ki. Adversaire IA random ou défi entre membres avec boutons Accepter/Refuser timeout 60s.",
    power: "3 techniques",
    play: "/games/rock-paper-scissors" as string | null,
  },
  {
    name: "Bingo",
    cmd: "/bingo",
    variant: "vs IA",
    desc: "Capteur de Ki : localise une puissance cachée entre 1 et 100. 10 scans max. Le capteur indique Ki supérieur / inférieur après chaque mesure.",
    power: "De 1 à 100",
    play: "/games/bingo" as string | null,
  },
];

export default function JeuxPage() {
  return (
    <PageShell>
      <PageHeader title="Jeux" className="mb-10" subtitle="Mise ton ki, encaisse les Zénis." />

      {/* Une colonne au téléphone, deux puis trois sur grand écran. Toute
			    l'information est lisible d'emblée : rien n'attend un survol. */}
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {GAMES.map((g) => (
          <li key={g.name}>
            <article
              className={`${PANEL} flex h-full flex-col border-l-4 p-5 sm:p-6 ${g.play ? "border-l-dbz-orange" : ""}`}
            >
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <h2 className="font-display text-2xl font-bold text-white">{g.name}</h2>
                {g.cmd && <code className="shrink-0 font-mono text-sm text-white/70">{g.cmd}</code>}
              </div>
              <dl className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[0.8125rem] text-white/60">
                <div className="flex gap-1">
                  <dt>Mode :</dt>
                  <dd className="text-white/85">{g.variant}</dd>
                </div>
                <div className="flex gap-1">
                  <dt className="sr-only">Repère</dt>
                  <dd className="tabular-nums text-white/85">{g.power}</dd>
                </div>
              </dl>
              <p className="flex-1 text-sm leading-relaxed text-white/75">{g.desc}</p>
              {g.play ? (
                <Link href={g.play} className={`${BTN_PRIMARY} mt-5 self-start`}>
                  <T k="communaute.jeux.play" />
                </Link>
              ) : (
                <p className="mt-5 text-[0.8125rem] text-white/60">
                  <T k="communaute.jeux.discordOnly" />
                </p>
              )}
            </article>
          </li>
        ))}
      </ul>

      <section className={`${PANEL} mt-10 p-5 sm:p-6`}>
        <h2 className="mb-3 font-display text-xl font-bold text-white">Récompenses</h2>
        <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm text-white/75">
          <div className="flex gap-2">
            <dt>Victoire</dt>
            <dd className="font-semibold tabular-nums text-dbz-green">+100 Ƶ</dd>
          </div>
          <div className="flex gap-2">
            <dt>Défaite</dt>
            <dd className="font-semibold tabular-nums text-white">−50 Ƶ</dd>
          </div>
        </dl>
      </section>
    </PageShell>
  );
}
