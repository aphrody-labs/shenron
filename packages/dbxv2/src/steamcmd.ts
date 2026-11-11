// SPDX-License-Identifier: Apache-2.0
/**
 * SteamCMD automated setup and management for Dragon Ball Xenoverse 2.
 * App ID: 323470 (DRAGON BALL XENOVERSE 2)
 *
 * Provides headless depot sync, integrity validation, and asset extraction
 * coordination for Shenron reverse engineering and data pipelines.
 */
import { existsSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { homedir } from "node:os";

export const DBXV2_STEAM_APP_ID = 323470;

export const DBXV2_DEPOTS = {
  content: 323471,
  executableWindows: 323472,
  audioVideo: 323473,
  english: 323474,
  french: 323475,
  japanese: 323476,
} as const;

export interface Dbxv2InstallationReport {
  installed: boolean;
  appId: number;
  installDir: string;
  executableFound: boolean;
  executablePath?: string;
  dataCpks: string[];
  totalSizeBytes: number;
  version?: string;
  missingRequirements: string[];
}

export interface SteamcmdScriptOptions {
  installDir: string;
  username?: string;
  password?: string;
  validate?: boolean;
  betaBranch?: string;
  betaPassword?: string;
}

export interface Dbxv2SyncOptions extends SteamcmdScriptOptions {
  steamcmdPath?: string;
  onProgress?: (log: string) => void;
}

export interface Dbxv2SyncResult {
  success: boolean;
  exitCode: number;
  output: string;
  report: Dbxv2InstallationReport;
}

/** Search standard system locations for steamcmd binary. */
export function findSteamcmdExecutable(): string | null {
  const isWindows = process.platform === "win32";
  const binaryName = isWindows ? "steamcmd.exe" : "steamcmd";

  // Check explicit environment variable
  if (process.env.STEAMCMD_PATH && existsSync(process.env.STEAMCMD_PATH)) {
    return process.env.STEAMCMD_PATH;
  }

  const candidateDirs: string[] = isWindows
    ? [
        "C:\\steamcmd",
        "C:\\tools\\steamcmd",
        join(homedir(), "steamcmd"),
        join(homedir(), "AppData", "Local", "SteamCMD"),
        join(process.env.PROGRAMFILES ?? "C:\\Program Files", "SteamCMD"),
      ]
    : [
        "/usr/games/steamcmd",
        "/usr/bin/steamcmd",
        "/usr/local/bin/steamcmd",
        join(homedir(), ".steam", "steamcmd"),
        join(homedir(), "steamcmd"),
        join(homedir(), ".local", "share", "Steam", "steamcmd"),
      ];

  for (const dir of candidateDirs) {
    const full = join(dir, binaryName);
    if (existsSync(full)) return full;
  }

  return null;
}

/** Generate a self-contained SteamCMD script for DBXV2 deployment. */
export function generateSteamcmdScript(options: SteamcmdScriptOptions): string {
  const user = options.username ?? "anonymous";
  const pass = options.password ? ` ${options.password}` : "";
  const validateFlag = options.validate !== false ? " validate" : "";
  const betaFlag = options.betaBranch
    ? ` -beta ${options.betaBranch}${options.betaPassword ? ` -betapassword ${options.betaPassword}` : ""}`
    : "";

  const normInstallDir = options.installDir.replaceAll("\\", "/");

  return [
    `@ShutdownOnFailedCommand 1`,
    `@NoPromptForPassword 1`,
    `force_install_dir "${normInstallDir}"`,
    `login ${user}${pass}`,
    `app_update ${DBXV2_STEAM_APP_ID}${betaFlag}${validateFlag}`,
    `quit`,
  ].join("\n");
}

/** Validate whether a local folder contains a valid DBXV2 installation. */
export async function verifyDbxv2Installation(
  installDir: string,
): Promise<Dbxv2InstallationReport> {
  const absDir = resolve(installDir);
  const missing: string[] = [];

  if (!existsSync(absDir)) {
    return {
      installed: false,
      appId: DBXV2_STEAM_APP_ID,
      installDir: absDir,
      executableFound: false,
      dataCpks: [],
      totalSizeBytes: 0,
      missingRequirements: ["Installation directory does not exist"],
    };
  }

  // Check executable
  const isWindows = process.platform === "win32";
  const exePath = join(absDir, "bin", isWindows ? "DBXV2.exe" : "DBXV2");
  const exeAltPath = join(absDir, isWindows ? "DBXV2.exe" : "DBXV2");
  let finalExe: string | undefined;

  if (existsSync(exePath)) {
    finalExe = exePath;
  } else if (existsSync(exeAltPath)) {
    finalExe = exeAltPath;
  } else {
    missing.push("DBXV2.exe not found in bin/ or root");
  }

  // Scan for CPK data archives
  const cpks: string[] = [];
  let totalSize = 0;

  try {
    const files = await readdir(absDir, { recursive: true });
    for (const f of files) {
      if (typeof f === "string" && f.toLowerCase().endsWith(".cpk")) {
        const full = join(absDir, f);
        cpks.push(f.replaceAll("\\", "/"));
        try {
          const s = await stat(full);
          totalSize += s.size;
        } catch {
          // Ignore unreadable files
        }
      }
    }
  } catch {
    missing.push("Unable to scan data archives");
  }

  if (cpks.length === 0) {
    missing.push("No .cpk data packages detected (data.cpk, data2.cpk required)");
  }

  return {
    installed: finalExe !== undefined && cpks.length > 0,
    appId: DBXV2_STEAM_APP_ID,
    installDir: absDir,
    executableFound: finalExe !== undefined,
    executablePath: finalExe,
    dataCpks: cpks.toSorted(),
    totalSizeBytes: totalSize,
    missingRequirements: missing,
  };
}

/** Execute steamcmd to synchronize DBXV2 game files. */
export async function syncDbxv2Depots(options: Dbxv2SyncOptions): Promise<Dbxv2SyncResult> {
  const steamcmdBin = options.steamcmdPath ?? findSteamcmdExecutable();
  if (!steamcmdBin) {
    const report = await verifyDbxv2Installation(options.installDir);
    return {
      success: false,
      exitCode: 127,
      output: "SteamCMD executable not located on host system",
      report,
    };
  }

  const scriptContent = generateSteamcmdScript(options);
  const tmpScriptPath = join(homedir(), `.dbxv2-steamcmd-${Date.now()}.txt`);
  await Bun.write(tmpScriptPath, scriptContent);

  try {
    const child = Bun.spawn([steamcmdBin, "+runscript", tmpScriptPath], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);

    const combinedOutput = `${stdout}\n${stderr}`.trim();
    if (options.onProgress) {
      options.onProgress(combinedOutput);
    }

    const report = await verifyDbxv2Installation(options.installDir);

    return {
      success: exitCode === 0 && report.installed,
      exitCode,
      output: combinedOutput,
      report,
    };
  } finally {
    try {
      const f = Bun.file(tmpScriptPath);
      if (await f.exists()) {
        await f.delete();
      }
    } catch {
      // Ignore temp file cleanup errors
    }
  }
}
