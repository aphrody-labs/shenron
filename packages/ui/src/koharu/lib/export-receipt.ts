// SPDX-License-Identifier: Apache-2.0

export type KoharuCandidateStatus = "unreviewed" | "approved" | "rejected" | "published";

export interface KoharuCandidateReceipt {
  id: number;
  status: KoharuCandidateStatus;
  created: boolean;
}

const STATUSES = new Set<KoharuCandidateStatus>([
  "unreviewed",
  "approved",
  "rejected",
  "published",
]);

export function parseKoharuCandidateReceipt(value: unknown): KoharuCandidateReceipt | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const envelope = value as { data?: unknown; created?: unknown };
  if (!envelope.data || typeof envelope.data !== "object" || Array.isArray(envelope.data))
    return null;
  const data = envelope.data as { id?: unknown; status?: unknown };
  if (
    !Number.isSafeInteger(data.id) ||
    Number(data.id) < 1 ||
    typeof data.status !== "string" ||
    !STATUSES.has(data.status as KoharuCandidateStatus) ||
    typeof envelope.created !== "boolean"
  ) {
    return null;
  }
  return {
    id: Number(data.id),
    status: data.status as KoharuCandidateStatus,
    created: envelope.created,
  };
}
