// SPDX-License-Identifier: Apache-2.0
/** Pack and audit public library archives before publishing exact absent versions. */
import { mkdir, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

export async function readPublishedVersion(
  name: string,
  version: string,
  request: (url: string, options: RequestInit) => Promise<Response> = fetch,
  pause: (milliseconds: number) => Promise<unknown> = Bun.sleep,
) {
  for (let attempt = 0; attempt < 13; attempt++) {
    const response = await request(
      "https://registry.npmjs.org/" + encodeURIComponent(name) + "/" + version,
      {
        redirect: "error",
        signal: AbortSignal.timeout(20_000),
        headers: { "Cache-Control": "no-cache" },
      },
    );
    if (response.ok) return response.json();
    if (response.status !== 404 || attempt === 12)
      throw new Error("Published version readback failed " + name + " HTTP " + response.status);
    await pause(10_000);
  }
  throw new Error("Published version readback exhausted");
}

export function isProtectedPackagePath(path: string): boolean {
  return /(^|\/)(?:\.env(?:\.|$)|\.npmrc$|credentials(?:\.|$)|cookies?|corpus|datasets?|models?|weights?|node_modules|data|test|tests|scripts)(\/|$)|\.(?:sqlite|sqlite3|db|safetensors|gguf|pem|key)$/i.test(
    path,
  );
}

export function parseTar(bytes: Uint8Array): Array<{ path: string; bytes: Uint8Array }> {
  const decoder = new TextDecoder(),
    files = [];
  for (let offset = 0; offset + 512 <= bytes.length;) {
    const header = bytes.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const field = (start: number, length: number) =>
      decoder.decode(header.subarray(start, start + length)).split("\0")[0]!;
    const name = field(0, 100),
      prefix = field(345, 155);
    const size = Number.parseInt(field(124, 12).trim() || "0", 8),
      type = field(156, 1);
    if (!Number.isSafeInteger(size) || size < 0 || offset + 512 + size > bytes.length)
      throw new Error("Invalid archive entry size");
    if (type === "x" || type === "g" || type === "L" || type === "K")
      throw new Error("Extended archive headers require explicit review");
    if (type === "0" || type === "") {
      const path = (prefix ? prefix + "/" : "") + name;
      if (
        !path.startsWith("package/") ||
        path.includes("\\") ||
        path.split("/").some((part) => part === "..")
      )
        throw new Error("Unsafe archive entry path");
      files.push({ path: path.slice(8), bytes: bytes.subarray(offset + 512, offset + 512 + size) });
    } else if (type !== "5") throw new Error("Unsupported archive entry type");
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return files;
}

export function auditArchive(bytes: Uint8Array) {
  const files = parseTar(Bun.gunzipSync(new Uint8Array(bytes)));
  const issues: Array<{ path: string; reason: string }> = [];
  for (const file of files) {
    if (isProtectedPackagePath(file.path))
      issues.push({ path: file.path, reason: "protected path" });
    if (/\.(?:[cm]?[jt]sx?|json|css|md|txt)$/.test(file.path)) {
      const text = new TextDecoder().decode(file.bytes);
      if (
        /(?:npm_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|postgres(?:ql)?:\/\/[^\s/@]+:[^\s/@]+@|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/.test(
          text,
        )
      )
        issues.push({ path: file.path, reason: "credential pattern" });
    }
  }
  const manifestFile = files.find((file) => file.path === "package.json");
  if (!manifestFile) throw new Error("Archive manifest missing");
  const manifest = JSON.parse(new TextDecoder().decode(manifestFile.bytes));
  if (manifest.private || !manifest.name.startsWith("@aphrody/shenron-"))
    throw new Error("Archive is not a public Shenron library");
  for (const field of [
    "dependencies",
    "optionalDependencies",
    "peerDependencies",
    "devDependencies",
  ]) {
    if (
      Object.values(manifest[field] ?? {}).some((value) =>
        /^(?:catalog:|workspace:|file:|link:)/.test(String(value)),
      )
    )
      issues.push({ path: "package.json", reason: "unresolved dependency protocol" });
  }
  const visit = (value: unknown): void => {
    if (typeof value === "string" && value.startsWith("./")) {
      const target = value.slice(2);
      const escaped = target.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*");
      if (!files.some((file) => new RegExp("^" + escaped + "$").test(file.path)))
        issues.push({ path: target, reason: "missing export payload" });
    } else if (value && typeof value === "object") Object.values(value).forEach(visit);
  };
  visit(manifest.exports);
  return {
    manifest,
    issues,
    files: files.map((file) => ({ path: file.path, size: file.bytes.length })),
    unpackedBytes: files.reduce((sum, file) => sum + file.bytes.length, 0),
  };
}

if (import.meta.main) {
  const args = process.argv.slice(2),
    root = process.cwd();
  const option = (name: string) =>
    args.find((arg) => arg.startsWith(name + "="))?.slice(name.length + 1);
  const out = resolve(option("--out") ?? "var/reports/package-publication");
  const requested = option("--packages")?.split(",");
  const publish = args.includes("--publish");
  await mkdir(out, { recursive: true });
  const results = [];
  const folders = (await readdir(join(root, "packages"))).toSorted();
  const manifests = new Map<string, { folder: string; dependencies?: Record<string, string> }>();
  for (const folder of folders) {
    const file = Bun.file(join(root, "packages", folder, "package.json"));
    if (!(await file.exists())) continue;
    const manifest = await file.json();
    if (!manifest.private)
      manifests.set(manifest.name, { folder, dependencies: manifest.dependencies });
  }
  const ordered: string[] = [],
    visited = new Set<string>(),
    visiting = new Set<string>();
  const visit = (name: string): void => {
    if (visited.has(name)) return;
    if (visiting.has(name)) throw new Error("Cyclic publication graph");
    const manifest = manifests.get(name);
    if (!manifest) return;
    visiting.add(name);
    Object.keys(manifest.dependencies ?? {})
      .filter((dependency) => manifests.has(dependency))
      .forEach(visit);
    visiting.delete(name);
    visited.add(name);
    ordered.push(manifest.folder);
  };
  manifests.forEach((_manifest, name) => visit(name));
  const registryVersions = new Map<string, string[]>();
  for (const folder of ordered) {
    if (requested && !requested.includes(folder)) continue;
    const directory = join(root, "packages", folder),
      manifestPath = join(directory, "package.json");
    if (!(await Bun.file(manifestPath).exists())) continue;
    const source = await Bun.file(manifestPath).json();
    if (source.private) continue;
    const archive = join(out, folder + "-" + source.version + ".tgz");
    const packed = Bun.spawnSync(
      [process.execPath, "pm", "pack", "--ignore-scripts", "--filename", archive],
      {
        cwd: directory,
        env: { ...process.env, BUN_DEBUG_QUIET_LOGS: "1" },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    if (packed.exitCode !== 0) throw new Error("Packing failed: " + source.name);
    const bytes = new Uint8Array(await Bun.file(archive).arrayBuffer());
    const audit = auditArchive(bytes);
    const dependencies = [];
    for (const [name, rawRange] of Object.entries({
      ...audit.manifest.dependencies,
      ...audit.manifest.optionalDependencies,
      ...audit.manifest.peerDependencies,
    })) {
      let versions = registryVersions.get(name);
      if (!versions) {
        const metadata = await fetch("https://registry.npmjs.org/" + encodeURIComponent(name), {
          headers: { Accept: "application/vnd.npm.install-v1+json" },
          redirect: "error",
          signal: AbortSignal.timeout(20_000),
        });
        if (!metadata.ok && metadata.status !== 404)
          throw new Error("Dependency registry lookup failed " + name + " " + metadata.status);
        const body = metadata.ok ? await metadata.json() : null;
        versions = Object.keys(body?.versions ?? {});
        registryVersions.set(name, versions);
      }
      const range = String(rawRange);
      dependencies.push({
        name,
        range,
        publishedCompatibleVersion:
          versions.find((version) => Bun.semver.satisfies(version, range)) ?? null,
      });
    }
    const response = await fetch(
      "https://registry.npmjs.org/" + encodeURIComponent(source.name) + "/" + source.version,
      { redirect: "error", signal: AbortSignal.timeout(20_000) },
    );
    if (!response.ok && response.status !== 404)
      throw new Error("Registry lookup failed " + response.status);
    const result = {
      name: source.name,
      version: source.version,
      archive,
      sha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex"),
      registryStatus: response.status,
      dependencies,
      dependenciesReady: dependencies.every(
        (dependency) => dependency.publishedCompatibleVersion !== null,
      ),
      audit,
      published: false,
      uploadAccepted: false,
    };
    if (audit.issues.length)
      throw new Error("Archive audit failed " + source.name + ": " + JSON.stringify(audit.issues));
    if (publish && response.status === 404) {
      if (!result.dependenciesReady)
        throw new Error("Publication dependencies not available in registry: " + source.name);
      const child = Bun.spawnSync(
        [
          process.execPath,
          "publish",
          "--access",
          "public",
          "--registry",
          "https://registry.npmjs.org/",
          archive,
        ],
        {
          cwd: root,
          env: { ...process.env, BUN_DEBUG_QUIET_LOGS: "1" },
          stdout: "pipe",
          stderr: "pipe",
        },
      );
      await Bun.write(
        join(out, folder + "-publish.log"),
        new TextDecoder().decode(child.stdout) + new TextDecoder().decode(child.stderr),
      );
      if (child.exitCode !== 0)
        throw new Error("Publishing failed " + source.name + "; inspect private log");
      result.uploadAccepted = true;
      await Bun.write(
        join(out, folder + "-upload-receipt.json"),
        JSON.stringify(
          {
            generatedAt: new Date().toISOString(),
            name: result.name,
            version: result.version,
            sha256: result.sha256,
            uploadAccepted: true,
            published: false,
          },
          null,
          2,
        ),
      );
      const remote = await readPublishedVersion(source.name, source.version);
      if (remote.name !== source.name || remote.version !== source.version)
        throw new Error("Registry identity mismatch");
      if (remote.dist?.shasum !== new Bun.CryptoHasher("sha1").update(bytes).digest("hex"))
        throw new Error("Published archive digest mismatch");
      result.published = true;
      registryVersions.set(source.name, [
        ...(registryVersions.get(source.name) ?? []),
        source.version,
      ]);
    }
    results.push(result);
    await Bun.write(
      join(out, "pack-report.json"),
      JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2),
    );
    console.log(
      JSON.stringify({
        name: result.name,
        version: result.version,
        files: audit.files.length,
        bytes: audit.unpackedBytes,
        issues: audit.issues.length,
        published: result.published,
      }),
    );
  }
}
