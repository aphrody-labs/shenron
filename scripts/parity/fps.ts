/**
 * Frame-time bench of the web gallery (agent-browser) and, when the native binary exists, of the GPUI
 * gallery, plus hyperfine startup runs. Gate of docs/plans/gpui-parite-pixel-120fps.md:
 * p99 frame time <= 8.33 ms and no frame above 16.7 ms over a 10 s scripted interaction at 1920x1080.
 *
 * Usage: bun fps.ts [--mode headed|headless]... [--duration-ms 10000] [--out out/fps] [--no-startup]
 * Writes <out>/report.json and prints it. The refresh rate is read from the browser (median rAF interval of an
 * idle second), never assumed; below 115 Hz the 120 fps verdict is "not measurable" and the main-thread work
 * time per frame is reported instead.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

import { Browser } from "./browser";
import { loadContract } from "./web/serve";

const here = import.meta.dir;
const BUDGET_P99_MS = 1000 / 120;
const BUDGET_MAX_MS = 16.7;

const { values } = parseArgs({
  options: {
    mode: { type: "string", multiple: true },
    "duration-ms": { type: "string", default: "10000" },
    out: { type: "string", default: join(here, "out/fps") },
    "no-startup": { type: "boolean", default: false },
    "no-native": { type: "boolean", default: false },
  },
});
const outDir = values.out ?? join(here, "out/fps");
mkdirSync(outDir, { recursive: true });
const durationMs = Number(values["duration-ms"]);
const modes = values.mode?.length ? values.mode : ["headed", "headless"];

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return Number.NaN;
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
}

export function stats(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const round = (n: number) => Math.round(n * 1000) / 1000;
  return {
    count: sorted.length,
    p50: round(percentile(sorted, 50)),
    p99: round(percentile(sorted, 99)),
    max: round(sorted.at(-1) ?? Number.NaN),
  };
}

const RECORDER = `(() => {
  const state = { frames: [], work: [], loaf: [], events: [], running: true, last: 0, begin: 0 };
  const observe = (type, init, sink) => {
    try {
      new PerformanceObserver((list) => { for (const e of list.getEntries()) sink(e); }).observe({ type, buffered: false, ...init });
    } catch (error) { state[type + 'Error'] = String(error); }
  };
  observe('long-animation-frame', {}, (e) => state.loaf.push({ start: e.startTime, duration: e.duration, blocking: e.blockingDuration }));
  observe('event', { durationThreshold: 16 }, (e) => state.events.push({ name: e.name, start: e.startTime, duration: e.duration }));
  const channel = new MessageChannel();
  channel.port1.onmessage = () => { state.work.push(performance.now() - state.begin); };
  const tick = (t) => {
    if (!state.running) return;
    if (state.last) state.frames.push(t - state.last);
    state.last = t;
    state.begin = performance.now();
    channel.port2.postMessage(0);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  window.__fps = state;
})()`;

const SCRIPT: string[][] = [
  ["hover", "[data-parity=list]"],
  ...Array.from({ length: 8 }, () => ["mouse", "wheel", "300"]),
  ["hover", "[data-parity=button]"],
  ["hover", "[data-parity=tab-2]"],
  ["click", "[data-parity=switch]"],
  ["click", "[data-parity=checkbox]"],
  ["click", "[data-parity=tab-2]"],
  ["click", "[data-parity=tab-1]"],
  ["click", "[data-parity=dialog-trigger]"],
  ["wait", "[data-slot=dialog-close]"],
  ["click", "[data-slot=dialog-close]"],
  ["wait", "300"],
  ["click", "[data-parity=select-trigger]"],
  ["press", "ArrowDown"],
  ["press", "ArrowDown"],
  ["press", "Enter"],
  ["wait", "300"],
  ["click", "[data-parity=input]"],
  ["keyboard", "type", "Dragon Ball"],
  ["hover", "[data-parity=list]"],
  ...Array.from({ length: 8 }, () => ["mouse", "wheel", "-300"]),
];

function hardware(): Record<string, unknown> {
  if (process.platform !== "win32") return { platform: process.platform };
  const ps = (command: string) =>
    Bun.spawnSync(["powershell", "-NoProfile", "-Command", command], { stdout: "pipe" }).stdout.toString().trim();
  const parse = (text: string) => {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  };
  const display = Bun.spawnSync(["agent-desktop", "list-displays"], { stdout: "pipe" }).stdout.toString();
  return {
    cpu: parse(ps("Get-CimInstance Win32_Processor | Select Name,NumberOfCores,NumberOfLogicalProcessors | ConvertTo-Json -Compress")),
    gpu: parse(ps("Get-CimInstance Win32_VideoController | Select Name,DriverVersion,CurrentRefreshRate,CurrentHorizontalResolution,CurrentVerticalResolution | ConvertTo-Json -Compress")),
    memory_bytes: Number(ps("(Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory")),
    os: ps("(Get-CimInstance Win32_OperatingSystem).Caption + ' ' + (Get-CimInstance Win32_OperatingSystem).BuildNumber"),
    displays: parse(display),
  };
}

/** Real Chrome window with its own throw-away profile (agent-browser cannot launch headed next to a running Chrome). */
function launchHeadedChrome(): { port: number; stop: () => void } {
  const candidates = [process.env.ProgramFiles, process.env["ProgramFiles(x86)"], process.env.LOCALAPPDATA]
    .filter((root): root is string => Boolean(root))
    .map((root) => join(root, "Google/Chrome/Application/chrome.exe"));
  const chrome = candidates.find((path) => existsSync(path));
  if (!chrome) throw new Error("no Chrome install found for headed mode");
  const port = 9300 + Math.floor(Math.random() * 500);
  const profile = resolve(outDir, `chrome-profile-${port}`);
  const child = Bun.spawn(
    [chrome, `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--window-size=1920,1080", "about:blank"],
    { stdout: "ignore", stderr: "ignore" },
  );
  return {
    port,
    stop: () => {
      Bun.spawnSync(["taskkill", "/PID", String(child.pid), "/T", "/F"], { stdout: "ignore", stderr: "ignore" });
      Bun.spawnSync(["cmd", "/c", "rmdir", "/s", "/q", profile], { stdout: "ignore", stderr: "ignore" });
    },
  };
}

async function webBench(mode: string, url: string) {
  const session = `parity-fps-${mode}-${Date.now() % 100000}`;
  const browser = new Browser(session);
  browser.run("close");
  const contract = await loadContract();
  const { width, height, scale } = contract.viewport;
  // A fresh headed Chrome sometimes loses its first page target while its extensions start: retry the setup.
  let headed: ReturnType<typeof launchHeadedChrome> | undefined;
  for (let attempt = 1; ; attempt += 1) {
    headed = mode === "headed" ? launchHeadedChrome() : undefined;
    try {
      if (headed) {
        for (let poll = 0; poll < 50; poll += 1) {
          const ready = await fetch(`http://127.0.0.1:${headed.port}/json/list`)
            .then((r) => r.json() as Promise<{ type: string }[]>)
            .then((targets) => targets.some((target) => target.type === "page"), () => false);
          if (ready) break;
          await Bun.sleep(200);
        }
        await Bun.sleep(1500);
        browser.must("connect", String(headed.port));
      } else {
        browser.must("open", "about:blank");
      }
      browser.must("set", "viewport", String(width), String(height), String(scale));
      browser.must("open", `${url}/?id=bench&theme=dark&anim=1`);
      await browser.waitFor("document.documentElement.dataset.parityReady === '1' && document.fonts.status === 'loaded'");
      break;
    } catch (error) {
      headed?.stop();
      browser.run("close");
      if (attempt >= 3) throw error;
      console.error(`[${mode}] setup attempt ${attempt} failed (${String(error).slice(0, 120)}), retrying`);
    }
  }
  const env = browser.eval<Record<string, unknown>>(`(() => {
    const gl = document.createElement('canvas').getContext('webgl');
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    return { user_agent: navigator.userAgent, device_pixel_ratio: devicePixelRatio, inner: [innerWidth, innerHeight],
      screen: [screen.width, screen.height], webgl_renderer: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : null };
  })()`);
  console.error(`[${mode}] page ready, recorder start`);
  browser.eval(RECORDER);
  await Bun.sleep(1500);
  // Refresh rate: median rAF interval over the idle second and a half, before any interaction.
  const idle = browser.eval<number[]>("window.__fps.frames.slice()");
  const idleMedian = [...idle].sort((a, b) => a - b)[Math.floor(idle.length / 2)] ?? Number.NaN;
  const refreshHz = Math.round((1000 / idleMedian) * 10) / 10;
  browser.eval("(() => { const s = window.__fps; s.frames.length = 0; s.work.length = 0; s.loaf.length = 0; s.events.length = 0; s.last = 0; })()");

  console.error(`[${mode}] refresh ${refreshHz} Hz, interaction start`);
  const started = Date.now();
  let cycles = 0;
  let commandErrors = 0;
  const errorSamples = new Set<string>();
  while (Date.now() - started < durationMs) {
    const proc = Bun.spawnSync(["agent-browser", "--session", session, "batch"], {
      stdin: Buffer.from(JSON.stringify(SCRIPT)),
      stdout: "pipe",
      stderr: "pipe",
    });
    for (const line of (proc.stdout.toString() + proc.stderr.toString()).split("\n")) {
      if (!line.startsWith("✗")) continue;
      commandErrors += 1;
      if (errorSamples.size < 3) errorSamples.add(line.slice(0, 200));
    }
    cycles += 1;
    console.error(`[${mode}] cycle ${cycles} done, ${Date.now() - started} ms`);
  }
  const elapsedMs = Date.now() - started;
  const raw = browser.eval<{
    frames: number[];
    work: number[];
    loaf: { duration: number; blocking: number }[];
    events: { name: string; duration: number }[];
  }>("(() => { const s = window.__fps; s.running = false; return { frames: s.frames, work: s.work, loaf: s.loaf, events: s.events }; })()");
  browser.run("close");
  headed?.stop();

  const frame = stats(raw.frames);
  const work = stats(raw.work);
  const frameOk = frame.p99 <= BUDGET_P99_MS && frame.max <= BUDGET_MAX_MS;
  const workOk = work.p99 <= BUDGET_P99_MS && work.max <= BUDGET_MAX_MS;
  const capable = refreshHz >= 115;
  return {
    mode,
    environment: env,
    refresh_hz: refreshHz,
    refresh_from: "median requestAnimationFrame interval over 1.5 s idle",
    interaction: { elapsed_ms: elapsedMs, cycles, commands_per_cycle: SCRIPT.length, command_errors: commandErrors, error_samples: [...errorSamples] },
    frame_interval_ms: frame,
    work_ms: { ...work, definition: "rAF callback start to the next MessageChannel task: main-thread script, style, layout and paint recording; excludes raster and GPU" },
    long_animation_frames: {
      count: raw.loaf.length,
      max_duration_ms: Math.max(0, ...raw.loaf.map((entry) => entry.duration)),
      max_blocking_ms: Math.max(0, ...raw.loaf.map((entry) => entry.blocking)),
    },
    slow_events: { count: raw.events.length, max_duration_ms: Math.max(0, ...raw.events.map((entry) => entry.duration)) },
    gate: {
      budget_p99_ms: Math.round(BUDGET_P99_MS * 100) / 100,
      budget_max_ms: BUDGET_MAX_MS,
      display_can_show_120: capable,
      verdict: capable ? (frameOk ? "pass" : "fail") : "not measurable at this refresh rate",
      frame_interval_within_budget: frameOk,
      work_within_budget: workOk,
    },
  };
}

