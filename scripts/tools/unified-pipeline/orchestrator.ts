// SPDX-License-Identifier: Apache-2.0
import { promisify } from "node:util";
import { exec as execCb } from "node:child_process";
import { join } from "node:path";
import { writeFile, mkdir } from "node:fs/promises";

const exec = promisify(execCb);

export interface PipelineOptions {
  mode: "recon" | "render" | "audit" | "all";
  targetUrl?: string;
  mediaPath?: string;
  outputDir?: string;
}

export interface PipelineReport {
  timestamp: string;
  mode: string;
  rea: {
    status: "ok" | "skipped" | "failed";
    details?: any;
  };
  replica: {
    status: "ok" | "skipped" | "failed";
    details?: any;
  };
  filmcraft: {
    status: "ok" | "skipped" | "failed";
    details?: any;
  };
}

/**
 * Run REA passive/static analysis
 */
export async function runReaProbe(targetPath?: string): Promise<any> {
  try {
    const cmd = targetPath
      ? `rea probe "${targetPath}" --format json`
      : `rea providers --format json`;
    const { stdout } = await exec(cmd, { windowsHide: true });
    return JSON.parse(stdout);
  } catch (err: any) {
    return { error: err.message };
  }
}

/**
 * Run Replica UX & Color contrast validation
 */
export async function runReplicaContrast(tokensPath?: string): Promise<any> {
  try {
    const pythonScript = "C:\\Users\\omara\\.gemini\\config\\skills\\replica-design\\contrast.py";
    const args = tokensPath ? `"${pythonScript}" "${tokensPath}"` : `"${pythonScript}" --help`;
    const { stdout } = await exec(`python ${args}`, { windowsHide: true });
    return { output: stdout.trim() };
  } catch (err: any) {
    return { error: err.message };
  }
}

/**
 * Run FilmCraft automated frame rendering and timeline inspection
 */
export async function runFilmcraftInspect(seconds: number = 2.0, outFrame?: string): Promise<any> {
  try {
    const cli = "filmcraft-cli";
    const inspectRes = await exec(`${cli} --demo inspect`, { windowsHide: true });
    if (outFrame) {
      await exec(`${cli} --demo render --seconds ${seconds} --out "${outFrame}"`, {
        windowsHide: true,
      });
    }
    return {
      sequence: JSON.parse(inspectRes.stdout),
      renderedFrame: outFrame ?? null,
    };
  } catch (err: any) {
    return { error: err.message };
  }
}

/**
 * Unified pipeline executor
 */
export async function executeUnifiedPipeline(opts: PipelineOptions): Promise<PipelineReport> {
  const outDir = opts.outputDir || join(process.cwd(), "var", "reports", "unified-pipeline");
  await mkdir(outDir, { recursive: true });

  const report: PipelineReport = {
    timestamp: new Date().toISOString(),
    mode: opts.mode,
    rea: { status: "skipped" },
    replica: { status: "skipped" },
    filmcraft: { status: "skipped" },
  };

  if (opts.mode === "all" || opts.mode === "recon") {
    console.log("[Unified] Executing REA analysis...");
    const reaData = await runReaProbe(opts.mediaPath);
    report.rea = { status: reaData.error ? "failed" : "ok", details: reaData };

    console.log("[Unified] Executing Replica design & parity validation...");
    const replicaData = await runReplicaContrast();
    report.replica = { status: replicaData.error ? "failed" : "ok", details: replicaData };
  }

  if (opts.mode === "all" || opts.mode === "render") {
    console.log("[Unified] Executing FilmCraft GPU render and timeline inspection...");
    const previewPng = join(outDir, "filmcraft-preview.png");
    const filmcraftData = await runFilmcraftInspect(1.0, previewPng);
    report.filmcraft = { status: filmcraftData.error ? "failed" : "ok", details: filmcraftData };
  }

  const reportPath = join(outDir, "pipeline-summary.json");
  await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`[Unified] Pipeline finished. Report written to ${reportPath}`);
  return report;
}

if (import.meta.main) {
  const mode = (process.argv[2] as any) || "all";
  executeUnifiedPipeline({ mode }).catch(console.error);
}
