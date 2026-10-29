// SPDX-License-Identifier: Apache-2.0
import type { ReactNode } from "react";
import { LocaleProvider } from "@/lib/i18n/client";
import { ChunkReloadGuard } from "@/components/ChunkReloadGuard";
import { FONT_PRELOADS } from "@/lib/font-preloads";
import { STATIC_PREFIX } from "@/lib/config";

/** Dedicated process shell: no site navigation, consent, analytics or promotional overlays. */
export function GameSurfaceLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className="dark" suppressHydrationWarning>
      <head>
        {FONT_PRELOADS.map((href) => (
          <link
            key={href}
            rel="preload"
            href={`${STATIC_PREFIX}${href}`}
            as="font"
            type="font/woff2"
            crossOrigin="anonymous"
          />
        ))}
      </head>
      <body
        data-site-surface="game"
        className="font-sans antialiased bg-dbz-bg text-os"
        style={{ margin: 0, padding: 0, height: "100dvh", overflow: "hidden" }}
      >
        <LocaleProvider>
          <ChunkReloadGuard />
          {children}
        </LocaleProvider>
      </body>
    </html>
  );
}