function hyperfine(name: string, command: string, prepare?: string) {
  const file = join(outDir, `hyperfine-${name}.json`);
  const args = ["--warmup", "3", "--runs", "20", "--export-json", file, "--style", "basic"];
  if (prepare) args.push("--prepare", prepare);
  args.push(command);
  const proc = Bun.spawnSync(["hyperfine", ...args], { stdout: "pipe", stderr: "pipe" });
  if (proc.exitCode !== 0) return { error: proc.stderr.toString() || proc.stdout.toString() };
  const result = JSON.parse(readFileSync(file, "utf8")).results[0];
  return {
    command,
    runs: result.times.length,
    mean_s: result.mean,
    stddev_s: result.stddev,
    median_s: result.median,
    min_s: result.min,
    max_s: result.max,
    file,
  };
}

const port = 4800 + Math.floor(Math.random() * 500);
const url = `http://127.0.0.1:${port}`;
const server = Bun.spawn(["bun", join(here, "web/serve.ts")], {
  env: { ...process.env, PORT: String(port) },
  stdout: "ignore",
  stderr: "inherit",
});
for (let attempt = 0; attempt < 150; attempt += 1) {
  if (await fetch(url).then((response) => response.ok, () => false)) break;
  await Bun.sleep(200);
}

const report: Record<string, unknown> = { date: new Date().toISOString(), hardware: hardware() };
try {
  const web: Record<string, unknown> = {};
  for (const mode of modes) web[mode] = await webBench(mode, url);
  report.web = web;

  if (!values["no-startup"]) {
    const page = `${url}/?id=bench&theme=dark&anim=1`;
    const warm = new Browser("parity-hf-warm");
    warm.must("open", page);
    const startup: Record<string, unknown> = {
      web_navigation_warm: hyperfine("web-navigation-warm", `agent-browser --session parity-hf-warm open "${page}"`),
    };
    warm.run("close");
    startup.web_launch_cold = hyperfine(
      "web-launch-cold",
      `agent-browser --session parity-hf-cold open "${page}"`,
      "agent-browser --session parity-hf-cold close",
    );
    new Browser("parity-hf-cold").run("close");
    report.startup_hyperfine = startup;
  }
} finally {
  server.kill();
}

