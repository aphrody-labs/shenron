// SPDX-License-Identifier: Apache-2.0
import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { openShenronVfs } from "@aphrody/shenron-db/vfs";
import { createRagWriter } from "@aphrody/shenron-db/vfs/build";
import { createChatEngine, NO_SOURCE_ANSWER } from "../src/chat/engine";
import { createExtractiveBackend } from "../src/chat/llm";
import { ChatRequest, type ChatDone, type ChatEvent } from "../src/contract";

const privateMarker = "reviewed-private-evidence-only";

test("real home evidence reaches private chat surfaces while public chat excludes its text and citations", async () => {
  const opened = openShenronVfs(new Database(":memory:"), { readOnly: false });
  try {
    const writer = createRagWriter(opened.vfs.db, "none");
    for (const [corpus, content, visibility] of [
      ["home", `Nail est assimilé par Piccolo au chapitre 295. ${privateMarker}`, "private"],
      ["wiki", "Goku est un Saiyan.", "public"],
    ] as const) {
      writer.add(
        {
          corpus,
          entity_id: `shenron:${corpus}:evidence:0`,
          title: corpus,
          url: null,
          content,
          metadata: { kind: corpus === "home" ? "home" : "wiki", lang: "fr" },
          updated_at: "2026-10-25T00:00:00Z",
          embedding: null,
          model: null,
        },
        visibility,
      );
    }
    writer.finish();

    async function run(surface: "site" | "bot" | "desktop", publicOnly: boolean, message: string) {
      const engine = createChatEngine({
        rag: opened.rag,
        publicOnly,
        backends: [createExtractiveBackend()],
        home: () => ({ persona: null, name: "Shenron", emoji: null, source: "none" }),
      });
      const events: ChatEvent[] = [];
      for await (const event of engine.run(
        {
          request: ChatRequest.parse({ message, surface, tools: false, backend: "extractive" }),
          ownerId: "local",
          streamId: "private-evidence-regression",
        },
        new AbortController().signal,
      ))
        events.push(event);
      const done = events.find((event) => event.type === "done")?.data as ChatDone | undefined;
      expect(done).toBeDefined();
      return {
        events,
        done: done!,
        text: events
          .filter((event) => event.type === "delta")
          .map((event) => (event.data as { text: string }).text)
          .join(""),
      };
    }

    for (const surface of ["site", "bot", "desktop"] as const) {
      const privateAnswer = await run(surface, false, "Que disent les sources sur Nail ?");
      expect(privateAnswer.text).toContain("chapitre 295");
      expect(privateAnswer.done.citations.some((citation) => citation.source === "home")).toBe(
        true,
      );
      const excluded = await run(surface, true, "Que disent les sources sur Nail ?");
      expect(excluded.text).toBe(NO_SOURCE_ANSWER);
      expect(excluded.done.citations).toEqual([]);
      expect(JSON.stringify(excluded.events)).not.toContain(privateMarker);
      expect(JSON.stringify(excluded.events)).not.toContain("chapitre 295");
      const publicAnswer = await run(surface, true, "Que disent les sources sur Goku ?");
      expect(publicAnswer.text).toContain("Saiyan");
      expect(publicAnswer.done.citations.length).toBeGreaterThan(0);
      expect(publicAnswer.done.citations.some((citation) => citation.source === "home")).toBe(
        false,
      );
    }
  } finally {
    opened.vfs.db.close();
  }
});
