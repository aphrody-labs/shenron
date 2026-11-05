import { withBun } from "@aphrody/next-bun";
import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import {
  DEFAULT_PUBLIC_ORIGINS,
  ownImageRemotePatterns,
  resolveApiUrl,
  resolveSiteUrl,
} from "@aphrody/shenron-config/public-urls";
import { sitePublicRedirects } from "@aphrody/shenron-images/resolve";
import {
  AUTH_ROUTE_ALIASES,
  PUBLIC_ROUTE_RENAMES,
  nextApiRewrites,
  nextRedirectsOf,
} from "./src/lib/legacy-routes";

const cdnUrl = process.env.NEXT_PUBLIC_CDN_URL?.trim().replace(/\/+$/, "");

// Origine des scripts `/_next/static/*` : `assetPrefix` pointe sur le CDN, donc
// `'self'` seul ferait de chaque chunk une violation Report-Only.
const cspCdnOrigin = (() => {
  if (!cdnUrl) return "";
  try {
    return new URL(cdnUrl).origin;
  } catch {
    return "";
  }
})();
const CSP_SCRIPT_SRC = [
  "'self' 'unsafe-inline' 'wasm-unsafe-eval' blob:",
  ...(cspCdnOrigin ? [cspCdnOrigin] : []),
  "https://www.googletagmanager.com https://*.google-analytics.com https://pagead2.googlesyndication.com https://*.googlesyndication.com https://*.doubleclick.net https://*.gstatic.com https://*.adtrafficquality.google https://*.google.com https://*.vercel-scripts.com",
].join(" ");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Native SDK loading is deferred to the Bun host, outside Next's server bundle.
  serverExternalPackages: ["@aphrody/bun", "@aphrody/bun-runtime-sdk/yolo"],
  // Repli documenté pour les VPS contraints : Webpack sans minification évite
  // le pic mémoire du minifieur lors d'un build à froid. L'option est activée
  // uniquement par la pipeline locale de secours et ne change pas les builds
  // Turbopack habituels.
  webpack(config, { dev }) {
    if (!dev && process.env.SHENRON_BUILD_LOW_MEMORY === "1") {
      config.optimization.minimize = false;
    }
    return config;
  },
  // Serveur de développement seulement. Sans cette liste, `next dev` répond
  // **403** à toute requête `/_next/*` portant un en-tête `Origin` — donc à une
  // partie des chunks demandés par le navigateur : la page se rend mais ne
  // s'hydrate jamais, et TOUT devient incliquable. C'est un piège coûteux quand
  // on audite justement des clics morts : le symptôme est identique à un bug
  // applicatif. Aucune incidence en production (`next start` ignore ce champ).
  allowedDevOrigins: ["127.0.0.1", "localhost", new URL(resolveSiteUrl(process.env)).host],
  // Protection contre le version skew (self-hosting `next start` solo, sans le
  // skew-protection Vercel). SHA court injecté par le workflow de build
  // `site-artifact` (`NEXT_DEPLOYMENT_ID`). Les assets portent `?dpl=<id>` et les
  // navigations un header `x-deployment-id` ; sur mismatch, Next force un reload
  // dur au lieu de throw `Failed to find Server Action` côté client périmé.
  // Undefined en dev local → ignoré. Cf. node_modules/next/dist/docs/.../self-hosting.md.
  deploymentId: process.env.NEXT_DEPLOYMENT_ID,
  // Les chunks versionnés de Next peuvent être servis par le CDN. Cette option
  // ne concerne que `/_next/static` ; les fichiers `public/` et les routes API
  // gardent leurs URL explicites afin de ne pas mélanger contenu et sessions.
  assetPrefix: cdnUrl || undefined,

  // Pas de `x-powered-by: Next.js` : la version exacte du framework est une
  // info gratuite pour un scan automatisé, et elle ne sert à personne côté client.
  poweredByHeader: false,

  // Source maps navigateur publiées : Lighthouse (`valid-source-maps`, Bonnes pratiques)
  // échoue quand un gros JS first-party n'en a pas. Le coût est mémoire/temps au build
  // (c'était la raison de l'ancienne désactivation) : `SHENRON_BROWSER_SOURCEMAPS=0`
  // les coupe sur une machine de build contrainte.
  productionBrowserSourceMaps: process.env.SHENRON_BROWSER_SOURCEMAPS !== "0",
  // Source maps du prérendu : mêmes règles que les source maps serveur (`experimental`).
  enablePrerenderSourceMaps: process.env.SHENRON_SERVER_SOURCEMAPS === "1",

  // Répertoire de sortie pilotable par env. Le workflow `site-artifact` bâtit
  // dans `.next-build` hors VPS pour garder la release active indépendante du
  // build. Repartir d'un répertoire vide force aussi un build froid. Mesuré le
  //      2026-08-14 : à froid ~8,1 Gio de RSS, en incrémental (cache Turbopack
  //      déjà présent) ~10,5 Gio → OOM killer sur ce VPS de 11 Gio.
  // Au runtime, aucun slot ne pose la variable : `next start` lit bien `.next`.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",

  // `output: "standalone"` seulement pour le binaire autonome (`bun run build:server`,
  // NEXT_OUTPUT=standalone) : le file tracing (nft) monte le build de ~8,1 à ~10,4 Gio
  // de RSS (mesuré le 2026-08-14), trop pour le VPS de 11 Gio ; il est donc fait sur
  // la machine de build. Le build classique (`next start`) reste inchangé.
  ...(process.env.NEXT_OUTPUT === "standalone"
    ? {
        output: "standalone" as const,
        // Dynamic fs access in shared packages must never drag the repository (sources, tests,
        // databases, corpora) into the server. Globs are relative to apps/site.
        outputFileTracingExcludes: {
          "*": [
            "../../crates/**",
            "../../target/**",
            "../../data/**",
            "../../var/**",
            "../../docs/**",
            "../../plugin/**",
            "../../scripts/**",
            "../../deploy/**",
            "../../apps/bot/**",
            "../../packages/*/test/**",
            "../../packages/*/scripts/**",
            "./tests/**",
            "./src/**",
            "./scripts/**",
            "./data/**",
            "./shenron-media-masters/**",
            "./.next-build/**",
            "./.next-dev/**",
            "./public/**",
            "**/*.db",
            "**/*.db-*",
            "**/*.sqlite*",
            "**/*.env*",
            "**/*.tsbuildinfo",
            "**/*.map",
          ],
        },
      }
    : {}),

  // View Transitions API (React `<ViewTransition>`) — morph d'élément partagé
  // grille→fiche, slides directionnels. Sans support navigateur, navigation
  // normale sans animation (progressive enhancement). Cf. components/ViewTransition.tsx.
  //
  // Plus de drapeau `experimental.viewTransition` depuis Next 16.4-canary : la
  // clé a disparu de `ExperimentalConfig` (le type-check la refuse) parce que
  // la fonctionnalité est stabilisée — l'App Router de Next 16 tourne sur la
  // canary de React, qui expose `<ViewTransition>` sans rien à activer.
  experimental: {
    // Repli de build pour les hôtes contraints : `next build --webpack`
    // active ce mode afin de réduire le pic mémoire au prix d'un build plus lent.
    // Sans effet sur le chemin Turbopack habituel.
    webpackMemoryOptimizations: true,
    // Type-check via the TypeScript 7 native CLI (fixed decision 1, docs/architecture/STACK.md).
    useTypeScriptCli: true,
    // Parallélisme de la génération statique — soupape mémoire éprouvée du build.
    // Borner à 1 CPU et 2 de concurrence statique évite l'explosion RSS sur VPS.
    ...(process.env.BUILD_CPUS ? { cpus: Number(process.env.BUILD_CPUS) } : { cpus: 1 }),
    ...(process.env.BUILD_STATIC_CONCURRENCY
      ? { staticGenerationMaxConcurrency: Number(process.env.BUILD_STATIC_CONCURRENCY) }
      : { staticGenerationMaxConcurrency: 2 }),
    // Off by default: a build that never restores `<distDir>/cache` only pays the
    // writes. The factory reuses one worktree and keeps that cache
    // (`SHENRON_NEXT_BUILD_CACHE=1`, scripts/build/server.ts), so warm builds reuse it.
    turbopackFileSystemCacheForBuild: process.env.SHENRON_NEXT_BUILD_CACHE === "1",
    // Source maps serveur : 101,6 Mio sur 184,4 Mio de `.next-build`. Coupées par défaut ;
    // `SHENRON_SERVER_SOURCEMAPS=1` les rallume pour un build de diagnostic.
    serverSourceMaps: process.env.SHENRON_SERVER_SOURCEMAPS === "1",
    // `lucide-react` et `date-fns` sont déjà dans la liste par défaut de Next ;
    // `schema-dts` (types) et `postgres` (serveur) ne sont pas des barils clients.
    optimizePackageImports: [
      "@tanstack/react-query",
      "motion",
      "better-auth",
      "@tiptap/core",
      "@tiptap/react",
    ],
  },

  // Image optimization Vercel CDN — AVIF prioritaire, WebP fallback.
  // Docs : https://nextjs.org/docs/app/api-reference/components/image#formats
  // Note : chaque format est caché séparément (storage ↑ mais latence ↓ après warm).
  images: {
    // The autonomous binary (public/desktop builds, SHENRON_IMAGES_UNOPTIMIZED=1) serves the
    // sources as they are: no platform-specific image optimizer in the payload.
    unoptimized: process.env.SHENRON_IMAGES_UNOPTIMIZED === "1",
    // Optimisation RÉTABLIE (elle était coupée globalement). Le motif d'origine
    // — sur Vercel, une image remplacée depuis l'admin restait figée à jamais —
    // ne s'applique plus depuis l'auto-hébergement : l'optimiseur local expire
    // son cache disque selon le `Cache-Control` de la source. Et les seules
    // images réellement remplaçables en place (`assets/wiki/**`) sont exclues
    // une par une, cf. `lib/images.ts` + `isEditableAsset`.
    //
    // L'enjeu : une vignette d'épisode passe de ~60 Kio (JPEG source) à ~15 Kio
    // (AVIF à la largeur rendue), soit −73 % ; les pages de liste en portent
    // jusqu'à 85.
    formats: ["image/avif", "image/webp"],
    // Requis depuis Next 16 : sans liste blanche, n'importe qui peut faire
    // recalculer l'image à toutes les qualités. Une seule valeur suffit ici.
    qualities: [70, 75],
    // Plancher du cache disque (`.next/cache/images`). Le TTL réel est le
    // MAXIMUM de cette valeur (4 h, défaut Next 16) et du `max-age` de la source : 1 jour pour
    // `/assets/**`, un an pour `/db/**` (immuable). `aphrody-infra` conserve
    // le cache mutable hors release :
    // sans ça, chaque mise en ligne repartait d'un cache froid et refaisait
    // toutes les transformations sur un VPS déjà juste en mémoire.
    minimumCacheTTL: 14400,
    // Vignettes de grille : le site n'a pas de rendu au-delà de ~640 px de large
    // pour une carte. Restreindre la liste évite de faire calculer — et stocker —
    // des variantes que personne ne demande.
    imageSizes: [64, 96, 128, 192, 256, 384],
    deviceSizes: [640, 828, 1080, 1200, 1920],
    // Bot expose les assets DB via /db/* (Cache-Control immutable + Vary:Accept côté bot).
    remotePatterns: [
      // Origines propres (CDN, API/assets du bot, site, Discord) : dérivées des
      // mêmes variables que `@/lib/config` via `@aphrody/shenron-config/public-urls`.
      ...ownImageRemotePatterns(process.env),
      // Catalogue mirrors have a stable image owner, independent of the JS chunk CDN.
      {
        protocol: "https",
        hostname: new URL(DEFAULT_PUBLIC_ORIGINS.cdn).hostname,
        pathname: "/assets/**",
      },
      {
        protocol: "https",
        hostname: new URL(DEFAULT_PUBLIC_ORIGINS.cdn).hostname,
        pathname: "/media/**",
      },
      // Posters films (MyAnimeList), news officielles (DB Official).
      { protocol: "https", hostname: "img.youtube.com", pathname: "/vi/**" },
      { protocol: "https", hostname: "myanimelist.net", pathname: "/**" },
      {
        protocol: "https",
        hostname: "fr.dragon-ball-official.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "en.dragon-ball-official.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "www.dragon-ball-official.com",
        pathname: "/**",
      },
      // Les OpenGraph du portail japonais utilisent l'hôte nu (sans `www`).
      // Sans cette entrée, les 12 actus importées sont lisibles mais leurs
      // couvertures font échouer `next/image` à l'exécution.
      {
        protocol: "https",
        hostname: "dragon-ball-official.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "s4.anilist.co",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "cdn.myanimelist.net",
        pathname: "/**",
      },
      // Stills d'épisodes (TMDB).
      { protocol: "https", hostname: "image.tmdb.org", pathname: "/**" },
      {
        protocol: "https",
        hostname: "media.kitsu.io",
        pathname: "/**",
      },
      // Scans et couvertures DragonBallCN (archive HD)
      { protocol: "https", hostname: "comic.dragonballcn.com", pathname: "/**" },
      { protocol: "http", hostname: "comic.dragonballcn.com", pathname: "/**" },
    ],
    dangerouslyAllowSVG: false,
  },

  compress: true,

  // Dédoublonnage des anciennes routes films (id-based, API) vers la source
  // canonique /wiki/movies (Neon, slug-based). Redirect au niveau routing → 308
  // dur avant tout rendu (un redirect() en composant dégradait en navigation
  // client 200 à cause du layout /wiki force-dynamic qui flush en streaming).
  async redirects() {
    return [
      // Copies binaires dédoublonnées de `public/` (manifeste
      // `@aphrody/shenron-images/asset-aliases.json`) : l'ancienne URL garde sa réponse.
      ...sitePublicRedirects().map(([source, destination]) => ({
        source: source.replace(/[():*+?{}]/g, "\\$&"),
        destination,
        permanent: true,
      })),
      // Consolidation éditoriale : les anciens index ne sont plus des
      // destinations autonomes. Les détails conservés restent accessibles aux
      // liens d'archives, mais les entrées publiques convergent vers leur hub.
      { source: "/wiki/arcs", destination: "/wiki/sagas", permanent: true },
      // Routes en anglais : chaque ancien segment français (`/wiki/personnages`, `/jeux`,
      // `/wiki-bientot`…) répond un 308 vers son équivalent, sous-chemins et requête
      // conservés ; les rubriques retirées (combats, tournois, voix, romans, dragons,
      // cosmologie) convergent vers leur hub. Table unique : `src/lib/legacy-routes.ts`.
      ...nextRedirectsOf(PUBLIC_ROUTE_RENAMES),
      // Adresses de compte usuelles (`/login`, `/register`, `/account`…) vers la page
      // de connexion unique ou l'espace compte ; correspondance exacte, requête gardée.
      ...nextRedirectsOf(AUTH_ROUTE_ALIASES),
      // Ancienne vue série épisodes par query (`?series=X`) → route dédiée
      // STATIQUE `/wiki/episodes/series/X` (la landing est passée statique pour
      // débloquer l'interception @modal + le cache CDN). Capture la valeur du
      // query dans `:series`. `page`/`view` obsolètes (grille complète).
      {
        source: "/wiki/episodes",
        has: [{ type: "query", key: "series", value: "(?<series>[^&]+)" }],
        destination: "/wiki/episodes/series/:series",
        permanent: true,
      },
      { source: "/wiki/dragon-ball/movies", destination: "/wiki/movies", permanent: true },
      { source: "/wiki/dragon-ball/movie/:id", destination: "/wiki/movies", permanent: true },
      // Ancien index « Encyclopédie » fourre-tout → page Personnages dédiée.
      // 308 dur au routing (un permanentRedirect() en composant dégradait en
      // page 200 + <meta refresh>, cf. layout /wiki en streaming). Les routes
      // détail enfants (/wiki/dragon-ball/character|planet|techniques/…) ne
      // sont PAS capturées : la source est le chemin exact, sans wildcard.
      { source: "/wiki/dragon-ball", destination: "/wiki/characters", permanent: true },
      { source: "/profile", destination: "/profile/me", permanent: true },
      // Journal : la fiche article vivait sous /post/:slug alors que l'index et
      // ── Unification intégrale : Articles, Journal, Actualités, CMS → /news ──
      // Consolidation sous le service unique canonique https://dragonballfr.com/news
      { source: "/actualites", destination: "/news", permanent: true },
      { source: "/actualites/:slug", destination: "/news/:slug", permanent: true },
      { source: "/actualites/page/:n", destination: "/news/page/:n", permanent: true },
      { source: "/actualites/theme/:tag", destination: "/news/theme/:tag", permanent: true },
      { source: "/actualites/rss.xml", destination: "/news/rss.xml", permanent: true },
      { source: "/articles", destination: "/news", permanent: true },
      { source: "/articles/:slug", destination: "/news/:slug", permanent: true },
      { source: "/article/:slug", destination: "/news/:slug", permanent: true },
      { source: "/journal", destination: "/news", permanent: true },
      { source: "/journal/:slug", destination: "/news/:slug", permanent: true },
      { source: "/cms", destination: "/news", permanent: true },
      { source: "/cms/:slug", destination: "/news/:slug", permanent: true },
      { source: "/posts", destination: "/news", permanent: true },
      { source: "/post/:slug", destination: "/news/:slug", permanent: true },
      { source: "/wiki/news", destination: "/news", permanent: true },
      // Flux public des révisions du wiki, retiré le 2026-09-12 : il racontait la
      // fabrication du site au lieu de Dragon Ball. 308 au ROUTING et non
      // `permanentRedirect()` dans la page — mesuré en production le même jour,
      // sous le layout `/wiki` (streaming) ce dernier dégradait en page 200 +
      // `<meta http-equiv="refresh">`, donc un lien toujours vivant pour les robots.
      { source: "/wiki/modifications", destination: "/news", permanent: true },
      // ── Unification Toriyama & Doctrine Canon → /wiki/canon ──
      {
        source: "/wiki/akira-toriyama-tankobon-introductions",
        destination: "/wiki/canon",
        permanent: true,
      },
      {
        source: "/wiki/doctrine-artistique-akira-toriyama",
        destination: "/wiki/canon",
        permanent: true,
      },
      { source: "/wiki/archives-akira-toriyama", destination: "/wiki/canon", permanent: true },
      // Rapatriement des fiches sous le segment de leur propre index. Le site
      // mélangeait deux conventions : l'index en français à la racine
      // (`/wiki/personnages`, `/wiki/planetes`) et la fiche en anglais sous un
      // préfixe (`/wiki/dragon-ball/character/12`, `/wiki/dragon-ball/planet/3`),
      // pendant que les rubriques voisines — races, arcs, sagas, films — vivaient
      // toutes sous un segment unique. Les techniques cumulaient : leur INDEX
      // lui-même était sous `/wiki/dragon-ball/`. Tout est désormais sous
      // `/wiki/<rubrique>[/<clé>]`, et ces 308 récupèrent l'existant.
      {
        source: "/wiki/dragon-ball/character/:id",
        destination: "/wiki/characters/:id",
        permanent: true,
      },
      // Pointe DIRECTEMENT sur les lieux (la cosmologie y a été fondue) : passer par
      // `/wiki/planetes/:id` enchaînerait plusieurs 308 pour un même clic.
      {
        source: "/wiki/dragon-ball/planet/:id",
        destination: "/wiki/locations",
        permanent: true,
      },
      // La rubrique « Planètes » était devenue « Cosmologie » (`db_planets` héberge
      // aussi des dimensions, des demeures divines et des univers entiers), puis a été
      // fondue dans les lieux : `/wiki/planetes` et `/wiki/cosmologie` répondent par la
      // table de `legacy-routes.ts` (un `redirect()` de composant dégradait en 200 +
      // `<meta refresh>` sous le layout `/wiki`, piège du streaming).
      {
        source: "/wiki/dragon-ball/techniques/:slug",
        destination: "/wiki/techniques/:slug",
        permanent: true,
      },
      { source: "/wiki/dragon-ball/techniques", destination: "/wiki/techniques", permanent: true },
    ];
  },

  async rewrites() {
    const botHost = resolveApiUrl(process.env);
    // `fallback` (et NON un tableau = `afterFiles`) : ce rewrite ne sert que les
    // MÉDIAS wiki (`/wiki/<asset>.mp4|webp…`) proxifiés vers le bot. En
    // `afterFiles`, il préemptait les routes dynamiques (`/wiki/movies/[slug]`,
    // `/wiki/sagas/[slug]`…) sous `next start` → fiches 403 (le bot renvoyait
    // « Extension non autorisée »). En `fallback`, il ne se déclenche que si
    // AUCUNE page (statique ou dynamique) ne matche → les fiches restent à Next.
    return {
      // Discovery card of the public MCP server (served by /api/mcp/card when deployed).
      // Anciens chemins d'API en français, servis par le handler anglais (pas de 308 :
      // un POST redirigé deviendrait un GET chez certains clients).
      beforeFiles: [
        { source: "/.well-known/mcp.json", destination: "/api/mcp/card" },
        ...nextApiRewrites(),
      ],
      fallback: [
        {
          source: "/wiki/:path*",
          destination: `${botHost}/assets/wiki/:path*`,
        },
      ],
    };
  },

  async headers() {
    return [
      {
        source: "/_next/static/(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/fonts/(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/wasm/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
          { key: "Content-Type", value: "application/wasm" },
          { key: "Access-Control-Allow-Origin", value: "*" },
        ],
      },
      {
        source: "/_next/image(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=2592000",
          },
        ],
      },
      {
        source: "/wiki/(.*)",
        headers: [
          {
            key: "Cache-Control",
            // Les routes wiki sont rendues avec ISR, mais leurs réglages
            // éditoriaux (bannières, chronologie…) doivent être visibles dès
            // `revalidatePath`. Le navigateur/CDN peut donc stocker mais doit
            // revalider avant chaque réemploi.
            value: "public, max-age=0, must-revalidate",
          },
        ],
      },
      {
        // Accueil : le HTML est identique pour tous (la langue et l'état communautaire
        // sont résolus côté client), mais deux `fetch` `no-store` (home-config,
        // banner-config) le rendent dynamique, donc servi `private, no-store`. Pour un
        // visiteur SANS cookie de session ni jeton admin, on autorise un cache partagé
        // court. Avec un cookie, la règle ne s'applique pas : en-tête Next par défaut.
        source: "/",
        missing: [
          { type: "cookie", key: "dbfr_admin" },
          { type: "cookie", key: "better-auth.session_token" },
          { type: "cookie", key: "__Secure-better-auth.session_token" },
          { type: "header", key: "authorization" },
          { type: "header", key: "x-admin-token" },
        ],
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, s-maxage=60, stale-while-revalidate=600",
          },
        ],
      },
      {
        source: "/assets/(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
      {
        source: "/(.*)\\.(ico|png|svg|webp|avif|jpg|jpeg|woff2)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=604800, stale-while-revalidate=2592000",
          },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          // Découverte par les robots et agents IA, invisible au lecteur : la carte du
          // site pour les LLM, le serveur MCP et la carte d'agent A2A (RFC 8288).
          {
            key: "Link",
            value:
              '</llms.txt>; rel="describedby"; type="text/plain", </.well-known/mcp.json>; rel="service-desc"; type="application/json", </.well-known/agent-card.json>; rel="service-meta"; type="application/json"',
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // CSP volontairement RÉDUITE aux directives qui ne peuvent rien
          // casser ici. Pas de `script-src` / `frame-src` : la page charge
          // GTM + AdSense (scripts tiers injectés dynamiquement) et embarque
          // les lecteurs vidéo des hébergeurs (vidmoly, mail.ru, yourupload…)
          // dont la liste bouge — une allowlist figée couperait la lecture.
          // Ce qui reste couvre les vecteurs réels :
          //   object-src   → plus de <embed>/<object> Flash-like injectés
          //   base-uri     → interdit de réécrire la base des URL relatives
          //   form-action  → un <form> injecté ne peut pas exfiltrer ailleurs
          //   frame-ancestors → clickjacking (doublon moderne de X-Frame-Options)
          {
            key: "Content-Security-Policy",
            value: "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'",
          },
          // `script-src` en Report-Only UNIQUEMENT : mesure ce qu'une politique stricte
          // casserait (GTM, AdSense, lecteurs vidéo tiers) sans rien bloquer. Les
          // violations partent vers `/api/csp-report` (Chrome les
          // écrit aussi dans la console). À promouvoir en `Content-Security-Policy` seulement
          // après un relevé propre.
          {
            key: "Content-Security-Policy-Report-Only",
            value:
              `script-src ${CSP_SCRIPT_SRC}; report-uri /api/csp-report`,
          },
          // Aucune de ces API n'est utilisée par le site : les refuser évite
          // qu'un script tiers (régie pub) puisse les demander en notre nom.
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), browsing-topics=(), interest-cohort=(), payment=(), usb=()",
          },
          // L'auth Discord passe par une fenêtre OAuth → `allow-popups`, pas
          // `same-origin` strict (qui casserait le retour de callback).
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
        ],
      },
      {
        // Le manifeste PWA est servi cross-origin par certains navigateurs
        // (installation) et change rarement.
        source: "/manifest.webmanifest",
        headers: [
          { key: "Cache-Control", value: "public, max-age=3600, stale-while-revalidate=86400" },
          { key: "Content-Type", value: "application/manifest+json; charset=utf-8" },
        ],
      },
    ];
  },
};

