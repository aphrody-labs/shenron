// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "bun:test";
import {
  createFilmProject,
  addFilmClip,
  razorFilmClip,
  cutFilmClip,
  spliceFilmClip,
  getClipsAtFrame,
  FilmCraftEngine,
  FilmCraftMcpServer,
} from "../src/index";

describe("@aphrody/filmcraft timeline", () => {
  it("creates a standard Dragon Ball FilmCraft project", () => {
    const proj = createFilmProject({ title: "DBZ Episode 5 Remaster", fps: 24 });
    expect(proj.title).toBe("DBZ Episode 5 Remaster");
    expect(proj.fps).toBe(24);
    expect(proj.tracks.length).toBe(4);
    expect(proj.tracks[0].id).toBe("v1");
  });

  it("adds, razors, and cuts clips with frame precision", () => {
    const proj = createFilmProject({ fps: 24 });
    const clip = addFilmClip(proj, {
      name: "Scene 1",
      trackId: "v1",
      sourceUrl: "https://cdn.dragonballfr.com/media/episodes/5/source.mp4",
      startFrame: 0,
      durationFrames: 240, // 10 seconds
      sourceInFrame: 0,
      sourceOutFrame: 240,
      speed: 1,
      volume: 1,
      opacity: 1,
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    });

    expect(clip.id).toBeDefined();
    expect(proj.tracks[0].clips.length).toBe(1);

    // Razor clip at frame 120 (5 seconds)
    const [first, second] = razorFilmClip(proj, clip.id, 120);
    expect(first.durationFrames).toBe(120);
    expect(second.startFrame).toBe(120);
    expect(second.durationFrames).toBe(120);
    expect(proj.tracks[0].clips.length).toBe(2);

    // Cut second clip
    const removed = cutFilmClip(proj, second.id);
    expect(removed.id).toBe(second.id);
    expect(proj.tracks[0].clips.length).toBe(1);
  });

  it("splices clips and queries active clips at frame", () => {
    const proj = createFilmProject({ fps: 24 });
    const clip1 = addFilmClip(proj, {
      name: "Intro",
      trackId: "v1",
      sourceUrl: "intro.mp4",
      startFrame: 0,
      durationFrames: 100,
      sourceInFrame: 0,
      sourceOutFrame: 100,
      speed: 1,
      volume: 1,
      opacity: 1,
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    });

    const activeAt50 = getClipsAtFrame(proj, 50);
    expect(activeAt50.length).toBe(1);
    expect(activeAt50[0].id).toBe(clip1.id);

    const clip2 = addFilmClip(proj, {
      name: "Outro",
      trackId: "v1",
      sourceUrl: "outro.mp4",
      startFrame: 100,
      durationFrames: 60,
      sourceInFrame: 0,
      sourceOutFrame: 60,
      speed: 1,
      volume: 1,
      opacity: 1,
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    });

    const activeAt200 = getClipsAtFrame(proj, 200);
    expect(activeAt200.length).toBe(0);

    const splicedClip = {
      id: "spliced-1",
      name: "Interlude",
      trackId: "v1",
      sourceUrl: "interlude.mp4",
      startFrame: 0,
      durationFrames: 50,
      sourceInFrame: 0,
      sourceOutFrame: 50,
      speed: 1,
      volume: 1,
      opacity: 1,
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    };
    spliceFilmClip(proj, "v1", splicedClip, 80);
    expect(proj.tracks[0].clips.length).toBe(3);
    expect(clip2.startFrame).toBe(150); // Shifted from 100 by 50
  });
});

describe("@aphrody/filmcraft engine & MCP tools", () => {
  it("executes timeline commands via FilmCraftEngine", async () => {
    const engine = new FilmCraftEngine();
    const probe = await engine.probeMedia(
      "https://cdn.dragonballfr.com/media/episodes/5/source.mp4",
    );
    expect(probe.isR2Asset).toBe(true);
    expect(probe.fps).toBe(24);

    const res = engine.executeCommand("timeline.set_playhead", { seconds: 10 });
    expect(res.success).toBe(true);
    expect(engine.getProject().playheadFrame).toBe(240);

    const render = engine.renderFrame();
    expect(render.frame).toBe(240);
    expect(render.renderPipeline).toBe("webcodecs-gpu");

    const exp = engine.exportSequence({
      format: "mp4",
      preset: "dragonball-archive-1080p24",
      r2DestinationKey: "dbz-ep5-remaster.mp4",
    });
    expect(exp.status).toBe("completed");
    expect(exp.r2Url).toBe("https://cdn.dragonballfr.com/exports/dbz-ep5-remaster.mp4");
  });

  it("handles tool calls through FilmCraftMcpServer", async () => {
    const server = new FilmCraftMcpServer();
    const inspectRes = await server.handleToolCall({
      tool: "project_inspect",
      arguments: {},
    });
    expect(inspectRes.success).toBe(true);
    expect(inspectRes.content[0].type).toBe("json");

    const execRes = await server.handleToolCall({
      tool: "engine_execute",
      arguments: {
        commandId: "timeline.set_playhead",
        params: { frame: 48 },
      },
    });
    expect(execRes.success).toBe(true);

    const frameRes = await server.handleToolCall({
      tool: "render_frame",
      arguments: { frame: 48 },
    });
    expect(frameRes.success).toBe(true);
  });
});
