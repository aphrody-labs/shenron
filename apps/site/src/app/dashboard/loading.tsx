import { PageShell } from "@aphrody/shenron-ui/layout/PageShell";

export default function DashboardLoading() {
  return (
    <PageShell width="wide" rhythm="tight" className="motion-safe:animate-pulse">
      <div className="h-14 rounded-2xl bg-white/[.06]" />
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="h-72 rounded-3xl bg-white/[.05]" />
        <div className="h-72 rounded-3xl bg-white/[.05]" />
      </div>
      <div className="mt-8 h-64 rounded-3xl bg-white/[.05]" />
    </PageShell>
  );
}
