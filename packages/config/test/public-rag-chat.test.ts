// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { PUBLIC_RAG_CHAT_MAX_OUTPUT_TOKENS } from "../src/chat-model";

test("public sourced replies have an explicit finite budget suitable for facts and citations", () => {
  expect(Number.isSafeInteger(PUBLIC_RAG_CHAT_MAX_OUTPUT_TOKENS)).toBe(true);
  expect(PUBLIC_RAG_CHAT_MAX_OUTPUT_TOKENS).toBeGreaterThanOrEqual(128);
  expect(PUBLIC_RAG_CHAT_MAX_OUTPUT_TOKENS).toBeLessThanOrEqual(512);
});
