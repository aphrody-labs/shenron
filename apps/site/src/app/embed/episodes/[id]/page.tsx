import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { dbUniverse } from "@/lib/db-universe";
import { assetUrl } from "@/lib/assets";
import { VideoPlayer } from "@/components/episodes/VideoPlayer";
import { idDeFiche } from "@/app/wiki/_id-fiche";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const numero = idDeFiche(id);
  const ep = numero === null ? null : await dbUniverse.episode(numero);
  if (!ep) return { title: "Épisode introuvable" };

  return {
    title: `${ep.title} — Lecteur Intégré`,
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default async function EpisodeEmbedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numero = idDeFiche(id);
  const ep = numero === null ? null : await dbUniverse.episode(numero);
  if (!ep) notFound();

  const videoUrl =
    ep.video_url ||
    ep.stream_url ||
    (ep.players ?? []).find((p: { embedUrl?: string }) => p.embedUrl?.endsWith(".mp4"))?.embedUrl;

  const poster = ep.image ? assetUrl(ep.image) : undefined;

  return (
    <div className="fixed inset-0 w-screen h-screen bg-black flex items-center justify-center overflow-hidden m-0 p-0">
      {videoUrl ? (
        <div className="w-full h-full">
          <VideoPlayer
            episodeId={ep.id}
            src={videoUrl}
            title={ep.title}
            poster={poster}
            subtitles={ep.subtitles ?? undefined}
          />
        </div>
      ) : (
        <div className="text-zinc-500 text-sm font-mono flex items-center justify-center h-full">
          Flux vidéo non disponible
        </div>
      )}
    </div>
  );
}
