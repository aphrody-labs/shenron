// SPDX-License-Identifier: Apache-2.0
"use client";
import { ThemeProvider } from "next-themes";
import { Providers } from "@aphrody/shenron-ui/koharu/providers";
import { KoharuApp } from "@aphrody/shenron-ui/koharu/components/app/KoharuApp";
import { useLangue } from "@/lib/i18n/client";
import { DesktopStudioShell } from "./DesktopStudioShell";

/**
 * The full editor, loaded only where its engine is local (see `StudioEditor`). `embedded`: in
 * a browser tab, without the window controls of the desktop app. The editor speaks the locale
 * of the site.
 */
export default function StudioDesktop({ embedded = false }: { embedded?: boolean }) {
  const { locale } = useLangue();
  return (
    <DesktopStudioShell>
      <div className="flex min-h-0 flex-1" data-koharu-host>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <Providers locale={locale}>
            <KoharuApp embedded />
          </Providers>
        </ThemeProvider>
      </div>
    </DesktopStudioShell>
  );
}
