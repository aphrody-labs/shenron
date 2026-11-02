/**
 * Donation and subscription checkout routes: same-origin guard behind the gateway, explicit
 * 503 when a payment provider is not configured (and nothing written), 405 for methods a
 * route does not serve, and a donation wall that never answers a bare 500.
 */
import { afterEach, describe, expect, mock, test } from "bun:test";

const fakeEnv: Record<string, string | undefined> = { NODE_ENV: "test" };
const writes: string[] = [];
let selectFails = false;

mock.module("server-only", () => ({}));
mock.module("../src/lib/env", () => ({ env: fakeEnv }));
mock.module("../src/lib/config", () => ({ SITE_URL: "https://dragonballfr.com" }));
mock.module("../src/lib/session", () => ({ getCurrentUser: async () => null }));
mock.module("../src/lib/db", () => {
  const rows = [
    {
      id: "don_1",
      donorName: "Bulma",
      isAnonymous: false,
      amount: 500,
      message: null,
      tier: "custom",
      createdAt: new Date(0),
    },
  ];
  const chain = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: async () => {
      if (selectFails) throw Object.assign(new Error("column missing"), { code: "42703" });
      return rows;
    },
  };
  return {
    db: {
      select: () => chain,
      insert: () => {
        writes.push("insert");
        return { values: async () => undefined };
      },
      update: () => {
        writes.push("update");
        return { set: () => ({ where: async () => undefined }) };
      },
    },
  };
});

const { isSameOriginPaymentRequest, paymentOrigins } = await import("../src/lib/payment-request");
const stripeDonate = await import("../src/app/api/stripe/donate/route");
const paypalDonate = await import("../src/app/api/paypal/donate/route");
const paypalSubscribe = await import("../src/app/api/paypal/subscribe/route");

/** A request as Next sees it behind the gateway: its own listening address in `url`. */
function behindGateway(body: unknown, origin = "https://dragonballfr.com") {
  return new Request("http://127.0.0.1:3000/api/stripe/donate", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

afterEach(() => {
  writes.length = 0;
  selectFails = false;
  for (const key of Object.keys(fakeEnv)) if (key !== "NODE_ENV") delete fakeEnv[key];
});

describe("same-origin payment guard", () => {
  test("accepts the public origin although Next sees its loopback address", () => {
    expect(isSameOriginPaymentRequest(behindGateway({}))).toBe(true);
    expect(paymentOrigins(behindGateway({}), true).has("https://www.dragonballfr.com")).toBe(true);
  });

  test("refuses a foreign origin, a missing origin and a non-JSON body", () => {
    expect(isSameOriginPaymentRequest(behindGateway({}, "https://evil.example"))).toBe(false);
    const noOrigin = new Request("https://dragonballfr.com/api/stripe/donate", {
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    expect(isSameOriginPaymentRequest(noOrigin)).toBe(false);
    const form = new Request("https://dragonballfr.com/api/stripe/donate", {
      method: "POST",
      headers: { origin: "https://dragonballfr.com", "content-type": "text/plain" },
    });
    expect(isSameOriginPaymentRequest(form)).toBe(false);
  });
});

describe("POST /api/stripe/donate", () => {
  test("503 JSON without a Stripe key, before any database write", async () => {
    const response = await stripeDonate.POST(behindGateway({ amount: 500 }));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: "provider_unavailable",
      provider: "stripe",
    });
    expect(writes).toEqual([]);
  });

  test("403 for a cross-site request", async () => {
    const response = await stripeDonate.POST(
      behindGateway({ amount: 500 }, "https://evil.example"),
    );
    expect(response.status).toBe(403);
  });

  test("400 for an out-of-range amount once Stripe is configured", async () => {
    fakeEnv.STRIPE_SECRET_KEY = "sk_test_placeholder";
    const response = await stripeDonate.POST(behindGateway({ amount: 5 }));
    expect(response.status).toBe(400);
    expect(writes).toEqual([]);
  });
});

describe("GET /api/stripe/donate (wall of supporters)", () => {
  test("lists the public donations", async () => {
    const response = await stripeDonate.GET();
    expect(response.status).toBe(200);
    const body = (await response.json()) as { donations: { donorName: string }[] };
    expect(body.donations[0]?.donorName).toBe("Bulma");
  });

  test("a database failure is an explicit empty 503, never a bare 500", async () => {
    selectFails = true;
    const response = await stripeDonate.GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ donations: [], error: "donations_unavailable" });
  });
});

describe("POST /api/paypal/donate", () => {
  test("503 JSON without PayPal credentials, before any database write", async () => {
    const response = await paypalDonate.POST(behindGateway({ amount: 500 }));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: "provider_unavailable",
      provider: "paypal",
    });
    expect(writes).toEqual([]);
  });

  test("serves POST only: Next answers 405 to GET", () => {
    expect("GET" in paypalDonate).toBe(false);
    expect(typeof paypalDonate.POST).toBe("function");
  });
});

describe("POST /api/paypal/subscribe", () => {
  test("anonymous visitor: 401 unauthenticated, not a generic 403", async () => {
    const response = await paypalSubscribe.POST(behindGateway({ plan: "vip_monthly" }));
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: "unauthenticated" });
  });
});
