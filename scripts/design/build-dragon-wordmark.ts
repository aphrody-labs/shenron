import { renderDragonBallWordmark } from "../../packages/ui/src/toriyama-svg/wordmark";

const output = new URL("../../packages/ui/assets/brand/dragon-ball-wordmark.svg", import.meta.url);
const svg = renderDragonBallWordmark();
if (Bun.argv.includes("--check")) {
  if (!(await Bun.file(output).exists()) || (await Bun.file(output).text()) !== svg) {
    throw new Error(
      "Dragon Ball wordmark is out of date; run bun scripts/design/build-dragon-wordmark.ts",
    );
  }
} else {
  await Bun.write(output, svg);
}
