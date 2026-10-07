// SPDX-License-Identifier: Apache-2.0
import { AccountSessionResponse } from "@shenron/api/contract";
import type { CurrentUser } from "./current-user-cache";

/** Resolve the business profile on Bun; never fall back to a local DB or stale cache. */
export async function hostCurrentUser(host: string, headers: Headers): Promise<CurrentUser | null> {
  try {
    const forwarded = new Headers();
    for (const name of ["cookie", "authorization"]) {
      const value = headers.get(name);
      if (value) forwarded.set(name, value);
    }
    const response = await fetch(new URL("/api/v1/account/session", host), {
      headers: forwarded,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;
    const parsed = AccountSessionResponse.safeParse(await response.json());
    if (!parsed.success || !parsed.data) return null;
    const value = parsed.data;
    return {
      ...value,
      user: value.user ? { ...value.user, createdAt: new Date(value.user.createdAt) } : null,
    };
  } catch {
    return null;
  }
}
