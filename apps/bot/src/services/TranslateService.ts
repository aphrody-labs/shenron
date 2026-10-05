import { singleton, container } from "tsyringe";
import { env } from "~/lib/env";
import { logger } from "~/lib/logger";
import { SettingsService } from "~/services/SettingsService";
import { AphrodyComputeClient } from "@shenron/pipeline/aphrody";
import { resolveLibreTranslateUrl } from "@shenron/config/services";

// Helper settings-aware : lit la setting, fallback const default
async function getString(key: string, def: string): Promise<string> {
  try {
    return await container.resolve(SettingsService).getString(key, def);
  } catch {
    return def;
  }
}

/**
 * Sonde de la pile OCR + traduction, appelée au démarrage (`boot-audit.ts`) et par l'API
 * de services (`translate.probe`). Aucun provider ne demande de clé API.
 *
 * - **OCR : Aphrody** (API privée du moteur IA, `AphrodyComputeClient.health().ocr`).
 * - **Lingva Translate** (AGPL-3.0), proxy open source de Google Translate : plusieurs
 *   instances publiques essayées en cascade (`LINGVA_INSTANCE` en tête, puis la setting
 *   `translate.lingva_instances`). Endpoint sondé : `GET {instance}/api/v1/auto/en/test`.
 *   Doc : https://github.com/thedaviddelta/lingva-translate
 * - **Google `gtx`**, endpoint utilisé par Chrome, sans clé, rate-limité par IP :
 *   `GET https://translate.googleapis.com/translate_a/single?client=gtx&…`.
 * - **LibreTranslate** (AGPL-3.0), self-host en dernier filet (`LIBRETRANSLATE_URL`,
 *   défaut de `@shenron/config/services`) : `GET {base}/languages`.
 *
 * La traduction elle-même (cascade Lingva → Google → LibreTranslate) est portée par
 * `@shenron/media/translation-http`.
 */

export type TranslateProbe = {
  ocr: boolean;
  translate: boolean;
  lingva: boolean | null;
  google: boolean | null;
  libretranslate: boolean | null;
};

/**
 * Instances Lingva publiques connues, essayées en cascade. Réordonnées
 * 2026-04 après vérif live : `lingva.ml` est derrière un challenge
 * Cloudflare (HTML 403 sur les bots), `lingva.thedaviddelta.com` retourne
 * 503 DEPLOYMENT_PAUSED. On garde quand même les 4 — si une revient ou si
 * une nouvelle est ajoutée à la liste officielle on en bénéficie sans
 * redéploiement. Liste de référence :
 * https://github.com/thedaviddelta/lingva-translate#instances
 */
const LINGVA_INSTANCES = [
  "https://translate.plausibility.cloud",
  "https://lingva.lunar.icu",
  "https://lingva.ml",
  "https://lingva.thedaviddelta.com",
];

@singleton()
export class TranslateService {
  /** À appeler au boot (boot-audit.ts) — détecte les services disponibles. */
  async probe(): Promise<TranslateProbe> {
    // 1. OCR Aphrody disponible ?
    let ocr: boolean;
    try {
      ocr = (await new AphrodyComputeClient().health()).ocr;
    } catch {
      ocr = false;
    }
    // 2. LibreTranslate up ?
    let libretranslate: boolean;
    try {
      const base = resolveLibreTranslateUrl({ LIBRETRANSLATE_URL: env.LIBRETRANSLATE_URL });
      const res = await fetch(`${base}/languages`, {
        signal: AbortSignal.timeout(3_000),
      });
      libretranslate = res.ok;
    } catch {
      libretranslate = false;
    }
    // 3. Au moins une instance Lingva atteignable ?
    let lingva = false;
    for (const inst of await this.lingvaInstancesDynamic()) {
      try {
        const res = await fetch(`${inst}/api/v1/auto/en/test`, {
          signal: AbortSignal.timeout(3_000),
        });
        if (res.ok) {
          lingva = true;
          break;
        }
      } catch {
        /* essaie l'instance suivante */
      }
    }
    // 4. Google gtx atteignable ?
    let google: boolean;
    try {
      const res = await fetch(
        "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=fr&dt=t&q=ok",
        { signal: AbortSignal.timeout(3_000) },
      );
      google = res.ok;
    } catch {
      google = false;
    }

    const result: TranslateProbe = {
      ocr,
      translate: lingva || google || libretranslate,
      lingva,
      google,
      libretranslate,
    };
    logger.info(result, "TranslateService probe");
    return result;
  }

  /** Liste des instances Lingva à essayer, override en tête si configuré. */
  private lingvaInstances(): string[] {
    const override = env.LINGVA_INSTANCE?.replace(/\/+$/, "");
    const base = LINGVA_INSTANCES.map((u) => u.replace(/\/+$/, ""));
    if (!override) return base;
    return [override, ...base.filter((u) => u !== override)];
  }

  /**
   * Variante settings-aware : si `translate.lingva_instances` est défini
   * (CSV ou JSON array), l'utilise — sinon fallback liste hardcoded.
   * Override env reste prioritaire.
   */
  private async lingvaInstancesDynamic(): Promise<string[]> {
    const raw = await getString("translate.lingva_instances", "").catch(() => "");
    if (!raw.trim()) return this.lingvaInstances();
    let list: string[] = [];
    if (raw.trim().startsWith("[")) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) list = parsed.filter((s) => typeof s === "string");
      } catch {
        /* fallback CSV */
      }
    }
    if (list.length === 0)
      list = raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    const override = env.LINGVA_INSTANCE?.replace(/\/+$/, "");
    const base = list.map((u) => u.replace(/\/+$/, ""));
    if (!override) return base;
    return [override, ...base.filter((u) => u !== override)];
  }
}
