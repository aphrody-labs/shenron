// SPDX-License-Identifier: Apache-2.0
import {
  type FilmProject,
  type FilmClip,
  createFilmProject,
  razorFilmClip,
  cutFilmClip,
  spliceFilmClip,
  getClipsAtFrame,
} from "./timeline";

export type ExportFormat = "h264" | "hevc" | "prores" | "av1" | "webm" | "mp4";
export type ExportPreset =
  | "draft"
  | "youtube-1080p"
  | "youtube-4k"
  | "dragonball-archive-1080p24"
  | "crunchyroll-master";

export interface MediaProbeResult {
  url: string;
  durationSeconds: number;
  width: number;
  height: number;
  fps: number;
  videoCodec: string;
  audioCodec: string;
  hasAudio: boolean;
  bitrateKbps: number;
  isR2Asset: boolean;
}

export interface RenderFrameResult {
  frame: number;
  timecodeSeconds: number;
  activeClips: FilmClip[];
  renderPipeline: "webcodecs-gpu" | "software-canvas";
  width: number;
  height: number;
  timestamp: string;
}

export interface ExportJobOptions {
  format?: ExportFormat;
  preset?: ExportPreset;
  quality?: number;
  startFrame?: number;
  endFrame?: number;
  outputPath?: string;
  r2DestinationKey?: string;
}

export interface ExportJobResult {
  jobId: string;
  format: ExportFormat;
  preset: ExportPreset;
  outputPath: string;
  totalFrames: number;
  estimatedSizeMb: number;
  r2Url?: string;
  status: "queued" | "completed";
}

export interface CommandExecutionResult {
  success: boolean;
  commandId: string;
  result?: unknown;
  error?: string;
}

export class FilmCraftEngine {
  private project: FilmProject;

  constructor(initialProject?: FilmProject) {
    this.project = initialProject ?? createFilmProject();
  }

  public getProject(): FilmProject {
    return this.project;
  }

  public setProject(project: FilmProject): void {
    this.project = project;
  }

  public async probeMedia(url: string): Promise<MediaProbeResult> {
    const isR2 =
      url.includes("r2.cloudflarestorage.com") ||
      url.includes("cdn.dragonballfr.com") ||
      url.includes("assets.");
    // Simulate zero-download HTTP range metadata inspection
    return {
      url,
      durationSeconds: 1440, // 24 minutes standard episode
      width: 1920,
      height: 1080,
      fps: 24,
      videoCodec: "avc1.640028",
      audioCodec: "mp4a.40.2",
      hasAudio: true,
      bitrateKbps: 4500,
      isR2Asset: isR2,
    };
  }

  public executeCommand(
    commandId: string,
    params: Record<string, unknown> = {},
  ): CommandExecutionResult {
    try {
      switch (commandId) {
        case "timeline.razor": {
          const clipId = String(params.clipId ?? "");
          const frame =
            params.frame != null
              ? Number(params.frame)
              : Math.round(Number(params.seconds ?? 0) * this.project.fps);
          const [first, second] = razorFilmClip(this.project, clipId, frame);
          return { success: true, commandId, result: { first, second } };
        }
        case "timeline.cut": {
          const clipId = String(params.clipId ?? "");
          const ripple = Boolean(params.ripple ?? false);
          const removed = cutFilmClip(this.project, clipId, ripple);
          return { success: true, commandId, result: { removed } };
        }
        case "timeline.splice": {
          const trackId = String(params.trackId ?? "v1");
          const clip = params.clip as FilmClip;
          const frame = Number(params.frame ?? 0);
          spliceFilmClip(this.project, trackId, clip, frame);
          return { success: true, commandId, result: { inserted: clip.id, frame } };
        }
        case "timeline.set_playhead": {
          const frame =
            params.frame != null
              ? Number(params.frame)
              : Math.round(Number(params.seconds ?? 0) * this.project.fps);
          this.project.playheadFrame = Math.max(0, Math.min(frame, this.project.durationFrames));
          return {
            success: true,
            commandId,
            result: { playheadFrame: this.project.playheadFrame },
          };
        }
        case "timeline.mute_track": {
          const trackId = String(params.trackId ?? "");
          const muted = Boolean(params.muted ?? true);
          const track = this.project.tracks.find((t) => t.id === trackId);
          if (track) track.muted = muted;
          return { success: true, commandId, result: { trackId, muted } };
        }
        default:
          return { success: false, commandId, error: `Unknown command ${commandId}` };
      }
    } catch (err: unknown) {
      return { success: false, commandId, error: err instanceof Error ? err.message : String(err) };
    }
  }

  public renderFrame(frame?: number): RenderFrameResult {
    const targetFrame = frame ?? this.project.playheadFrame;
    const activeClips = getClipsAtFrame(this.project, targetFrame);

    return {
      frame: targetFrame,
      timecodeSeconds: targetFrame / this.project.fps,
      activeClips,
      renderPipeline: "webcodecs-gpu",
      width: this.project.width,
      height: this.project.height,
      timestamp: new Date().toISOString(),
    };
  }

  public exportSequence(options: ExportJobOptions = {}): ExportJobResult {
    const format = options.format ?? "mp4";
    const preset = options.preset ?? "dragonball-archive-1080p24";
    const startFrame = options.startFrame ?? 0;
    const endFrame = options.endFrame ?? this.project.durationFrames;
    const totalFrames = Math.max(0, endFrame - startFrame);
    const durationSeconds = totalFrames / this.project.fps;

    const bitratePresets: Record<ExportPreset, number> = {
      draft: 1500,
      "youtube-1080p": 8000,
      "youtube-4k": 35000,
      "dragonball-archive-1080p24": 6000,
      "crunchyroll-master": 12000,
    };

    const bitrate = bitratePresets[preset] ?? 6000;
    const estimatedSizeMb = Math.round(((bitrate * durationSeconds) / 8 / 1024) * 100) / 100;
    const jobId = `job-${Date.now()}`;
    const outputPath = options.outputPath ?? `/var/export/fc-${jobId}.${format}`;
    const r2Url = options.r2DestinationKey
      ? `https://cdn.dragonballfr.com/exports/${options.r2DestinationKey}`
      : undefined;

    return {
      jobId,
      format,
      preset,
      outputPath,
      totalFrames,
      estimatedSizeMb,
      r2Url,
      status: "completed",
    };
  }
}
