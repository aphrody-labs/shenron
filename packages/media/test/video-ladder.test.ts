import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildCmafLadder,
  CODEC_SETTINGS,
  gopFrames,
  ladderHeights,
  rungFor,
  SEGMENT_SECONDS,
} from "../src/video-ladder";

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

describe("video ladder settings", () => {
  test("renditions follow the source height and keep the lowest", () => {
    expect(ladderHeights(1080)).toEqual([1080, 720, 480, 360]);
    expect(ladderHeights(720)).toEqual([720, 480, 360]);
    expect(ladderHeights(200)).toEqual([360]);
  });

  test("GOP equals the segment length in frames", () => {
    expect(SEGMENT_SECONDS).toBe(6);
    expect(gopFrames(24)).toBe(144);
    expect(gopFrames(23.976)).toBe(144);
    expect(gopFrames(30)).toBe(180);
    expect(() => gopFrames(0)).toThrow(RangeError);
  });

  test("H.264 keeps the ingest.rs caps, AV1 is 60% of them", () => {
    expect(rungFor("h264", 1080)).toEqual({ height: 1080, maxrateKbps: 5000, bufsizeKbps: 10000 });
    expect(rungFor("av1", 1080)).toEqual({ height: 1080, maxrateKbps: 3000, bufsizeKbps: 6000 });
    expect(rungFor("av1", 360)).toEqual({ height: 360, maxrateKbps: 480, bufsizeKbps: 960 });
    expect(CODEC_SETTINGS.h264).toMatchObject({ encoder: "libx264", preset: "veryfast", crf: 23 });
    expect(CODEC_SETTINGS.av1).toMatchObject({ encoder: "libsvtav1", preset: "6", crf: 32 });
  });

  test("default plan is H.264 only, CMAF segments, AAC 128k, one key frame per segment", () => {
    const { args, streams } = buildCmafLadder({
      input: "in.mp4",
      outDir: "out",
      sourceHeight: 720,
      fps: 24,
      hasAudio: true,
    });
    expect(streams.map((s) => s.name)).toEqual(["h264_720p", "h264_480p", "h264_360p"]);
    expect(flag(args, "-hls_segment_type")).toBe("fmp4");
    expect(flag(args, "-hls_segment_filename")).toBe("out/seg_%v_%05d.m4s");
    expect(flag(args, "-hls_fmp4_init_filename")).toBe("init_%v.mp4");
    expect(flag(args, "-hls_flags")).toBe("independent_segments");
    expect(flag(args, "-b:a")).toBe("128k");
    expect(flag(args, "-g:v:0")).toBe("144");
    expect(flag(args, "-keyint_min:v:0")).toBe("144");
    expect(args.join(" ")).not.toContain(".ts");
    expect(args.join(" ")).not.toContain("libsvtav1");
  });

  test("with AV1 enabled each codec gets its own streams and encoder options", () => {
    const { args, streams } = buildCmafLadder({
      input: "in.mp4",
      outDir: "out",
      sourceHeight: 480,
      fps: 24,
      hasAudio: false,
      codecs: ["h264", "av1"],
    });
    expect(streams.map((s) => s.name)).toEqual(["h264_480p", "h264_360p", "av1_480p", "av1_360p"]);
    expect(flag(args, "-c:v:0")).toBe("libx264");
    expect(flag(args, "-c:v:2")).toBe("libsvtav1");
    expect(flag(args, "-crf:v:2")).toBe("32");
    expect(flag(args, "-preset:v:2")).toBe("6");
    expect(flag(args, "-maxrate:v:2")).toBe("840k");
    expect(flag(args, "-sc_threshold:v:0")).toBe("0");
    expect(flag(args, "-sc_threshold:v:2")).toBeUndefined();
    expect(flag(args, "-var_stream_map")).toBe(
      "v:0,name:h264_480p v:1,name:h264_360p v:2,name:av1_480p v:3,name:av1_360p",
    );
    expect(args).not.toContain("-c:a");
  });
});

const ffmpeg = Bun.which("ffmpeg");
const encoders = ffmpeg
  ? await new Response(
      Bun.spawn([ffmpeg, "-hide_banner", "-encoders"], { stdout: "pipe", stderr: "ignore" }).stdout,
    ).text()
  : "";
const canEncode = Boolean(ffmpeg) && /libx264/.test(encoders) && /libsvtav1/.test(encoders);

describe("video ladder with ffmpeg", () => {
  let dir = "";
  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  test.skipIf(!canEncode)(
    "the arguments produce an fMP4 HLS set with avc1 and av01 renditions",
    async () => {
      dir = await mkdtemp(join(tmpdir(), "video-ladder-"));
      const source = join(dir, "source.mp4");
      const make = Bun.spawn(
        [
          ffmpeg!,
          "-y",
          "-v",
          "error",
          "-f",
          "lavfi",
          "-i",
          "testsrc2=size=640x360:rate=24:duration=8",
          "-pix_fmt",
          "yuv420p",
          "-c:v",
          "libx264",
          "-preset",
          "ultrafast",
          source,
        ],
        { stdout: "ignore", stderr: "pipe" },
      );
      expect(await make.exited).toBe(0);
      const out = join(dir, "hls");
      await Bun.write(join(out, ".keep"), "");
      const { args } = buildCmafLadder({
        input: source,
        outDir: out,
        sourceHeight: 360,
        fps: 24,
        hasAudio: false,
        codecs: ["h264", "av1"],
      });
      const run = Bun.spawn([ffmpeg!, ...args], { stdout: "ignore", stderr: "pipe" });
      const code = await run.exited;
      expect(code, await new Response(run.stderr).text()).toBe(0);
      const files = await readdir(out);
      expect(files).toContain("master.m3u8");
      expect(files.some((f) => f.startsWith("init_h264_360p"))).toBe(true);
      expect(files.some((f) => f.startsWith("init_av1_360p"))).toBe(true);
      expect(files.filter((f) => f.endsWith(".m4s")).length).toBeGreaterThanOrEqual(4);
      expect(files.some((f) => f.endsWith(".ts"))).toBe(false);
      const master = await Bun.file(join(out, "master.m3u8")).text();
      expect(master).toContain("avc1");
      expect(master).toContain("av01");
    },
    60_000,
  );
});
