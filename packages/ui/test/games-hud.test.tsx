// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { FighterzHpBar, DragonRadarHud } from "../src/games";

describe("Dragon Ball FighterZ UI & HUD Components", () => {
  it("renders FighterZ slanted health bar with active, recoverable, and ghost layers", () => {
    const html = renderToStaticMarkup(
      <FighterzHpBar
        fighterName="SON GOKU"
        activeHp={65}
        recoverableHp={80}
        ghostHp={90}
        assistReady={true}
      />,
    );

    expect(html).toContain("SON GOKU");
    expect(html).toContain("ASSIST OK");
    expect(html).toContain("polygon");
    expect(html).toContain("clipPath");
    expect(html).toContain("hpBarClip");
  });

  it("renders Toriyama Dragon Radar HUD with active dragon ball blips", () => {
    const html = renderToStaticMarkup(<DragonRadarHud ballsCollected={4} shenronReady={false} />);

    expect(html).toContain("DRAGON BALLS : 4/7");
    expect(html).toContain("radarScreenGrad");
    expect(html).toContain("radarBevelGrad");
  });

  it("renders Shenron ready banner when all 7 Dragon Balls are collected", () => {
    const html = renderToStaticMarkup(<DragonRadarHud ballsCollected={7} />);

    expect(html).toContain("SHENRON READY (7/7)");
  });
});
