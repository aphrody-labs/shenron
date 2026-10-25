// SPDX-License-Identifier: Apache-2.0
// Offline plan: bun scripts/data/import-voiranime-sources.ts input.json
// Apply only after auth qualification: same command --apply (canonical credential in environment).
import {
  externalSourceImportSchema,
  SOURCE_IMPORT_MAX_BYTES,
  type ExternalSourceImportRecord,
} from "../../apps/site/src/lib/external-source-import";

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
const origin = "https://dragonballfr.com";
const endpoint = `${origin}/api/admin/catalog/sources/import`;
const hash = (text: string) => new Bun.CryptoHasher("sha256").update(text).digest("hex");

/** Read through the public catalogue, independently of the administrative mutation response. */
export async function verifyInsertedSources(
  records: ExternalSourceImportRecord[],
  result: unknown,
  fetcher: Fetcher = fetch,
) {
  const response = result as {
    dryRun?: unknown;
    inserted?: unknown;
    skipped?: unknown;
    insertedUrls?: unknown;
  } | null;
  if (
    !response ||
    response.dryRun !== false ||
    !Number.isInteger(response.inserted) ||
    !Number.isInteger(response.skipped) ||
    Number(response.skipped) < 0 ||
    Number(response.inserted) + Number(response.skipped) !== records.length ||
    !Array.isArray(response.insertedUrls) ||
    response.insertedUrls.length !== response.inserted ||
    new Set(response.insertedUrls).size !== response.insertedUrls.length
  )
    throw new Error("Invalid apply receipt; verification required");
  const expected = new Map(records.map((record) => [record.url, record.title]));
  if (response.insertedUrls.some((url: unknown) => typeof url !== "string" || !expected.has(url)))
    throw new Error("Unexpected inserted URL; verification required");
  const receipts: { url: string; responseSha256: string }[] = [];
  for (const url of response.insertedUrls as string[]) {
    const id = Buffer.from(url, "utf8").toString("base64url");
    const read = await fetcher(`${origin}/api/catalog?category=sources&id=${id}`, {
      method: "GET",
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!read.ok) throw new Error(`Independent catalogue verification HTTP ${read.status}`);
    const text = await read.text();
    if (new TextEncoder().encode(text).length > SOURCE_IMPORT_MAX_BYTES)
      throw new Error("Independent catalogue response exceeds budget");
    const detail = JSON.parse(text);
    // originalHref is the site's attributed source reader, not the external source URL.
    if (
      detail.category !== "sources" ||
      detail.id !== id ||
      detail.originalHref !== `/sources/dragon-ball/${id}` ||
      detail.title !== expected.get(url)
    )
      throw new Error("Independent catalogue identity/title mismatch; import remains unverified");
    receipts.push({ url, responseSha256: hash(text) });
  }
  return {
    verified: receipts.length,
    responseCount: receipts.length,
    responsesSha256: hash(JSON.stringify(receipts)),
  };
}

export async function runSourceImport(
  input: unknown,
  options: {
    apply: boolean;
    token?: string;
    cookie?: string;
    fetcher?: Fetcher;
    report?: (value: unknown) => void;
  },
) {
  const parsed = externalSourceImportSchema.parse(input);
  const body = JSON.stringify({ records: parsed.records, apply: false });
  if (new TextEncoder().encode(body).length > SOURCE_IMPORT_MAX_BYTES)
    throw new Error("Payload exceeds budget");
  const report = options.report ?? (() => {});
  const plan = {
    mode: "offline-plan",
    records: parsed.records.length,
    payloadSha256: hash(body),
    endpoint,
    existingPreserved: true,
  };
  report(plan);
  if (!options.apply) return plan;
  const { token, cookie } = options;
  if ((!cookie && !token) || (cookie && token) || /[\r\n]/.test(cookie ?? token ?? ""))
    throw new Error(
      "Supply exactly one canonical credential through SHENRON_ADMIN_TOKEN or SHENRON_IMPORT_SESSION_COOKIE",
    );
  const auth: Record<string, string> = token
    ? { Authorization: `Bearer ${token}` }
    : { Cookie: cookie! };
  const fetcher = options.fetcher ?? fetch;
  const send = async (apply: boolean) => {
    const response = await fetcher(endpoint, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
      headers: { "Content-Type": "application/json", Origin: origin, ...auth },
      body: JSON.stringify({ records: parsed.records, apply }),
    });
    if (!response.ok) throw new Error(`Import API HTTP ${response.status}`);
    const result = await response.json();
    report({
      mode: apply ? "apply" : "server-plan",
      dryRun: result.dryRun,
      inserted: result.inserted,
      skipped: result.skipped,
      wouldInsert: result.wouldInsert,
    });
    return result;
  };
  const serverPlan = await send(false);
  if (serverPlan.dryRun !== true) throw new Error("Server did not confirm dry-run plan");
  const result = await send(true);
  const verification = await verifyInsertedSources(parsed.records, result, fetcher);
  report({ mode: "verified", ...verification });
  return verification;
}

if (import.meta.main) {
  const args = Bun.argv.slice(2);
  if (!args[0] || args.slice(1).some((arg) => arg !== "--apply"))
    throw new Error("Usage: bun scripts/data/import-voiranime-sources.ts input.json [--apply]");
  const file = Bun.file(args[0]);
  if (file.size > SOURCE_IMPORT_MAX_BYTES) throw new Error("Input exceeds import payload budget");
  await runSourceImport(await file.json(), {
    apply: args.includes("--apply"),
    token: Bun.env.SHENRON_ADMIN_TOKEN,
    cookie: Bun.env.SHENRON_IMPORT_SESSION_COOKIE,
    report: (value) => console.log(JSON.stringify(value)),
  });
}