const native = join(here, "out/native/shenron-gallery.exe");
if (values["no-native"] || !existsSync(native)) {
  report.native = `blocked: ${existsSync(native) ? "disabled by flag" : "no native binary at scripts/parity/out/native/shenron-gallery.exe (Rust builds run on fr1 only; Windows build by cargo-xwin pending)"}`;
} else {
  const run = Bun.spawnSync([native, "window", "--id", "bench", "--duration-ms", String(durationMs), "--json"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (run.exitCode !== 0) {
    report.native = `blocked: native run failed: ${run.stderr.toString().slice(0, 400)}`;
  } else {
    const parsed = JSON.parse(run.stdout.toString()) as { frames_ms: number[]; refresh_hz?: number; adapter?: string };
    const frame = stats(parsed.frames_ms);
    report.native = {
      refresh_hz: parsed.refresh_hz ?? null,
      adapter: parsed.adapter ?? null,
      frame_interval_ms: frame,
      gate: {
        verdict: frame.p99 <= BUDGET_P99_MS && frame.max <= BUDGET_MAX_MS ? "pass" : "fail",
        budget_p99_ms: Math.round(BUDGET_P99_MS * 100) / 100,
        budget_max_ms: BUDGET_MAX_MS,
      },
    };
  }
}

writeFileSync(join(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
