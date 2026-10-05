import { GridSkeleton, MediaIndexSkeleton } from "@/components/media/MediaSkeletons";

export default function Loading() {
  return (
    <MediaIndexSkeleton>
      {/* Les databooks s’affichent en couvertures : proportion d’affiche. */}
      <GridSkeleton count={10} />
    </MediaIndexSkeleton>
  );
}
