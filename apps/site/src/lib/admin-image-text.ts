"use client";
// SPDX-License-Identifier: Apache-2.0
import { createTranslator } from "next-intl";
import { useMemo } from "react";
import { useLangue } from "./i18n/client";
import fr from "../../messages/admin-image-upload/fr.json";
import en from "../../messages/admin-image-upload/en.json";
import ja from "../../messages/admin-image-upload/ja.json";

export function useAdminImageText() {
  const { locale } = useLangue();
  return useMemo(() => createTranslator({ locale, messages: { fr, en, ja }[locale] }), [locale]);
}
