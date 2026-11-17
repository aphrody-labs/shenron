#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
import { FilmCraftEngine } from "./engine";

const args = process.argv.slice(2);
const command = args[0] || "--help";

const engine = new FilmCraftEngine();

async function main() {
  switch (command) {
    case "inspect":
    case "--demo": {
      const proj = engine.getProject();
      console.log(
        `[filmcraft-cli] Project: ${proj.title} (${proj.width}x${proj.height} @ ${proj.fps}fps)`,
      );
      console.log(
        `[filmcraft-cli] Tracks: ${proj.tracks.length}, Total frames: ${proj.durationFrames}`,
      );
      break;
    }

    case "commands": {
      const available = [
        "timeline.razor",
        "timeline.cut",
        "timeline.splice",
        "timeline.set_playhead",
        "timeline.mute_track",
      ];
      console.log(JSON.stringify(available, null, 2));
      break;
    }

    case "probe": {
      const file = args[1] || "demo.mp4";
      const info = await engine.probeMedia(file);
      console.log(JSON.stringify(info, null, 2));
      break;
    }

    case "render": {
      let seconds = 0;
      const secIdx = args.indexOf("--seconds");
      if (secIdx !== -1 && args[secIdx + 1]) {
        seconds = parseFloat(args[secIdx + 1]);
      }
      const frame = Math.round(seconds * engine.getProject().fps);
      const res = engine.renderFrame(frame);
      console.log(
        `[filmcraft-cli] Rendered frame ${res.frame} at ${res.timecodeSeconds}s (${res.renderPipeline})`,
      );
      break;
    }

    case "export": {
      const out = args[1] || "output.mp4";
      const res = engine.exportSequence({ outputPath: out });
      console.log(
        `[filmcraft-cli] Export complete: ${res.outputPath} (${res.estimatedSizeMb} MB, ${res.totalFrames} frames)`,
      );
      break;
    }

    case "--help":
    default: {
      console.log(`FilmCraft CLI - Headless Video Timeline & Automation Engine (Bun v1.4.4+)`);
      console.log(`Usage: filmcraft-cli <inspect|commands|probe|render|export> [options]`);
      break;
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
