// SPDX-License-Identifier: Apache-2.0
/**
 * Redaction applied before a conversation feeds the agent home memory, the RAG corpus or a
 * training dataset. Secrets: the patterns of aphrody-train `dataset.redact`
 * (`py/packages/aphrody-train`, aphrody-labs/aphrody) and of yolo-core `redactSecrets`.
 * Personal data: e-mail addresses, phone numbers, IP addresses, Discord mentions and
 * snowflakes, URLs with credentials. Runtime class: `pure`.
 */

const RULES: readonly [RegExp, string][] = [
  [
    /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    "[REDACTED_SECRET]",
  ],
  [/\bBearer\s+\S+/gi, "Bearer [REDACTED_SECRET]"],
  [
    /\b(?:sk-(?:proj-|admin-|org-)?[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|AIza[A-Za-z0-9_-]{25,}|xox[baprs]-[0-9A-Za-z-]{10,})\b/g,
    "[REDACTED_SECRET]",
  ],
  [/\bey[A-Za-z0-9_-]{10,}\.ey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "[REDACTED_SECRET]"],
  [
    /\b(?:api[_-]?key|token|password|passwd|secret|authorization|cookie|client_secret)\s*[:=]\s*[^\s,;]+/gi,
    "[REDACTED_SECRET]",
  ],
  [/https?:\/\/[^/@\s]+:[^/@\s]+@/gi, "https://[REDACTED_SECRET]@"],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[EMAIL]"],
  [/<@[!&]?\d{15,22}>/g, "[MENTION]"],
  [/\b\d{17,20}\b/g, "[ID]"],
  [/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[IP]"],
  [/(?:\+|\b00)\d{1,3}[\s.-]?(?:\(?\d{1,4}\)?[\s.-]?){2,5}\d{2,4}\b/g, "[PHONE]"],
  [/\b0[1-9](?:[\s.-]?\d{2}){4}\b/g, "[PHONE]"],
];

/** Redact secrets and personal data from free text. */
export function redactText(text: string): string {
  let out = text;
  for (const [pattern, replacement] of RULES) out = out.replace(pattern, replacement);
  return out;
}

/** `true` when redaction changed the text (useful for evidence counters). */
export function containsSensitive(text: string): boolean {
  return redactText(text) !== text;
}
