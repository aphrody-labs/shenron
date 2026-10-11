// SPDX-License-Identifier: Apache-2.0
import { KintoUn } from "../toriyama/KintoUn";

interface CompositionPlan {
  request: { width: number; height: number; kind: "chronology" | "beerus" | "original" };
  render: { endFrame: number };
  cards: { title: string; subtitle?: string; date?: string }[];
  labels: { title: string; subtitle: string; dateLabel: string };
}

/** Every visual depends only on the immutable plan and the requested frame. */
export function ShenronComposition({ plan, frame }: { plan: CompositionPlan; frame: number }) {
  if (!plan.cards.length) throw new Error("Composition requires verified cards");
  if (!Number.isSafeInteger(frame) || frame < 0 || frame >= plan.render.endFrame)
    throw new RangeError("Frame outside plan");
  const progress = frame / Math.max(1, plan.render.endFrame - 1);
  const index = Math.min(plan.cards.length - 1, Math.floor(progress * plan.cards.length));
  const card = plan.cards[index]!;
  const x =
    plan.request.kind === "original"
      ? -200 + progress * (plan.request.width + 100)
      : plan.request.width * 0.67;
  const y =
    plan.request.height * 0.57 + Math.sin(progress * Math.PI * 4) * plan.request.height * 0.025;
  return (
    <main
      style={{
        width: plan.request.width,
        height: plan.request.height,
        overflow: "hidden",
        position: "relative",
        background: "#091226",
        color: "#fff",
        fontFamily: "sans-serif",
        boxSizing: "border-box",
        padding: plan.request.width * 0.06,
      }}
    >
      <div style={{ fontSize: plan.request.width * 0.02, color: "#FCF03A", letterSpacing: 2 }}>
        SHENRON
      </div>
      <h1 style={{ fontSize: plan.request.width * 0.046, margin: "20px 0" }}>
        {plan.labels.title}
      </h1>
      <p style={{ fontSize: plan.request.width * 0.018, color: "#adc0e3" }}>
        {plan.labels.subtitle}
      </p>
      <section style={{ position: "absolute", left: "6%", top: "38%", width: "58%" }}>
        <h2 style={{ fontSize: plan.request.width * 0.03, lineHeight: 1.3 }}>{card.title}</h2>
        {card.subtitle && <p style={{ fontSize: plan.request.width * 0.021 }}>{card.subtitle}</p>}
        {card.date && (
          <p style={{ fontSize: plan.request.width * 0.017, color: "#adc0e3" }}>
            {plan.labels.dateLabel}: {card.date}
          </p>
        )}
      </section>
      <div
        style={{
          position: "absolute",
          left: x,
          top: y,
          transform: `rotate(${Math.sin(progress * Math.PI * 2) * 4}deg)`,
        }}
      >
        <KintoUn decorative hauteur={plan.request.height * 0.16} />
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          height: 6,
          width: `${progress * 100}%`,
          background: "#FCF03A",
        }}
      />
    </main>
  );
}
