import "./setup";
import { describe, expect, it, mock } from "bun:test";

const CHANNEL = "123456789012345678";
const ATTACHMENT = "987654321098765432";
let signed: string | null = "https://cdn.discordapp.com/attachments/x?ex=1&is=2&hm=3";

mock.module("~/lib/scans-couleur", () => ({
  urlNueDe: async (target: { salonId: string; pieceJointeId: string; fichier: string }) =>
    target.salonId === CHANNEL
      ? `https://cdn.discordapp.com/attachments/${target.salonId}/${target.pieceJointeId}/${target.fichier}`
      : null,
  urlSignee: async () => signed,
}));

const { fullColorRedirect } = await import("../src/api/server");

function call(method: string, channel: string) {
  const req = new Request(
    `http://localhost/api/public/manga/color/${channel}/${ATTACHMENT}/001.jpg`,
    { method },
  ) as Request & { params: Record<string, string> };
  req.params = { channelId: channel, attachmentId: ATTACHMENT, file: "001.jpg" };
  return fullColorRedirect(req);
}

describe("Full Color redirect (/api/public/manga/color/…, former /couleur/…)", () => {
  it("answers a 302 to a fresh signed CDN URL, not cached beyond its validity", async () => {
    const res = await call("GET", CHANNEL);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(signed);
    expect(res.headers.get("cache-control")).toBe("private, max-age=300");
  });

  it("answers the CORS preflight with a 204", async () => {
    expect((await call("OPTIONS", CHANNEL)).status).toBe(204);
  });

  it("refuses a channel that is not an indexed thread", async () => {
    expect((await call("GET", "111111111111111111")).status).toBe(404);
  });

  it("answers a 502 when Discord gives no signature", async () => {
    signed = null;
    try {
      expect((await call("GET", CHANNEL)).status).toBe(502);
    } finally {
      signed = "https://cdn.discordapp.com/attachments/x?ex=1&is=2&hm=3";
    }
  });
});
