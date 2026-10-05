// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import "@shenron/ui/koharu.css";

export const metadata: Metadata = {
	title: "Éditeur de traduction manga",
	description: "Koharu, l'éditeur de traduction manga de Shenron (application de bureau).",
	robots: { index: false, follow: false },
};

export default function KoharuLayout({ children }: { children: React.ReactNode }) {
	return children;
}
