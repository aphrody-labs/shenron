// SPDX-License-Identifier: Apache-2.0
/**
 * Conversation sync model shared by the site, the desktop and the bot: stable client ids,
 * ISO-8601 UTC timestamps, soft deletes, last-writer-wins on `updatedAt` and an opaque
 * incremental cursor over a per-store change sequence. Runtime class: `pure`.
 */

export const SURFACES = ["site", "desktop", "bot"] as const;
export type Surface = (typeof SURFACES)[number];

export const MESSAGE_ROLES = ["user", "assistant", "system", "tool"] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];

/** A source cited by an assistant message (VFS RAG hit, wiki entity, CDN asset, MCP tool). */
export interface StoredCitation {
  n: number;
  title: string;
  url: string | null;
  kind: string;
  source: string;
  snippet?: string;
}

export interface Conversation {
  /** Stable client-generated id (UUIDv7 recommended), 8–64 chars of `[A-Za-z0-9_:-]`. */
  id: string;
  surface: Surface;
  title: string | null;
  persona: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  /** The owner allows distilled notes of this conversation in the agent home memory. */
  memoryOptIn: boolean;
  /** The owner allows redacted turns of this conversation in the RAG corpus and datasets. */
  ragOptIn: boolean;
  metadata: Record<string, unknown>;
}

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  citations: StoredCitation[];
  model: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface SyncBatch {
  conversations?: Conversation[];
  messages?: Message[];
}

export interface PushResult {
  /** Records stored or updated (their new server sequence is past the returned cursor). */
  accepted: string[];
  /** Records already present: same id and content, or a re-send under another id. */
  duplicates: { id: string; canonicalId: string }[];
  /** The server holds a newer version (`updatedAt`): the client must adopt it. */
  conflicts: { id: string; server: Conversation | Message }[];
  /** Records refused: invalid shape, unknown conversation, other owner. */
  rejected: { id: string; reason: string }[];
  cursor: string;
}

export interface PullResult {
  conversations: Conversation[];
  messages: Message[];
  cursor: string;
  hasMore: boolean;
}

export interface ConversationStore {
  push(ownerId: string, batch: SyncBatch): Promise<PushResult>;
  pull(ownerId: string, cursor: string | null, limit?: number): Promise<PullResult>;
  get(
    ownerId: string,
    conversationId: string,
  ): Promise<{ conversation: Conversation; messages: Message[] } | null>;
  list(
    ownerId: string,
    options?: { limit?: number; includeDeleted?: boolean },
  ): Promise<Conversation[]>;
  /** Conversations opted in for `memory` or `rag`, changed after `cursor` (all owners). */
  optedIn(
    kind: "memory" | "rag",
    cursor: string | null,
    limit?: number,
  ): Promise<{
    items: { ownerId: string; conversation: Conversation; messages: Message[] }[];
    cursor: string;
  }>;
}

export const SYNC_LIMITS = {
  idPattern: /^[A-Za-z0-9_:-]{8,64}$/,
  ownerPattern: /^[A-Za-z0-9_:@.-]{1,128}$/,
  maxBatch: 500,
  maxContentChars: 64_000,
  maxTitleChars: 200,
  maxMetadataBytes: 8_192,
  maxCitations: 32,
  defaultPullLimit: 200,
  maxPullLimit: 1_000,
} as const;

/** Opaque cursor of a change sequence (`c` + base-36). */
export function encodeCursor(seq: number): string {
  return `c${Math.max(0, Math.trunc(seq)).toString(36)}`;
}

export function decodeCursor(cursor: string | null | undefined): number {
  if (!cursor) return 0;
  if (!/^c[0-9a-z]{1,13}$/.test(cursor)) throw new Error("invalid sync cursor");
  return Number.parseInt(cursor.slice(1), 36);
}

function isoOrNull(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : undefined;
}

