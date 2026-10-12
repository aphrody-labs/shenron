import { describe, expect, it } from "bun:test";

import { parseKoharuCandidateReceipt } from "../../../src/koharu/lib/export-receipt";

describe("Koharu candidate receipt", () => {
  it("parses new and idempotent candidate responses with their persisted state", () => {
    expect(
      parseKoharuCandidateReceipt({ data: { id: 41, status: "unreviewed" }, created: true }),
    ).toEqual({ id: 41, status: "unreviewed", created: true });
    expect(
      parseKoharuCandidateReceipt({ data: { id: 41, status: "published" }, created: false }),
    ).toEqual({ id: 41, status: "published", created: false });
  });

  it("rejects malformed or unknown API receipts", () => {
    expect(parseKoharuCandidateReceipt(null)).toBeNull();
    expect(
      parseKoharuCandidateReceipt({ data: { id: 0, status: "unreviewed" }, created: true }),
    ).toBeNull();
    expect(
      parseKoharuCandidateReceipt({ data: { id: 41, status: "unknown" }, created: true }),
    ).toBeNull();
    expect(parseKoharuCandidateReceipt({ data: { id: 41, status: "unreviewed" } })).toBeNull();
  });
});
