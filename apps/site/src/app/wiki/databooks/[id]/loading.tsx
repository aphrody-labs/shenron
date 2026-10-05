import { MediaDetailSkeleton } from "@/components/media/MediaSkeletons";

/**
 * Fiche d’un databook : couverture et description, puis le lecteur de planches. C’est la
 * page la plus lourde du wiki (jusqu’à 362 planches transcrites), donc celle où l’attente
 * sans repère était la plus longue.
 */
export default function Loading() {
  return <MediaDetailSkeleton />;
}