/** Normalise and validate a conversation; returns the reason when it is refused. */
export function checkConversation(value: unknown): Conversation | string {
  if (!value || typeof value !== "object") return "not an object";
  const v = value as Record<string, unknown>;
  if (typeof v.id !== "string" || !SYNC_LIMITS.idPattern.test(v.id)) return "invalid id";
  if (!SURFACES.includes(v.surface as Surface)) return "invalid surface";
  const createdAt = isoOrNull(v.createdAt);
  const updatedAt = isoOrNull(v.updatedAt);
  const deletedAt = v.deletedAt === undefined ? null : isoOrNull(v.deletedAt);
  if (!createdAt || !updatedAt || deletedAt === undefined) return "invalid timestamps";
  if (updatedAt < createdAt) return "updatedAt before createdAt";
  const title =
    v.title === undefined || v.title === null
      ? null
      : String(v.title).slice(0, SYNC_LIMITS.maxTitleChars);
  const persona = typeof v.persona === "string" ? v.persona.slice(0, 64) : null;
  const metadata =
    v.metadata && typeof v.metadata === "object" && !Array.isArray(v.metadata) ? v.metadata : {};
  if (JSON.stringify(metadata).length > SYNC_LIMITS.maxMetadataBytes) return "metadata too large";
  return {
    id: v.id,
    surface: v.surface as Surface,
    title,
    persona,
    createdAt,
    updatedAt,
    deletedAt,
    memoryOptIn: v.memoryOptIn === true,
    ragOptIn: v.ragOptIn === true,
    metadata: metadata as Record<string, unknown>,
  };
}

export function checkMessage(value: unknown): Message | string {
  if (!value || typeof value !== "object") return "not an object";
  const v = value as Record<string, unknown>;
  if (typeof v.id !== "string" || !SYNC_LIMITS.idPattern.test(v.id)) return "invalid id";
  if (typeof v.conversationId !== "string" || !SYNC_LIMITS.idPattern.test(v.conversationId))
    return "invalid conversationId";
  if (!MESSAGE_ROLES.includes(v.role as MessageRole)) return "invalid role";
  if (typeof v.content !== "string" || v.content.length > SYNC_LIMITS.maxContentChars)
    return "invalid content";
  const createdAt = isoOrNull(v.createdAt);
  const updatedAt = isoOrNull(v.updatedAt ?? v.createdAt);
  const deletedAt = v.deletedAt === undefined ? null : isoOrNull(v.deletedAt);
  if (!createdAt || !updatedAt || deletedAt === undefined) return "invalid timestamps";
  if (updatedAt < createdAt) return "updatedAt before createdAt";
  const citations = Array.isArray(v.citations)
    ? v.citations.slice(0, SYNC_LIMITS.maxCitations)
    : [];
  const clean: StoredCitation[] = [];
  for (const c of citations) {
    if (!c || typeof c !== "object") return "invalid citation";
    const r = c as Record<string, unknown>;
    if (typeof r.title !== "string" || typeof r.kind !== "string") return "invalid citation";
    clean.push({
      n: Number.isInteger(r.n) ? (r.n as number) : clean.length + 1,
      title: r.title.slice(0, 300),
      url: typeof r.url === "string" ? r.url.slice(0, 2048) : null,
      kind: r.kind.slice(0, 64),
      source: typeof r.source === "string" ? r.source.slice(0, 64) : "vfs",
      ...(typeof r.snippet === "string" ? { snippet: r.snippet.slice(0, 600) } : {}),
    });
  }
  return {
    id: v.id,
    conversationId: v.conversationId,
    role: v.role as MessageRole,
    content: v.content,
    citations: clean,
    model: typeof v.model === "string" ? v.model.slice(0, 128) : null,
    createdAt,
    updatedAt,
    deletedAt,
  };
}

/**
 * Last-writer-wins: `incoming` replaces `current` when strictly newer; at equal `updatedAt`
 * the larger canonical JSON wins, so every replica converges on the same record.
 */
export function newerThan<T extends { updatedAt: string }>(incoming: T, current: T): boolean {
  if (incoming.updatedAt !== current.updatedAt) return incoming.updatedAt > current.updatedAt;
  return JSON.stringify(incoming) > JSON.stringify(current);
}
