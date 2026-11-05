import { PageShell } from "@/components/kit";
import { T } from "@/components/T";

/**
 * This boundary belongs only to the catalogue, never to unknown episode details.
 *
 * The catalogue is streamed: this fallback is painted first and replaced when
 * the rails arrive. A short fallback left the footer in the viewport, and the
 * swap pushed it ~6 000 px down (CLS 0.479 measured on /wiki/episodes). The
 * fallback therefore reserves two viewports of height, so the footer is below
 * the fold both before and after the swap and nothing visible moves.
 */
export default function Loading() {
  return (
    <PageShell rhythm="tight">
      <div className="min-h-[200svh]" aria-busy="true">
        <div className="flex min-h-11 items-center text-os/70">
          <T k="common.loading" />
        </div>
      </div>
    </PageShell>
  );
}
