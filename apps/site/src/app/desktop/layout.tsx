// SPDX-License-Identifier: Apache-2.0
import "@shenron/ui/chat.css";
import "./titlebar.css";

import { TitleBar } from "./TitleBar";

/**
 * Desktop routes: the M3 chat stylesheet (Material 3 utilities, Dragon Ball scheme) and the
 * title bar of the frameless Shenron Studio window (nothing in a browser).
 */
export default function DesktopLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TitleBar />
      {children}
    </>
  );
}
