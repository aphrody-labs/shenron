// SPDX-License-Identifier: Apache-2.0
"use client";
import { ThemeProvider } from "next-themes";
import { Providers } from "@shenron/ui/koharu/providers";
import { KoharuApp } from "@shenron/ui/koharu/components/app/KoharuApp";
import { useLangue } from "@/lib/i18n/client";

/**
 * The full editor, loaded only where its engine is local (see `StudioEditor`). `embedded`: in
 * a browser tab, without the window controls of the desktop app. The editor speaks the locale
 * of the site.
 */
export default function StudioDesktop({ embedded = false }: { embedded?: boolean }) {
  const { locale } = useLangue();
  return (
    <div className="fixed inset-0 z-[100]" data-koharu-host>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <Providers locale={locale}>
          <KoharuApp embedded={embedded} />
        </Providers>
      </ThemeProvider>
    </div>
  );
}
