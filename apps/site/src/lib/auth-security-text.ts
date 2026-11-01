"use client";
// SPDX-License-Identifier: Apache-2.0
import { createTranslator } from "next-intl";
import { useLangue } from "@/lib/i18n/client";
import fr from "../../messages/auth-security/fr.json";
import en from "../../messages/auth-security/en.json";
import ja from "../../messages/auth-security/ja.json";

export function useAuthSecurityText() {
  const { locale } = useLangue();
  return createTranslator({ locale, messages: { fr, en, ja }[locale] });
}
