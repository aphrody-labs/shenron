import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";
import { DEFAULT_PUBLIC_ORIGINS } from "@aphrody/shenron-config/public-urls";
import { DEFAULT_SITE_SURFACE } from "@aphrody/shenron-config/game";

/**
 * Env typé site (Next 16). Validation au boot, échec rapide en prod.
 * Toutes les vars utilisées dans `apps/site` doivent passer ici — interdire
 * `process.env.X` direct dans le reste du code.
 */
export const env = createEnv({
  server: {
    SHENRON_SITE_SURFACE: z.enum(["site", "game"]).default(DEFAULT_SITE_SURFACE),
    SHENRON_HOME: z.string().trim().min(1).optional(),
    SHENRON_CANON_YOLO_ENABLED: z.enum(["0", "1"]).default("0"),
    SHENRON_CANON_YOLO_MODEL: z.string().trim().min(1).max(256).optional(),
    SHENRON_CANON_YOLO_MIN_CONFIDENCE: z.coerce.number().min(0).max(1).default(0.8),
    SHENRON_CANON_YOLO_TIMEOUT_MS: z.coerce.number().int().min(250).max(10000).default(3000),
    SHENRON_CANON_YOLO_PER_HOUR: z.coerce.number().int().min(1).max(60).default(30),
    SHENRON_CANON_YOLO_PER_DAY: z.coerce.number().int().min(1).max(1440).default(120),
    SHENRON_CANON_YOLO_MIN_SPACING_MS: z.coerce.number().int().min(1000).max(3600000).default(1000),
    TYPESAFE_API_KEY: z.string().trim().min(1).optional(),
    // `.trim()` partout : les env Vercel sont régulièrement pollués par un
    // `\n` final (posées via echo au lieu de printf). Un client_secret Discord
    // avec newline → Discord renvoie invalid_client à l'échange de code → aucun
    // ba_user créé → login "marche" mais ne persiste pas. Cf. mémoire
    // vercel-env-newline-pollution.
    DATABASE_URL: z.string().trim().url(),
    BETTER_AUTH_SECRET: z.string().trim().min(32),
    BETTER_AUTH_URL: z.string().trim().url().optional(),
    DISCORD_CLIENT_ID: z.string().trim().min(10),
    DISCORD_CLIENT_SECRET: z.string().trim().min(10),
    GOOGLE_CLIENT_ID: z.string().trim().min(1).optional(),
    GOOGLE_CLIENT_SECRET: z.string().trim().min(1).optional(),
    RESEND_API_KEY: z.string().trim().min(1).optional(),
    AUTH_EMAIL_FROM: z.string().trim().min(3).optional(),
    SMTP_USER: z.string().trim().min(3).optional(),
    SMTP_PASSWORD: z.string().min(1).optional(),
    SHENRON_BILLING_OUTBOX_TOKEN: z.string().trim().min(32).optional(),
    STRIPE_SECRET_KEY: z.string().trim().min(1).optional(),
    STRIPE_WEBHOOK_SECRET: z.string().trim().min(1).optional(),
    STRIPE_PRICE_VIP_MONTHLY: z.string().trim().min(1).optional(),
    STRIPE_PRICE_VIP_ANNUAL: z.string().trim().min(1).optional(),
    PAYPAL_CLIENT_ID: z.string().trim().min(1).optional(),
    PAYPAL_CLIENT_SECRET: z.string().trim().min(1).optional(),
    PAYPAL_WEBHOOK_ID: z.string().trim().min(1).optional(),
    PAYPAL_ENV: z.enum(["sandbox", "live"]).optional(),
    PAYPAL_PLAN_VIP_MONTHLY: z.string().trim().min(1).optional(),
    PAYPAL_PLAN_VIP_ANNUAL: z.string().trim().min(1).optional(),
    BUN_VIDEO_CRUNCHYROLL_ACCESS_TOKEN: z.string().trim().min(1).optional(),
    BUN_VIDEO_CRUNCHYROLL_BASIC_AUTHORIZATION: z
      .string()
      .trim()
      .regex(/^Basic [A-Za-z0-9+/]+=*$/)
      .optional(),
    BUN_VIDEO_CRUNCHYROLL_ACCOUNT_ID: z.string().trim().min(1).optional(),
    CRUNCHYROLL_EMAIL: z.string().trim().email().optional(),
    CRUNCHYROLL_PASSWORD: z.string().min(1).optional(),
    SHENRON_API_URL: z.string().trim().url().default(DEFAULT_PUBLIC_ORIGINS.api),
    // Read-only Shenron MCP server behind /mcp (shenron-mcp --http <addr> --public).
    // Hôte Bun (`shenron-server`) : si posée, il sert `/api/auth/*` (relais) et la session.
    SHENRON_HOST_URL: z.string().trim().url().optional(),
    SHENRON_MCP_URL: z.string().trim().url().optional(),
    SHENRON_ADMIN_TOKEN: z.string().trim().min(16).optional(),
    // Adresses ou CIDR d'administration (`@/lib/admin-ip`) : staff sans session ni jeton.
    SHENRON_ADMIN_IPS: z.string().trim().optional(),
    SHENRON_USER_SECRET: z.string().trim().min(32).optional(),
    OWNER_ID: z
      .string()
      .trim()
      .regex(/^\d{17,20}$/)
      .optional(),
    OAUTH_ALLOWED_USERS: z
      .string()
      .optional()
      .transform((v) =>
        v
          ? v
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : [],
      ),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  },
  client: {
    NEXT_PUBLIC_GAME_URL: z.string().url().optional(),
    NEXT_PUBLIC_GAME_API_URL: z.string().url().optional(),
    NEXT_PUBLIC_SHENRON_ASSETS_URL: z.string().url().optional(),
    // Base publique de l'API bot (assets self-hostés) — utilisable côté client
    // (ex. assetUrl dans le jeu 2048). Distincte de SHENRON_API_URL (server-only).
    NEXT_PUBLIC_SHENRON_API_URL: z.string().url().optional(),
    // URL publique du site + invitation Discord — résolues dans `@/lib/config`
    // (source unique des URL). Déclarées ici pour validation/typage.
    NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
    NEXT_PUBLIC_DISCORD_INVITE_URL: z.string().url().optional(),
    NEXT_PUBLIC_GTM_ID: z.string().optional(),
    NEXT_PUBLIC_GA_ID: z.string().optional(),
    NEXT_PUBLIC_ADSENSE_CLIENT: z.string().optional(),
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().trim().min(1).optional(),
    // IDs des blocs AdSense (`data-ad-slot`, 10 chiffres). Résolus par
    // `@/lib/ads` ; un emplacement sans ID reste éteint. Les annonces
    // automatiques ne dépendent d'aucun de ces IDs.
    NEXT_PUBLIC_ADSENSE_SLOT_ARTICLE: z.string().optional(),
    NEXT_PUBLIC_ADSENSE_SLOT_DISPLAY: z.string().optional(),
    NEXT_PUBLIC_ADSENSE_SLOT_INFEED: z.string().optional(),
    NEXT_PUBLIC_ADSENSE_LAYOUT_KEY_INFEED: z.string().optional(),
    NEXT_PUBLIC_ADSENSE_SLOT_MULTIPLEX: z.string().optional(),
    NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION: z.string().optional(),
  },
  experimental__runtimeEnv: {
    NEXT_PUBLIC_GAME_URL: process.env.NEXT_PUBLIC_GAME_URL,
    NEXT_PUBLIC_GAME_API_URL: process.env.NEXT_PUBLIC_GAME_API_URL,
    NEXT_PUBLIC_SHENRON_ASSETS_URL: process.env.NEXT_PUBLIC_SHENRON_ASSETS_URL,
    NEXT_PUBLIC_SHENRON_API_URL: process.env.NEXT_PUBLIC_SHENRON_API_URL,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_DISCORD_INVITE_URL: process.env.NEXT_PUBLIC_DISCORD_INVITE_URL,
    NEXT_PUBLIC_GTM_ID: process.env.NEXT_PUBLIC_GTM_ID,
    NEXT_PUBLIC_GA_ID: process.env.NEXT_PUBLIC_GA_ID,
    NEXT_PUBLIC_ADSENSE_CLIENT: process.env.NEXT_PUBLIC_ADSENSE_CLIENT,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_ADSENSE_SLOT_ARTICLE: process.env.NEXT_PUBLIC_ADSENSE_SLOT_ARTICLE,
    NEXT_PUBLIC_ADSENSE_SLOT_DISPLAY: process.env.NEXT_PUBLIC_ADSENSE_SLOT_DISPLAY,
    NEXT_PUBLIC_ADSENSE_SLOT_INFEED: process.env.NEXT_PUBLIC_ADSENSE_SLOT_INFEED,
    NEXT_PUBLIC_ADSENSE_LAYOUT_KEY_INFEED: process.env.NEXT_PUBLIC_ADSENSE_LAYOUT_KEY_INFEED,
    NEXT_PUBLIC_ADSENSE_SLOT_MULTIPLEX: process.env.NEXT_PUBLIC_ADSENSE_SLOT_MULTIPLEX,
    NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
  },
  // Skip validation au build (Vercel injecte les env vars au runtime,
  // pas toutes en build-time). Le runtime crash de toute façon si une
  // var manque (auth(), db(), etc. throwent leurs propres erreurs).
  skipValidation:
    process.env.SKIP_ENV_VALIDATION === "1" ||
    process.env.npm_lifecycle_event === "lint" ||
    process.env.npm_lifecycle_event === "build" ||
    process.env.NEXT_PHASE === "phase-production-build",
  emptyStringAsUndefined: true,
});
