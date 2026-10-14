// SPDX-License-Identifier: Apache-2.0
import { createCrunchyrollClient, CrunchyrollError } from "@aphrody/bun-video/crunchyroll";
import {
  createCrunchyrollApi,
  type CrunchyrollMetadataClient,
} from "@aphrody/bun-video/crunchyroll/api";

export interface CrunchyrollServerConfiguration {
  accessToken?: string;
  basicAuthorization?: string;
  accountId?: string;
  email?: string;
  password?: string;
}

const PROVIDER_LOCALES = { fr: "fr-FR", en: "en-US", ja: "ja-JP" } as const;
const METADATA_FIELDS = new Set([
  "id",
  "title",
  "description",
  "slug_title",
  "type",
  "items",
  "data",
  "total",
  "count",
  "series_id",
  "season_id",
  "episode_number",
  "sequence_number",
  "season_number",
  "duration_ms",
  "audio_locale",
  "subtitle_locales",
  "versions",
  "is_dubbed",
  "is_subbed",
  "is_premium_only",
]);

/** Only content metadata crosses this boundary, never upstream signatures or token envelopes. */
export function publicCrunchyrollMetadata(value: unknown, depth = 0): unknown {
  if (depth > 12) return null;
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return value.slice(0, 16384);
  if (Array.isArray(value))
    return value.slice(0, 1000).map((item) => publicCrunchyrollMetadata(item, depth + 1));
  if (!value || typeof value !== "object") return null;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => METADATA_FIELDS.has(key))
      .map(([key, item]) => [key, publicCrunchyrollMetadata(item, depth + 1)]),
  );
}

function configured(config: CrunchyrollServerConfiguration): boolean {
  return Boolean(
    config.accessToken || (config.basicAuthorization && config.email && config.password),
  );
}

/** SDK and transport failures have one closed error vocabulary, never a raw response envelope. */
export function redactCrunchyrollError(body: unknown): { error: string } {
  const knownErrors = new Set([
    "method_not_allowed",
    "not_found",
    "authentication_required",
    "metadata_client_unavailable",
    "invalid_search_query",
    "upstream_timeout",
    "request_aborted",
    "upstream_failed",
  ]);
  const error = (body as { error?: unknown } | null)?.error;
  return { error: typeof error === "string" && knownErrors.has(error) ? error : "upstream_failed" };
}

/** Better Auth owns site identity; Bun Video owns the independent upstream provider session. */
export function createCrunchyrollAdminBridge(options: {
  configuration: () => CrunchyrollServerConfiguration;
  authorize: (request: Request) => Promise<boolean>;
  linkedAccessToken?: (request: Request) => Promise<string | null>;
  clientFactory?: (signal: AbortSignal, locale: string) => Promise<CrunchyrollMetadataClient>;
}) {
  return async (request: Request, path: readonly string[]): Promise<Response> => {
    const reply = (body: unknown, status = 200) =>
      Response.json(body, {
        status,
        headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
      });
    try {
      if (!(await options.authorize(request)))
        return reply({ error: "authentication_required" }, 401);
    } catch {
      return reply({ error: "auth_unavailable" }, 503);
    }
    if (request.method !== "GET") return reply({ error: "method_not_allowed" }, 405);
    let configuration: CrunchyrollServerConfiguration;
    try {
      configuration = { ...options.configuration() };
    } catch {
      return reply({ error: "provider_configuration_unavailable" }, 503);
    }
    const linked = await options.linkedAccessToken?.(request).catch(() => null);
    if (linked) configuration.accessToken = linked;
    const available = Boolean(options.clientFactory || configured(configuration));
    if (path.join("/") === "status")
      return reply({
        provider: "crunchyroll",
        configured: available,
        siteAuthentication: "better-auth",
        upstreamAuthentication: "provider-issued-credentials",
        metadata: true,
        playback: "browser-provider-required",
        subtitleSynchronization: "qualified-artifacts-only",
      });
    if (!available) return reply({ error: "provider_credentials_unavailable" }, 503);
    const input = new URL(request.url);
    const lang = input.searchParams.get("lang") ?? "fr";
    if (!Object.hasOwn(PROVIDER_LOCALES, lang)) return reply({ error: "invalid_locale" }, 400);
    const locale = PROVIDER_LOCALES[lang as keyof typeof PROVIDER_LOCALES];
    const apiToken = crypto.randomUUID();
    const api = createCrunchyrollApi({
      apiToken,
      timeoutMs: 10000,
      clientFactory: async (signal) => {
        if (options.clientFactory) return options.clientFactory(signal, locale);
        const client = createCrunchyrollClient({
          accessToken: configuration.accessToken,
          accountId: configuration.accountId,
          basicAuthorization: configuration.basicAuthorization,
          locale,
          signal,
          timeoutMs: 10000,
        });
        const login = configuration.accessToken
          ? await client.loginWithAccessToken()
          : await client.login(configuration.email!, configuration.password!);
        if (!login.success) throw new CrunchyrollError("Provider authentication failed", 401);
        return client;
      },
    });
    const target = new URL(
      `/v1/${path.map(encodeURIComponent).join("/")}`,
      "https://provider.internal",
    );
    if (path.join("/") === "search")
      target.searchParams.set("q", input.searchParams.get("q") ?? "");
    const response = await api(
      new Request(target, {
        headers: { authorization: `Bearer ${apiToken}` },
        signal: request.signal,
      }),
    );
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return reply({ error: "upstream_failed" }, 502);
    }
    if (response.ok) return reply(publicCrunchyrollMetadata(body));
    return reply(redactCrunchyrollError(body), response.status);
  };
}
