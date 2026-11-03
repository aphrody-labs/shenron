/** Install complete, pinned visual skills without executing upstream installers. */
import { cp, mkdir, rename, stat } from "node:fs/promises";
import { join, resolve, relative } from "node:path";

type Skill = { name: string; repository: string; commit: string; parts: Record<string, string> };
const root = resolve(import.meta.dir, "../..");
const home = Bun.env.USERPROFILE ?? Bun.env.HOME;
if (!home) throw new Error("USERPROFILE or HOME is required");
const hosts = [".codex/skills", ".claude/skills", ".gemini/config/skills"];
const checkOnly = Bun.argv.includes("--check");
const lock: { skills: Skill[] } = await Bun.file(
  join(root, ".agents/visual-skills.lock.json"),
).json();
const git = Bun.env.SHENRON_GIT_BIN ?? Bun.which("git");
if (!git) throw new Error("Git is required; set SHENRON_GIT_BIN if PATH contains a shell shim");

async function command(args: string[]) {
  const child = Bun.spawn([git!, ...args], { stdout: "pipe", stderr: "pipe" });
  const [code, output, error] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (code !== 0) throw new Error(`Git exited ${code}: ${error}`);
  return output.trim();
}

async function exists(path: string) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") return false;
    throw error;
  }
}

async function hashes(directory: string) {
  const result: Record<string, string> = {};
  for await (const path of new Bun.Glob("**/*").scan({
    cwd: directory,
    onlyFiles: true,
    dot: true,
  })) {
    if (path.split(/[\\/]/).includes("__pycache__") || path.endsWith(".pyc")) continue;
    result[path.replaceAll("\\", "/")] = new Bun.CryptoHasher("sha256")
      .update(await Bun.file(join(directory, path)).arrayBuffer())
      .digest("hex");
  }
  return result;
}

const receipt: unknown[] = [];
for (const skill of lock.skills) {
  if (!/^[a-z0-9-]+$/.test(skill.name) || !/^[a-f0-9]{40}$/.test(skill.commit)) {
    throw new Error("Invalid pinned skill identity");
  }
  const source = join(
    root,
    "var/vendor",
    skill.name === "ui-ux-pro-max" ? "ui-ux-pro-max-skill" : skill.name,
  );
  if (!(await exists(source))) {
    if (checkOnly) throw new Error(`Missing checkout: ${source}`);
    await mkdir(resolve(source, ".."), { recursive: true });
    await command(["clone", "--no-checkout", skill.repository, source]);
    await command(["-C", source, "checkout", "--detach", skill.commit]);
  }
  if ((await command(["-C", source, "rev-parse", "HEAD"])) !== skill.commit) {
    throw new Error(`Checkout pin mismatch: ${source}; existing checkout preserved`);
  }
  const expected: Record<string, string> = {};
  for (const [from, to] of Object.entries(skill.parts)) {
    const input = join(source, from);
    if ((await stat(input)).isDirectory()) {
      for (const [file, hash] of Object.entries(await hashes(input))) {
        expected[to === "." ? file : `${to}/${file}`] = hash;
      }
    } else
      expected[to] = new Bun.CryptoHasher("sha256")
        .update(await Bun.file(input).arrayBuffer())
        .digest("hex");
  }
  for (const host of hosts) {
    const destination = resolve(home, host, skill.name);
    const current = (await exists(destination)) ? await hashes(destination) : {};
    const matches = Object.entries(expected).every(([file, hash]) => current[file] === hash);
    if (!matches) {
      if (checkOnly) throw new Error(`Missing or modified canonical files: ${destination}`);
      if (await exists(destination)) {
        const backup = join(
          home,
          ".cache/shenron/skill-backups",
          `${Date.now()}-${crypto.randomUUID()}`,
          host,
          skill.name,
        );
        if (
          relative(resolve(home), destination).startsWith("..") ||
          relative(resolve(home), backup).startsWith("..")
        ) {
          throw new Error("Skill path escaped the user profile");
        }
        await mkdir(resolve(backup, ".."), { recursive: true });
        await rename(destination, backup);
      }
      await mkdir(destination, { recursive: true });
      for (const [from, to] of Object.entries(skill.parts)) {
        await cp(join(source, from), join(destination, to), {
          recursive: true,
          dereference: true,
          filter: (path) => !path.split(/[\\/]/).includes("__pycache__") && !path.endsWith(".pyc"),
        });
      }
    }
    const installed = await hashes(destination);
    if (!Object.entries(expected).every(([file, hash]) => installed[file] === hash)) {
      throw new Error(`Post-install SHA-256 mismatch: ${destination}`);
    }
    receipt.push({
      skill: skill.name,
      commit: skill.commit,
      host,
      filesVerified: Object.keys(expected).length,
      destination,
    });
  }
}
console.log(JSON.stringify({ status: "verified", checkOnly, installations: receipt }, null, 2));
