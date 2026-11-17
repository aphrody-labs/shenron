// SPDX-License-Identifier: Apache-2.0
import "@aphrody/shenron-ui/koharu.css";

/** The editor's stylesheet is scoped to `[data-koharu-ui]`; only this route loads it. */
export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return children;
}
