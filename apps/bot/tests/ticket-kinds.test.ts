import "./setup";
import { describe, expect, test } from "bun:test";

import { TICKET_KIND_LABELS, TICKET_KINDS } from "~/services/SettingsService";

describe("types de ticket", () => {
  test("chaque type a un libellé, dont la candidature staff", () => {
    expect(Object.keys(TICKET_KIND_LABELS).toSorted()).toEqual([...TICKET_KINDS].toSorted());
    expect(TICKET_KIND_LABELS.staff).toBe("Candidature staff");
  });

  test("le panel tient dans une rangée Discord et ses libellés dans les limites", async () => {
    const source = await Bun.file(`${import.meta.dir}/../src/commands/ticket/Ticket.ts`).text();
    const buttons = source.match(/setCustomId\("ticket:open:[a-z]+"\)/g) ?? [];
    expect(buttons).toHaveLength(TICKET_KINDS.length);
    expect(TICKET_KINDS.length).toBeLessThanOrEqual(5);
    const prompts = [...source.matchAll(/^\s+[a-z]+: "([^"]+)",$/gm)].map((match) => match[1]!);
    for (const prompt of prompts) expect(prompt.length).toBeLessThanOrEqual(45);
    for (const label of Object.values(TICKET_KIND_LABELS))
      expect(label.length).toBeLessThanOrEqual(80);
  });
});
