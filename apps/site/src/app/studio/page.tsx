// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import { StudioScreen } from "./StudioScreen";

export const metadata: Metadata = {
  title: "Studio",
  description:
    "Studio Shenron : santé, RAG local, corpus, entraînement et modèles locaux (application de bureau).",
  robots: { index: false, follow: false },
};

export default function StudioPage() {
  return <StudioScreen />;
}
