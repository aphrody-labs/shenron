import "server-only";
import { env } from "@/lib/env";

type PayPalConfig = {
  clientId: string;
  clientSecret: string;
  webhookId: string;
  baseUrl: string;
};

type TokenCache = { token: string; expiresAt: number };
let tokenCache: TokenCache | null = null;
let tokenRequest: Promise<string> | null = null;

export class PayPalConfigurationError extends Error {
  constructor() {
    super("PayPal payment provider is not configured.");
    this.name = "PayPalConfigurationError";
  }
}

export class PayPalApiError extends Error {
  constructor(readonly status: number) {
    super(`PayPal API failed (${status}).`);
    this.name = "PayPalApiError";
  }
}

function getConfig(): PayPalConfig {
  const { PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_WEBHOOK_ID, PAYPAL_ENV } = env;
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET || !PAYPAL_WEBHOOK_ID || !PAYPAL_ENV) {
    throw new PayPalConfigurationError();
  }
  return {
    clientId: PAYPAL_CLIENT_ID,
    clientSecret: PAYPAL_CLIENT_SECRET,
    webhookId: PAYPAL_WEBHOOK_ID,
    baseUrl:
      PAYPAL_ENV === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com",
  };
}

/** Validate credentials before reserving a checkout; only a token request is made. */
export async function ensurePayPalReady(): Promise<void> {
  const config = getConfig();
  await accessToken(config);
}

async function accessToken(config: PayPalConfig): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 30_000) return tokenCache.token;
  if (tokenRequest) return tokenRequest;

  tokenRequest = (async () => {
    const credentials = btoa(`${config.clientId}:${config.clientSecret}`);
    const response = await fetch(`${config.baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`PayPal OAuth failed (${response.status}).`);
    const result = (await response.json()) as { access_token: string; expires_in: number };
    tokenCache = {
      token: result.access_token,
      expiresAt: Date.now() + Math.max(0, result.expires_in - 60) * 1000,
    };
    return result.access_token;
  })();

  try {
    return await tokenRequest;
  } finally {
    tokenRequest = null;
  }
}

export async function paypalRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const config = getConfig();
  const token = await accessToken(config);
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Content-Type", "application/json");
  const response = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    headers,
    signal: init.signal ?? AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!response.ok) throw new PayPalApiError(response.status);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function verifyPayPalWebhook(headers: Headers, rawBody: string): Promise<boolean> {
  const config = getConfig();
  const required = [
    "paypal-auth-algo",
    "paypal-cert-url",
    "paypal-transmission-id",
    "paypal-transmission-sig",
    "paypal-transmission-time",
  ] as const;
  const values = Object.fromEntries(required.map((name) => [name, headers.get(name)]));
  if (Object.values(values).some((value) => !value)) return false;

  try {
    const verificationMetadata = JSON.stringify({
      auth_algo: values["paypal-auth-algo"],
      cert_url: values["paypal-cert-url"],
      transmission_id: values["paypal-transmission-id"],
      transmission_sig: values["paypal-transmission-sig"],
      transmission_time: values["paypal-transmission-time"],
      webhook_id: config.webhookId,
    });
    // Keep the original signed event bytes intact inside the verification request.
    const verificationBody = `${verificationMetadata.slice(0, -1)},"webhook_event":${rawBody}}`;
    const result = await paypalRequest<{ verification_status?: string }>(
      "/v1/notifications/verify-webhook-signature",
      { method: "POST", body: verificationBody },
    );
    return result.verification_status === "SUCCESS";
  } catch {
    throw new Error("PayPal webhook verification is temporarily unavailable.");
  }
}

export function paypalPlanId(key: "vip_monthly" | "vip_annual"): string {
  const planId = key === "vip_monthly" ? env.PAYPAL_PLAN_VIP_MONTHLY : env.PAYPAL_PLAN_VIP_ANNUAL;
  if (!planId) throw new PayPalConfigurationError();
  return planId;
}
