// SPDX-License-Identifier: Apache-2.0
"use client";
import { ThemeProvider } from "next-themes";
import { Providers } from "@shenron/ui/koharu/providers";
import { KoharuApp } from "@shenron/ui/koharu/components/app/KoharuApp";

/** The full editor, loaded only inside the desktop app (see `KoharuEditor`). */
export default function KoharuDesktop() {
  return (
    <div className="fixed inset-0 z-[100]" data-koharu-host>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <Providers>
          <KoharuApp />
        </Providers>
      </ThemeProvider>
    </div>
  );
}
