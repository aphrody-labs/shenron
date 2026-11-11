// SPDX-License-Identifier: Apache-2.0
import { FilmCraftEngine, type ExportJobOptions } from "./engine";
import { type FilmProject } from "./timeline";

export interface McpToolCallRequest {
  tool: string;
  arguments: Record<string, unknown>;
}

export interface McpToolCallResponse {
  success: boolean;
  content: Array<{
    type: "text" | "json";
    text?: string;
    data?: unknown;
  }>;
}

export class FilmCraftMcpServer {
  private engine: FilmCraftEngine;

  constructor(engine?: FilmCraftEngine) {
    this.engine = engine ?? new FilmCraftEngine();
  }

  public getEngine(): FilmCraftEngine {
    return this.engine;
  }

  public async handleToolCall(request: McpToolCallRequest): Promise<McpToolCallResponse> {
    const { tool, arguments: args } = request;

    switch (tool) {
      case "engine_execute": {
        const commandId = String(args.commandId ?? args.command ?? "");
        const params = (args.params as Record<string, unknown>) ?? {};
        const res = this.engine.executeCommand(commandId, params);
        return {
          success: res.success,
          content: [{ type: "json", data: res }],
        };
      }

      case "project_inspect": {
        const proj: FilmProject = this.engine.getProject();
        const summary = {
          id: proj.id,
          title: proj.title,
          fps: proj.fps,
          resolution: `${proj.width}x${proj.height}`,
          durationSeconds: proj.durationFrames / proj.fps,
          playheadSeconds: proj.playheadFrame / proj.fps,
          trackCount: proj.tracks.length,
          tracks: proj.tracks.map((t) => ({
            id: t.id,
            name: t.name,
            type: t.type,
            clipCount: t.clips.length,
            clips: t.clips.map((c) => ({
              id: c.id,
              name: c.name,
              startFrame: c.startFrame,
              durationFrames: c.durationFrames,
            })),
          })),
        };
        return {
          success: true,
          content: [{ type: "json", data: summary }],
        };
      }

      case "render_frame": {
        const seconds = args.seconds != null ? Number(args.seconds) : undefined;
        const frame =
          args.frame != null
            ? Number(args.frame)
            : seconds != null
              ? Math.round(seconds * this.engine.getProject().fps)
              : undefined;
        const result = this.engine.renderFrame(frame);
        return {
          success: true,
          content: [{ type: "json", data: result }],
        };
      }

      case "export_sequence": {
        const exportOptions: ExportJobOptions = {
          format: args.format as ExportJobOptions["format"],
          preset: args.preset as ExportJobOptions["preset"],
          quality: args.quality != null ? Number(args.quality) : undefined,
          startFrame: args.startFrame != null ? Number(args.startFrame) : undefined,
          endFrame: args.endFrame != null ? Number(args.endFrame) : undefined,
          outputPath: args.outputPath as string | undefined,
          r2DestinationKey: args.r2DestinationKey as string | undefined,
        };
        const exportResult = this.engine.exportSequence(exportOptions);
        return {
          success: true,
          content: [{ type: "json", data: exportResult }],
        };
      }

      default:
        return {
          success: false,
          content: [{ type: "text", text: `Unknown MCP tool: ${tool}` }],
        };
    }
  }
}