// Next.js 16 Turbopack : analyse de bundle intégrée via `next build --turbopack --experimental-analyze`
// qui écrit les métriques dans `.next/diagnostics/analyze` sans injecter de wrapper Webpack.
//
// `withBun` (@aphrody/next-bun) porte les réglages génériques de Next sur Bun : racine Turbopack et
// file tracing à la racine du workspace (magasin isolé de Bun), `transpilePackages` déduit des paquets
// qui publient leurs sources TypeScript (@aphrody/shenron-*, @aphrody/m3-*…), alias communs à Turbopack et
// Webpack, et `next start` qui reprend le préfixe d'assets et l'identifiant de déploiement du build.
const resolveConfig = withBun(nextConfig, {
  bundler: "turbopack",
  projectDir: __dirname,
  // next-intl : son plugin ne fait, pour cette configuration, que poser cet alias ; il chargeait
  // en plus `@swc/core` (addon natif de 30 Mio) et `@parcel/watcher` dans chaque processus qui lit
  // la config. À revérifier à chaque montée de next-intl.
  alias: { "next-intl/config": "./src/i18n/request.ts" },
  // Une seule copie pour l'éditeur (Tiptap) et ses extensions.
  dedupe: ["prosemirror-transform"],
});

export default async function resolveNextConfig(...args: Parameters<typeof resolveConfig>) {
  const resolved = await resolveConfig(...args);
  // Development chunks only exist in the local compilation, never on the public CDN.
  if (args[0] !== PHASE_DEVELOPMENT_SERVER) return resolved;
  const headers = resolved.headers;
  return {
    ...resolved,
    assetPrefix: undefined,
    // HMR CSS keeps stable URLs: production immutable caching would retain obsolete styles.
    headers: async () =>
      ((await headers?.()) ?? []).filter((route) => !route.source.startsWith("/_next/")),
  };
}
