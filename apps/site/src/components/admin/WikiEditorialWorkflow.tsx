"use client";
// SPDX-License-Identifier: Apache-2.0
import Link from "next/link";
import { Crayon, BouclierCoche, Historique, FlecheDroite } from "@aphrody/shenron-ui/icones";
import { useWikiEditorialText } from "@/lib/wiki-editorial-text";

const STEPS = [
  { key: "write", href: "/admin/wiki/todo", icon: Crayon, accent: "text-dbz-orange" },
  {
    key: "review",
    href: "/admin/wiki/contributions",
    icon: BouclierCoche,
    accent: "text-dbz-cyan",
  },
  { key: "publish", href: "/admin/visibility", icon: Historique, accent: "text-dbz-purple" },
] as const;

/** The same editorial entry points connect the dashboard and review workflow. */
export function WikiEditorialWorkflow() {
  const t = useWikiEditorialText();
  return (
    <section className="mb-8 min-w-0" aria-labelledby="wiki-editorial-workflow">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="wiki-editorial-workflow" className="font-display text-xl font-bold text-os">
            {t("workflow.label")}
          </h2>
          <p className="mt-2 text-sm text-os/75">{t("workflow.intro")}</p>
        </div>
        <Link
          href="/wiki"
          className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-dbz-orange hover:text-dbz-yellow"
        >
          {t("workflow.public")}
          <FlecheDroite aria-hidden className="h-4 w-4" />
        </Link>
      </div>
      <ol className="grid gap-4 md:grid-cols-3">
        {STEPS.map((step, index) => (
          <li key={step.key} className="min-w-0">
            <Link
              href={step.href}
              className="group flex h-full flex-col rounded-xl border border-dbz-border bg-dbz-card p-5 transition-colors hover:border-dbz-yellow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dbz-yellow"
            >
              <span className={`flex items-center gap-3 text-sm font-bold ${step.accent}`}>
                <step.icon aria-hidden className="h-5 w-5" />
                <span aria-hidden>0{index + 1}</span>
              </span>
              <h3 className="mt-4 font-display text-base font-bold text-os group-hover:text-dbz-yellow">
                {t(`workflow.${step.key}`)}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-os/75">
                {t(`workflow.${step.key}Text`)}
              </p>
            </Link>
          </li>
        ))}
      </ol>
      <Link
        href="/admin/wiki/history"
        className="mt-3 inline-flex min-h-11 items-center text-sm text-os/80 hover:text-dbz-yellow"
      >
        {t("workflow.history")}
      </Link>
    </section>
  );
}
