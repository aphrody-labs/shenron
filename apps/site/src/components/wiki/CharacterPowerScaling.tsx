/* oxlint-disable react/no-array-index-key -- reviewed: legacy patterns, behavior preserved */
import Link from "next/link";
import { DEFAULT_POWER_SCALING_CONFIG } from "@/lib/canon-engine";
import { T } from "@/components/T";
import { WikiPowerNumber, WikiPowerText } from "@/components/wiki/WikiPublicText";

interface CharacterPowerScalingProps {
  characterName: string;
  characterId?: number;
  config?: typeof DEFAULT_POWER_SCALING_CONFIG;
}

export function CharacterPowerScaling({
  characterName,
  characterId,
  config = DEFAULT_POWER_SCALING_CONFIG,
}: CharacterPowerScalingProps) {
  // Filtrer les BP officiels correspondant au personnage
  const nomNorm = characterName.toLowerCase();
  const bpsOfficiels = config.officialBps.filter((bp) => {
    if (characterId && bp.characterId === characterId) return true;
    const bpNorm = bp.character.toLowerCase();
    return bpNorm.includes(nomNorm) || nomNorm.includes(bpNorm);
  });

  // Si le personnage est un Saiyan (Goku, Vegeta, Gohan, etc.), afficher les multiplicateurs
  const estSaiyan =
    nomNorm.includes("goku") ||
    nomNorm.includes("vegeta") ||
    nomNorm.includes("gohan") ||
    nomNorm.includes("trunks") ||
    nomNorm.includes("goten") ||
    nomNorm.includes("broly") ||
    nomNorm.includes("vegetto") ||
    nomNorm.includes("gogeta");

  return (
    <div className="space-y-8 text-white/80">
      {/* En-tête doctrine */}
      <div className="rounded-xl border border-dbz-orange/30 bg-black/40 p-5 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <span className="font-scouter text-xs uppercase tracking-widest text-dbz-orange">
              <T k="wikiPower.doctrine" />
            </span>
            <span className="rounded bg-dbz-orange/20 px-2 py-1 font-saiyan text-xs text-dbz-yellow">
              <T k="wikiPower.badge" />
            </span>
          </div>
          <Link
            href="/wiki/guide-officiel-power-scaling-sentoryoku-kiri"
            className="inline-flex min-h-11 items-center rounded-lg px-3 py-2 text-xs text-dbz-orange underline-offset-4 hover:bg-dbz-orange/10 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dbz-orange"
          >
            <T k="wikiPower.dossier" />
          </Link>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-white/65">
          <WikiPowerText k="doctrineCopy" />
        </p>
      </div>

      {/* Relevés chronologiques du personnage */}
      {bpsOfficiels.length > 0 ? (
        <div className="space-y-4">
          <h3 className="font-saiyan text-sm uppercase tracking-wider text-dbz-yellow">
            <T k="wikiPower.readings" values={{ name: characterName }} />
          </h3>
          <div className="grid gap-3 md:hidden">
            {bpsOfficiels.map((bp, i) => (
              <article key={i} className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-white/10 pb-3">
                  <h4 className="font-semibold text-white">{bp.saga}</h4>
                  <p className="font-mono text-base font-bold text-dbz-orange">
                    <WikiPowerNumber value={bp.bp} /> BP
                  </p>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-3 text-xs">
                  <div>
                    <dt className="text-white/50">
                      <T k="wikiPower.state" />
                    </dt>
                    <dd className="mt-1 text-white/90">{bp.state}</dd>
                  </div>
                  <div>
                    <dt className="text-white/50">
                      <T k="wikiPower.sensor" />
                    </dt>
                    <dd className="mt-1 text-white/90">
                      <WikiPowerText k={bp.scouter ? "scouterManga" : "daizenshuuSource"} />
                    </dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-white/50">
                      <T k="wikiPower.canonSource" />
                    </dt>
                    <dd className="mt-1 break-words text-white/80">{bp.source}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
          <div className="hidden overflow-x-auto rounded-xl border border-white/10 bg-black/20 md:block">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.02] text-xs uppercase tracking-wider text-white/55">
                  <th className="py-2.5 px-4">
                    <T k="wikiPower.saga" />
                  </th>
                  <th className="py-2.5 px-4">
                    <T k="wikiPower.state" />
                  </th>
                  <th className="py-2.5 px-4 font-mono">
                    <WikiPowerText k="battlePower" />
                  </th>
                  <th className="py-2.5 px-4">
                    <T k="wikiPower.sensor" />
                  </th>
                  <th className="py-2.5 px-4">
                    <T k="wikiPower.canonSource" />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {bpsOfficiels.map((bp, i) => (
                  <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-2.5 px-4 font-medium text-white/90">{bp.saga}</td>
                    <td className="py-2.5 px-4 text-white/70">{bp.state}</td>
                    <td className="py-2.5 px-4 font-mono font-bold text-dbz-orange text-sm">
                      <WikiPowerNumber value={bp.bp} />
                    </td>
                    <td className="py-2.5 px-4">
                      {bp.scouter ? (
                        <span className="inline-flex items-center rounded border border-green-500/30 bg-green-500/10 px-2 py-1 text-xs text-green-300">
                          <WikiPowerText k="scouterManga" />
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded border border-yellow-500/30 bg-yellow-500/10 px-2 py-1 text-xs text-yellow-300">
                          <WikiPowerText k="daizenshuuSource" />
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-xs text-white/60">{bp.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 bg-black/20 p-5 text-center text-xs text-white/50">
          <p>
            <WikiPowerText k="noOfficialReadings" />
          </p>
          <p className="mt-1 text-white/35">
            <WikiPowerText k="unmeasuredNarrative" />
          </p>
        </div>
      )}

      {/* Multiplicateurs de transformation (si Saiyan) */}
      {estSaiyan && (
        <div className="space-y-4">
          <h3 className="font-saiyan text-sm uppercase tracking-wider text-dbz-yellow">
            <T k="wikiPower.multipliers" />
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {config.multipliers
              .filter((m) => m.multiplier > 0)
              .map((m, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-2 hover:border-dbz-orange/40 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-xs">{m.form}</span>
                    <span className="font-mono font-bold text-dbz-orange text-sm">
                      x{m.multiplier}
                    </span>
                  </div>
                  <p className="text-xs text-white/60">
                    <WikiPowerText k="base" /> <span className="text-white/80">{m.baseForm}</span>
                  </p>
                  {m.notes && <p className="text-xs leading-relaxed text-white/55">{m.notes}</p>}
                  <div className="border-t border-white/5 pt-2 text-xs text-white/50">
                    <WikiPowerText k="source" /> {m.source}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Échelle magique Kiri (Arc Buu) */}
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 space-y-3">
        <h3 className="font-saiyan text-sm uppercase tracking-wider text-dbz-yellow">
          <T k="wikiPower.kiriTitle" />
        </h3>
        <p className="text-xs leading-relaxed text-white/60">
          <WikiPowerText k="kiriDescription" />
        </p>
        <div className="grid gap-3 sm:grid-cols-3 pt-1">
          <div className="rounded-lg border border-white/10 bg-black/30 p-3">
            <span className="text-xs uppercase text-white/55">Yakon</span>
            <p className="font-mono text-lg font-bold text-dbz-orange">800 Kiri</p>
            <p className="text-xs text-white/60 mt-1">
              <T k="wikiPower.yakonNote" />
            </p>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/30 p-3">
            <span className="text-xs uppercase text-white/55">
              <WikiPowerText k="gokuSuperSaiyan2" />
            </span>
            <p className="font-mono text-lg font-bold text-dbz-orange">3 000 Kiri</p>
            <p className="text-xs text-white/60 mt-1">
              <WikiPowerText k="sensorSaturated" />
            </p>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/30 p-3">
            <span className="text-xs uppercase text-white/55">
              <WikiPowerText k="planetaryThreshold" />
            </span>
            <p className="font-mono text-lg font-bold text-dbz-yellow">200 - 300 Kiri</p>
            <p className="text-xs text-white/60 mt-1">
              <WikiPowerText k="planetEnergy" />
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
