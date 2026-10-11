// SPDX-License-Identifier: Apache-2.0
import { mkdtemp, readFile, realpath, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir, homedir } from "node:os";
import { join, relative, resolve, isAbsolute } from "node:path";

const target = "https://www.crunchyroll.com/fr/watch/GE00389313JAJP/the-god-who-destroys";
const episodeId = "GE00389313JAJP";
const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const pause = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

class Cdp {
  private sequence = 0;
  private pending = new Map<
    number,
    { resolve: (value: any) => void; reject: (error: Error) => void }
  >();
  constructor(private socket: WebSocket) {
    socket.addEventListener("message", (event) => {
      const packet = JSON.parse(String(event.data));
      const request = this.pending.get(packet.id);
      if (!request) return;
      this.pending.delete(packet.id);
      if (packet.error) request.reject(new Error("Chrome protocol command failed"));
      else request.resolve(packet.result);
    });
  }
  static async connect(url: string) {
    const parsed = new URL(url);
    if (parsed.protocol !== "ws:" || parsed.hostname !== "127.0.0.1")
      throw new Error("Non-loopback debugging endpoint rejected");
    const socket = new WebSocket(url);
    await new Promise<void>((done, fail) => {
      const timer = setTimeout(() => {
        socket.close();
        fail(new Error("Chrome connection timed out"));
      }, 10000);
      socket.addEventListener(
        "open",
        () => {
          clearTimeout(timer);
          done();
        },
        { once: true },
      );
      socket.addEventListener(
        "error",
        () => {
          clearTimeout(timer);
          fail(new Error("Chrome connection failed"));
        },
        {
          once: true,
        },
      );
    });
    return new Cdp(socket);
  }
  call(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<any> {
    const id = ++this.sequence;
    return new Promise((fulfill, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("Chrome command timed out"));
      }, 15000);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          fulfill(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      this.socket.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }
  close() {
    this.socket.close();
  }
}

function csvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    if (char === '"') {
      if (quoted && csv[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && csv[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  if (quoted) throw new Error("Credential CSV malformed");
  row.push(cell);
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

async function credentials() {
  const receiptPath = process.env.SHENRON_CRUNCHYROLL_VAULT_RECEIPT;
  if (!receiptPath || !isAbsolute(receiptPath))
    throw new Error("Protected credential receipt required");
  const canonical = await realpath(receiptPath);
  const workspace = resolve(import.meta.dir, "../..");
  const inside = relative(workspace, canonical);
  if (!inside.startsWith("..") && !isAbsolute(inside))
    throw new Error("Credential receipt must be outside the repository");
  const receipt = JSON.parse(await readFile(canonical, "utf8"));
  if (
    typeof receipt.service !== "string" ||
    !Number.isInteger(receipt.chunks) ||
    receipt.chunks < 1 ||
    receipt.chunks > 100
  )
    throw new Error("Credential receipt invalid");
  const secretStore = (
    Bun as unknown as {
      secrets?: { get(input: { service: string; name: string }): Promise<string | null> };
    }
  ).secrets;
  if (!secretStore) throw new Error("Native Bun secret store unavailable");
  let csv = "";
  for (let i = 0; i < receipt.chunks; i++) {
    const chunk = await secretStore.get({
      service: receipt.service,
      name: `csv-${String(i).padStart(5, "0")}`,
    });
    if (chunk === null) throw new Error("Credential chunk missing");
    csv += chunk;
  }
  const decoded = Buffer.from(csv, "base64").toString("utf8");
  const [headers, ...rows] = csvRows(decoded.startsWith("name,url,") ? decoded : csv);
  csv = "";
  if (!headers) throw new Error("Credential CSV empty");
  const urlIndex = headers.indexOf("url"),
    usernameIndex = headers.indexOf("username"),
    passwordIndex = headers.indexOf("password");
  if ([urlIndex, usernameIndex, passwordIndex].some((index) => index < 0))
    throw new Error("Credential headers invalid");
  const matches = rows.filter((row) => {
    try {
      const url = new URL(row[urlIndex]!);
      return (
        url.protocol === "https:" &&
        (url.hostname === "crunchyroll.com" || url.hostname.endsWith(".crunchyroll.com"))
      );
    } catch {
      return false;
    }
  });
  const selected =
    matches.length === 1
      ? { username: matches[0]![usernameIndex]!, password: matches[0]![passwordIndex]! }
      : null;
  for (const row of rows) row.fill("");
  rows.length = 0;
  matches.length = 0;
  headers.fill("");
  if (!selected) throw new Error("A unique Crunchyroll credential is required");
  return selected;
}

async function main() {
  if (!process.argv.includes("--run"))
    throw new Error("Explicit --run required; no credentials or browser accessed");
  const account = await credentials();
  const profile = await mkdtemp(join(tmpdir(), "shenron-crunchyroll-"));
  const child = Bun.spawn(
    [
      chrome,
      "--headless=new",
      "--remote-debugging-address=127.0.0.1",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "about:blank",
    ],
    { stdout: "ignore", stderr: "ignore", windowsHide: true },
  );
  let cdp: Cdp | undefined;
  const report: Record<string, unknown> = {
    checkedAt: new Date().toISOString(),
    episodeId,
    provider: "Crunchyroll",
    providerPlayback: false,
    providerVideoAdvanced: false,
    identityUnverified: true,
    loginSubmitted: false,
    authenticatedKnown: false,
    forkHlsPlayback: false,
    status: "failed",
    reason: "not_started",
  };
  try {
    let port = "",
      browserPath = "";
    for (let i = 0; i < 100; i++) {
      try {
        [port, browserPath] = (await readFile(join(profile, "DevToolsActivePort"), "utf8"))
          .trim()
          .split(/\r?\n/) as [string, string];
        break;
      } catch {
        await pause(200);
      }
    }
    if (!/^\d+$/.test(port) || !browserPath.startsWith("/devtools/browser/"))
      throw new Error("Chrome debugging endpoint unavailable");
    cdp = await Cdp.connect(`ws://127.0.0.1:${port}${browserPath}`);
    const version = await cdp.call("Browser.getVersion");
    report.browser = version.product;
    const { targetId } = await cdp.call("Target.createTarget", { url: target });
    const { sessionId } = await cdp.call("Target.attachToTarget", { targetId, flatten: true });
    await cdp.call("Page.enable", {}, sessionId);
    const evaluate = async (expression: string, contextId?: number) => {
      const result = await cdp!.call(
        "Runtime.evaluate",
        { expression, returnByValue: true, ...(contextId ? { contextId } : {}) },
        sessionId,
      );
      if (result.exceptionDetails) throw new Error("Browser evaluation failed");
      return result.result.value;
    };
    let submitted = false,
      loginClicked = false;
    for (let attempt = 0; attempt < 45; attempt++) {
      await pause(2000);
      const state = await evaluate(
        `(() => { const text=document.body?.innerText||''; const u=new URL(location.href); const title=[...document.querySelectorAll('h1')].map(e=>e.textContent).join(' ')+' '+(navigator.mediaSession?.metadata?.title||'');const visible=e=>!!e&&e.getClientRects().length>0;return {allowed:u.protocol==='https:'&&(u.hostname==='crunchyroll.com'||u.hostname.endsWith('.crunchyroll.com')),identity:u.pathname.includes('${episodeId}'),hasEpisodeTitle:/the god who destroys|dieu de la destruction/i.test(title),adActive:[...document.querySelectorAll('.ad-showing,.video-ads,[data-testid="ad-container"]')].some(visible),authenticatedKnown:[...document.querySelectorAll('a,button')].some(e=>visible(e)&&/^(log out|sign out|déconnexion|se déconnecter)$/i.test(e.textContent.trim())),unsupported:/unsupported browser|browser is not supported|navigateur.*pas pris en charge|navigateur.*non.*compatible/i.test(text),invalidCredentials:/invalid credentials|incorrect password|invalid email|identifiants incorrects|mot de passe incorrect/i.test(text),challenge:/verify you are human|checking your browser|captcha|vérifiez que vous êtes humain|two.factor|verification code|code de vérification/i.test(text),video:!!document.querySelector('video')}; })()`,
      );
      if (!state.allowed) {
        report.reason = "unexpected_origin";
        break;
      }
      if (state.challenge) {
        report.reason = "challenge_or_mfa";
        break;
      }
      report.authenticatedKnown = state.authenticatedKnown;
      if (state.unsupported || state.invalidCredentials) {
        report.reason = state.unsupported ? "unsupported_browser" : "invalid_credentials";
        break;
      }
      if (state.video && state.identity && state.hasEpisodeTitle && !state.adActive) {
        await evaluate(
          `(() => { const v=document.querySelector('video'); v.muted=true; v.play().catch(()=>{}); })()`,
        );
        const measure = () =>
          evaluate(
            `(() => { const v=document.querySelector('video'); return {time:v.currentTime,frames:v.getVideoPlaybackQuality?.().totalVideoFrames??null,width:v.videoWidth,height:v.videoHeight,paused:v.paused,readyState:v.readyState}; })()`,
          );
        const before = await measure();
        const privateDir = join(
          homedir(),
          ".aphrody/private/reports",
          `shenron-crunchyroll-${crypto.randomUUID()}`,
        );
        await mkdir(privateDir, { recursive: true, mode: 0o700 });
        const capture = async (name: string) => {
          const rect = await evaluate(
            `(() => {const visible=e=>e.getClientRects().length>0;if(!location.pathname.includes('${episodeId}')||[...document.querySelectorAll('input[type=password],input[type=email],input[autocomplete=username],.ad-showing,.video-ads,[data-testid="ad-container"]')].some(visible))throw new Error('Unsafe capture state');const v=document.querySelector('video'),r=v.getBoundingClientRect();const x=Math.max(0,r.left),y=Math.max(0,r.top);return {x:x+scrollX,y:y+scrollY,width:Math.min(innerWidth,r.right)-x,height:Math.min(innerHeight,r.bottom)-y};})()`,
          );
          if (rect.width <= 0 || rect.height <= 0) throw new Error("Video rectangle not visible");
          const shot = await cdp!.call(
            "Page.captureScreenshot",
            { format: "png", clip: { ...rect, scale: 1 }, captureBeyondViewport: false },
            sessionId,
          );
          const path = join(privateDir, name);
          await writeFile(path, Buffer.from(shot.data, "base64"), { mode: 0o600 });
          return path;
        };
        const beforeImage = await capture("video-before.png");
        await pause(8000);
        const after = await measure();
        const afterImage = await capture("video-after.png");
        report.observations = {
          before,
          after,
          hasEpisodeTitle: state.hasEpisodeTitle,
          adActive: state.adActive,
        };
        report.privateImages = [beforeImage, afterImage];
        const passed =
          after.time > before.time + 1 &&
          after.width > 0 &&
          after.height > 0 &&
          (before.frames === null || after.frames > before.frames);
        report.providerVideoAdvanced = passed;
        report.status = passed ? "observed" : "failed";
        report.reason = passed
          ? "provider_video_advanced_on_episode_page"
          : "video_did_not_advance";
        report.episodeContentIdentity =
          "Page route and visible title matched; provider media bytes were not inspected";
        break;
      }
      if (!loginClicked)
        loginClicked = await evaluate(
          `(() => { const a=[...document.querySelectorAll('a')].find(a=>{try{const u=new URL(a.href);return u.protocol==='https:'&&(u.hostname==='sso.crunchyroll.com'||u.hostname==='auth.crunchyroll.com')&&/\\/(login|signin)(\\/|$)/i.test(u.pathname)&&/^(log in|sign in|se connecter|connexion)$/i.test(a.textContent.trim());}catch{return false;}});if(a){a.click();return true;}return false;})()`,
        );
      if (!submitted) {
        const tree = await cdp.call("Page.getFrameTree", {}, sessionId);
        const frames: any[] = [];
        const visit = (node: any) => {
          frames.push(node.frame);
          for (const childFrame of node.childFrames ?? []) visit(childFrame);
        };
        visit(tree.frameTree);
        for (const frame of frames) {
          let url: URL;
          try {
            url = new URL(frame.url);
          } catch {
            continue;
          }
          if (
            url.protocol !== "https:" ||
            !["www.crunchyroll.com", "sso.crunchyroll.com", "auth.crunchyroll.com"].includes(
              url.hostname,
            )
          )
            continue;
          const world = await cdp.call(
            "Page.createIsolatedWorld",
            { frameId: frame.id, worldName: "shenron-private-login" },
            sessionId,
          );
          submitted = await evaluate(
            `(() => {const p=document.querySelector('input[type=password]');const u=document.querySelector('input[type=email],input[autocomplete=username],input[name=username]');if(!p||!u)return false;const text=document.body?.innerText||'';if(/captcha|verification code|two.factor/i.test(text))return false;const button=[...document.querySelectorAll('button[type=submit],input[type=submit]')].find(e=>/^(log in|sign in|se connecter|connexion)$/i.test((e.textContent||e.value||'').trim()));if(!button)return false;const set=(e,v)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,v);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));};set(u,${JSON.stringify(account.username)});set(p,${JSON.stringify(account.password)});button.click();return true;})()`,
            world.executionContextId,
          );
          if (submitted) {
            report.loginSubmitted = true;
            break;
          }
        }
      }
      report.reason = submitted ? "login_or_playback_incomplete" : "no_accessible_login_or_video";
    }
  } catch {
    report.reason = "browser_or_protocol_failure";
  } finally {
    account.username = "";
    account.password = "";
    if (cdp) {
      try {
        await cdp.call("Browser.close");
      } catch {
        /* Chrome may already be closed. */
      }
      cdp.close();
    }
    await Promise.race([child.exited, pause(5000)]);
    if (child.exitCode === null) {
      child.kill();
      await Promise.race([child.exited, pause(5000)]);
    }
    const resolvedProfile = await realpath(profile);
    if (
      child.exitCode !== null &&
      resolvedProfile === resolve(profile) &&
      relative(resolve(tmpdir()), resolvedProfile).startsWith("shenron-crunchyroll-")
    )
      await rm(resolvedProfile, { recursive: true, force: true });
  }
  console.log(JSON.stringify(report, null, 2));
  if (!report.providerPlayback) process.exitCode = 1;
}

await main().catch(() => {
  console.error(
    "Private Crunchyroll qualification could not start; credential values were not logged.",
  );
  process.exitCode = 1;
});
