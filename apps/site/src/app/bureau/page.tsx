// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import { DesktopHome } from "./DesktopHome";

export const metadata: Metadata = {
	title: "Bureau",
	description: "Shenron sur votre ordinateur : recherche locale dans le corpus Dragon Ball, éditeur de traduction manga et studio.",
	robots: { index: false, follow: false },
};

export default function BureauPage() {
	return <DesktopHome />;
}
