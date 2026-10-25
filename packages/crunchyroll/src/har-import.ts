// SPDX-License-Identifier: Apache-2.0
/** Lossless private archive plus a separate, credential-free view for AI tools. */
export interface HarEntry {
  startedDateTime: string;
  request: { method: string; url: string; [key: string]: unknown };
  response: {
    status: number;
    content: { mimeType?: string; text?: string; encoding?: string; [key: string]: unknown };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface HarArchive {
  log: { entries: HarEntry[]; [key: string]: unknown };
  [key: string]: unknown;
}

export interface ImportedSession {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  capturedAt: number;
  accountId?: string;
  sourceEntry: number;
}

export type ImportCategory = "authentication" | "catalogue" | "asset" | "other";
export interface HarAiView {
  schemaVersion: 1;
  sourceSha256: string;
  entries: { index: number; category: ImportCategory; method: string; status: number }[];
  entryCount: number;
  catalogueEntryCount: number;
  sessionCount: number;
  usableSessionCount: number;
  cookieCount: number;
  playbackVerified: false;
}

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const invalid = () => new Error("Invalid HAR archive");

/** Validates consumed fields while retaining every unconsumed field verbatim. */
export function parseHar(value: unknown): HarArchive {
  if (!record(value) || !record(value.log) || !Array.isArray(value.log.entries)) throw invalid();
  if (value.log.entries.length > 100_000) throw invalid();
  for (const entry of value.log.entries) {
    if (
      !record(entry) ||
      typeof entry.startedDateTime !== "string" ||
      !Number.isFinite(Date.parse(entry.startedDateTime)) ||
      !record(entry.request) ||
      typeof entry.request.method !== "string" ||
      !/^[A-Z]{1,20}$/.test(entry.request.method) ||
      typeof entry.request.url !== "string" ||
      !record(entry.response) ||
      !Number.isInteger(entry.response.status) ||
      (entry.response.status as number) < 0 ||
      (entry.response.status as number) > 599 ||
      !record(entry.response.content)
    )
      throw invalid();
    if (!URL.canParse(entry.request.url)) throw invalid();
    const content = entry.response.content;
    if (content.text !== undefined && typeof content.text !== "string") throw invalid();
    if (content.encoding !== undefined && typeof content.encoding !== "string") throw invalid();
    if (content.mimeType !== undefined && typeof content.mimeType !== "string") throw invalid();
  }
  return value as unknown as HarArchive;
}

function category(entry: HarEntry): ImportCategory {
  const url = new URL(entry.request.url);
  const trusted =
    url.protocol === "https:" &&
    ["www.crunchyroll.com", "beta-api.crunchyroll.com"].includes(url.hostname) &&
    !url.username &&
    !url.password &&
    !url.port;
  if (trusted && url.pathname.startsWith("/auth/")) return "authentication";
  if (trusted && url.pathname.startsWith("/content/v2/cms/")) return "catalogue";
  if (/\.(js|css|png|jpe?g|webp|svg|woff2?)(?:$)/i.test(url.pathname)) return "asset";
  return "other";
}

export function convertHar(
  input: unknown,
  sourceSha256: string,
  cookieCount: number,
  now = Date.now(),
) {
  const archive = parseHar(input);
  if (
    !/^[a-f0-9]{64}$/.test(sourceSha256) ||
    !Number.isSafeInteger(cookieCount) ||
    cookieCount < 0 ||
    !Number.isFinite(now)
  )
    throw new Error("Invalid import metadata");
  const sessions: ImportedSession[] = [];
  const entries = archive.log.entries.map((entry, index) => {
    const kind = category(entry);
    const url = new URL(entry.request.url);
    if (
      kind === "authentication" &&
      url.pathname === "/auth/v1/token" &&
      entry.request.method === "POST" &&
      entry.response.status === 200
    ) {
      let body: unknown;
      try {
        const content = entry.response.content;
        if (content.encoding && content.encoding !== "base64") throw new Error();
        const text =
          content.encoding === "base64"
            ? Buffer.from(content.text ?? "", "base64").toString("utf8")
            : content.text;
        body = JSON.parse(text ?? "");
      } catch {
        body = null;
      }
      if (
        record(body) &&
        typeof body.access_token === "string" &&
        /^[A-Za-z0-9._~+/-]+=*$/.test(body.access_token) &&
        typeof body.expires_in === "number" &&
        Number.isFinite(body.expires_in) &&
        body.expires_in > 0 &&
        body.expires_in <= 31_536_000
      ) {
        const capturedAt = Date.parse(entry.startedDateTime);
        sessions.push({
          accessToken: body.access_token,
          ...(typeof body.refresh_token === "string" && /^[\x21-\x7e]+$/.test(body.refresh_token)
            ? { refreshToken: body.refresh_token }
            : {}),
          ...(typeof body.account_id === "string" ? { accountId: body.account_id } : {}),
          expiresAt: capturedAt + body.expires_in * 1000,
          capturedAt,
          sourceEntry: index,
        });
      }
    }
    return { index, category: kind, method: entry.request.method, status: entry.response.status };
  });
  const ai: HarAiView = {
    schemaVersion: 1,
    sourceSha256,
    entries,
    entryCount: entries.length,
    catalogueEntryCount: entries.filter((e) => e.category === "catalogue").length,
    sessionCount: sessions.length,
    usableSessionCount: sessions.filter((s) => s.expiresAt > now).length,
    cookieCount,
    playbackVerified: false,
  };
  return { archive, sessions, ai };
}
