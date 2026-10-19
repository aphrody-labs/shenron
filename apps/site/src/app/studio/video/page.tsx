// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import { ogMeta } from "@/lib/og";
import { StudioVideoWorkspace } from "./StudioVideoWorkspace";

const title = "Shenron Video Studio — FilmCraft & Remotion";
const description =
  "Studio vidéo interactif Dragon Ball Super : montage NLE FilmCraft, interpolation HyperFrame/Remotion et assets manga Toriyama.";

export const metadata: Metadata = {
  title,
  description,
  ...ogMeta({ title, description, type: "website", canonical: "/studio/video" }),
};

export default function StudioVideoPage() {
  return <StudioVideoWorkspace />;
}
