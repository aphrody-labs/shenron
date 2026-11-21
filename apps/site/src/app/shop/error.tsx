"use client";

import { SectionError } from "@/components/SectionError";

export default function Error(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <SectionError {...props} titleKey="error.section.shop" backHref="/" backKey="shell.home" />
  );
}
