import { T } from "@/components/T";

/**
 * Root streaming fallback: a quiet skeleton under the shell, the label for screen readers
 * only. The former full-page loading banner (hard-coded text) read as the page itself on every
 * slow render; the top progress bar (`NavigationProgress`) already says a page is coming.
 */
export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="page-shell py-[clamp(1.5rem,4vw,2.5rem)]">
      <span className="sr-only">
        <T k="common.loading" />
      </span>
      <div aria-hidden className="space-y-4 motion-safe:animate-pulse">
        <div className="h-9 w-2/5 rounded-xl bg-white/[0.05]" />
        <div className="h-4 w-3/5 rounded-xl bg-white/[0.04]" />
        <div className="grid gap-4 pt-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="h-40 rounded-xl border border-white/[0.06] bg-white/[0.03]" />
          <div className="h-40 rounded-xl border border-white/[0.06] bg-white/[0.03]" />
          <div className="hidden h-40 rounded-xl border border-white/[0.06] bg-white/[0.03] lg:block" />
        </div>
      </div>
    </div>
  );
}
