const STORAGE_KEY = "shenron:password-reset-email";

export function storePasswordResetEmail(email: string): void {
  try {
    const normalized = email.trim().slice(0, 254);
    if (normalized) window.sessionStorage.setItem(STORAGE_KEY, normalized);
  } catch {
    // The reset form still works when browser storage is unavailable.
  }
}

export function consumePasswordResetEmail(): string {
  try {
    const email = window.sessionStorage.getItem(STORAGE_KEY) ?? "";
    window.sessionStorage.removeItem(STORAGE_KEY);
    return email.slice(0, 254);
  } catch {
    return "";
  }
}
