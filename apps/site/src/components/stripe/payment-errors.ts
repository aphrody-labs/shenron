/**
 * Maps a payment route answer (`{ error: <stable code>, message }`) to a dictionary key
 * under `billing`. The French `message` is never shown: every code has its own label in
 * fr/en/ja, and an unknown code falls back to `errors.default`.
 */
export type PaymentProvider = "stripe" | "paypal";

export type PaymentFailure = {
  /** Key relative to the `billing` namespace. */
  key: string;
  /** The provider is not configured: its buttons stay disabled until reload. */
  providerUnavailable: boolean;
  signInRequired: boolean;
};

export const PAYMENT_ERROR_CODES = [
  "unauthenticated",
  "account_not_found",
  "invalid_origin",
  "forbidden",
  "unknown_plan",
  "unknown_tier",
  "invalid_amount",
  "payload_too_large",
  "invalid_request",
  "invalid_order",
  "invalid_subscription",
  "no_billing_profile",
  "subscription_not_found",
  "donation_not_found",
  "checkout_in_progress",
  "amount_mismatch",
  "payment_not_confirmed",
  "state_changed",
  "provider_unavailable",
  "auth_unavailable",
  "checkout_failed",
  "capture_unavailable",
  "donations_unavailable",
] as const;

export function paymentFailure(status: number, code: unknown): PaymentFailure {
  const known =
    typeof code === "string" && (PAYMENT_ERROR_CODES as readonly string[]).includes(code)
      ? code
      : status === 401
        ? "unauthenticated"
        : status === 403
          ? "invalid_origin"
          : null;
  return {
    key: known ? `errors.${known}` : "errors.default",
    providerUnavailable: known === "provider_unavailable",
    signInRequired: known === "unauthenticated" || known === "account_not_found",
  };
}

export async function readPaymentFailure(response: Response): Promise<PaymentFailure> {
  const body = (await response
    .clone()
    .json()
    .catch(() => null)) as { error?: unknown } | null;
  return paymentFailure(response.status, body?.error);
}

/** `/signin?callbackURL=<current page>` for an `unauthenticated` answer. */
export function signInHref(): string {
  const here =
    typeof window === "undefined" ? "/" : window.location.pathname + window.location.search;
  return `/signin?callbackURL=${encodeURIComponent(here)}`;
}

export const PROVIDER_LABEL_KEY: Record<PaymentProvider, string> = {
  stripe: "providerStripe",
  paypal: "providerPaypal",
};
