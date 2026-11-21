"use client";

import { SectionError } from "@/components/SectionError";

export default function Error(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <SectionError {...props} titleKey="error.section.sagas" backHref="/" backKey="shell.home" />
  );
}
