import { PageShell } from "@/components/kit";
import { T } from "@/components/T";

/** This boundary belongs only to the catalogue, never to unknown episode details. */
export default function Loading() {
  return (
    <PageShell rhythm="tight">
      <div className="flex min-h-11 items-center text-os/70" aria-busy="true">
        <T k="common.loading" />
      </div>
    </PageShell>
  );
}
