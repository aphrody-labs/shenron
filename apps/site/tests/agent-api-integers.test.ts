import { describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));
mock.module("@aphrody/shenron-auth/agent-keys", () => ({
  decideWriteQuota: () => ({ allowed: true }),
  hasScope: () => true,
  isQuotaExemptMethod: () => true,
}));
mock.module("@/lib/agent-keys", () => ({
  agentCallsLastHour: async () => 0,
  authenticateAgent: async () => null,
  recordAgentCall: async () => undefined,
}));

const { readInt } = await import("../src/lib/agent-api");

describe("readInt — paramètres de pagination agent", () => {
  const options = { min: 1, max: 100, fallback: 25 };

  test("utilise le défaut pour un paramètre absent ou vide", () => {
    expect(readInt(null, options)).toBe(25);
    expect(readInt("", options)).toBe(25);
    expect(readInt("   ", options)).toBe(25);
  });

  test("conserve les valeurs valides, l'arrondi vers zéro et le bornage", () => {
    expect(readInt("8.9", options)).toBe(8);
    expect(readInt("0", options)).toBe(1);
    expect(readInt("999", options)).toBe(100);
    expect(readInt("invalide", options)).toBe(25);
  });
});
