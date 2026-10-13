"use client";
import { useRubrique } from "@/lib/i18n/client";
import { useShellUIText } from "@/lib/shell-ui-text";

const EXTRA_LABELS = {
  "/about": "about",
  "/credits": "credits",
  "/license": "license",
  "/privacy": "privacy",
  "/sources/dragon-ball": "sources",
  "/wiki/staff": "staff",
} as const;

export function FooterDestinationLabel({ href, label }: { href: string; label: string }) {
  const translate = useRubrique();
  const t = useShellUIText();
  const key = EXTRA_LABELS[href as keyof typeof EXTRA_LABELS];
  return key ? t(key) : translate(href, { label }).label;
}
