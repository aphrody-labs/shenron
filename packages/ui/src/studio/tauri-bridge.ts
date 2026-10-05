// SPDX-License-Identifier: Apache-2.0
/**
 * Tauri host detection, command invocation and the file bridge of the Shenron studio screens.
 *
 * Files: native dialogs (`tauri-plugin-dialog`) and native reads/writes (`tauri-plugin-fs`)
 * inside the desktop app, the browser pickers everywhere else. Each native step falls back to
 * the browser when the plugin or its permission is missing, so a screen never dead-ends.
 * Module of class `pure`: browser globals are reached through `globalThis` and guarded.
 */
import { invoke } from "@aphrody/api/core";

export function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean(
      (window as unknown as { __TAURI__?: { core?: unknown } }).__TAURI__?.core ||
      (window as unknown as { __TAURI_INTERNALS__?: { invoke: unknown } }).__TAURI_INTERNALS__,
    )
  );
}

export async function tauriInvoke<T>(
  cmd: string,
  args: Record<string, unknown> = {},
): Promise<T | null> {
  if (!isTauri()) return null;
  const tauri = (
    window as unknown as {
      __TAURI__?: {
        core?: { invoke<R>(command: string, args?: Record<string, unknown>): Promise<R> };
      };
    }
  ).__TAURI__;
  if (tauri?.core) return tauri.core.invoke<T>(cmd, args);
  const internals = (
    window as unknown as {
      __TAURI_INTERNALS__?: { invoke: <R>(c: string, a: Record<string, unknown>) => Promise<R> };
    }
  ).__TAURI_INTERNALS__;
  return internals?.invoke ? internals.invoke<T>(cmd, args) : null;
}

export interface ShenronChatResponse {
  answer: string;
  mode: string;
  hits: Array<{
    title: string;
    url: string;
    snippet: string;
    score: number;
    kind: string;
    source_id?: string | null;
  }>;
}

/** Ask the public, grounded Shenron chat through the desktop host. */
export async function askShenron(query: string): Promise<ShenronChatResponse> {
  const result = await tauriInvoke<ShenronChatResponse>("aphrody_shenron_chat", { query });
  if (!result) throw new Error("L’assistant Shenron est disponible dans l’application de bureau.");
  return result;
}

// ── Files ───────────────────────────────────────────────────────────────────

export interface FileFilter {
  /** Label shown by the picker (« Images »). */
  name: string;
  /** Extensions without the dot (`png`, `jpg`). */
  extensions: readonly string[];
}

export interface OpenFileOptions {
  title?: string;
  filters?: readonly FileFilter[];
  multiple?: boolean;
  /** Pick a folder (native dialog; `webkitdirectory` in a browser). */
  directory?: boolean;
  defaultPath?: string;
}

export interface SaveFileOptions {
  title?: string;
  /** File name proposed to the user (`reponse-shenron.md`). */
  suggestedName: string;
  filters?: readonly FileFilter[];
  defaultPath?: string;
}

/** Outcome of a native dialog: absent (not Tauri, plugin or permission missing), dismissed, or a choice. */
export type DialogOutcome<T> =
  | { status: "unavailable" }
  | { status: "cancelled" }
  | { status: "picked"; value: T };

/** A chosen file: a native path (engine commands such as `koharu.importPaths`) or a browser `File`. */
export type PickedFile =
  | { source: "native"; name: string; path: string }
  | { source: "browser"; name: string; file: File };

export type SaveFileResult =
  | { status: "native"; path: string }
  | { status: "browser"; name: string }
  | { status: "cancelled" };

const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  avif: "image/avif",
  psd: "image/vnd.adobe.photoshop",
  json: "application/json",
  md: "text/markdown",
  txt: "text/plain",
  csv: "text/csv",
  zip: "application/zip",
  cbz: "application/vnd.comicbook+zip",
};

function baseName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

function nativeFilters(filters: readonly FileFilter[] | undefined) {
  return filters?.map((filter) => ({ name: filter.name, extensions: [...filter.extensions] }));
}

/** `accept` attribute of a file input: `.png,.jpg`. */
export function acceptAttribute(filters: readonly FileFilter[] | undefined): string {
  return (filters ?? []).flatMap((filter) => filter.extensions.map((ext) => `.${ext}`)).join(",");
}

/** `types` of `showOpenFilePicker`/`showSaveFilePicker` (one MIME key per extension). */
function pickerTypes(filters: readonly FileFilter[] | undefined) {
  return (filters ?? []).map((filter) => {
    const accept: Record<string, string[]> = {};
    for (const ext of filter.extensions) {
      const mime = MIME_BY_EXTENSION[ext.toLowerCase()] ?? "application/octet-stream";
      (accept[mime] ??= []).push(`.${ext}`);
    }
    return { description: filter.name, accept };
  });
}

/** Native open dialog (`plugin:dialog|open`). Never rejects. */
export async function nativeOpenDialog(
  options: OpenFileOptions = {},
): Promise<DialogOutcome<string[]>> {
  if (!isTauri()) return { status: "unavailable" };
  try {
    const picked = await invoke<string | string[] | null>("plugin:dialog|open", {
      options: {
        title: options.title,
        filters: nativeFilters(options.filters),
        multiple: options.multiple ?? false,
        directory: options.directory ?? false,
        defaultPath: options.defaultPath,
      },
    });
    if (picked === null || (Array.isArray(picked) && picked.length === 0)) {
      return { status: "cancelled" };
    }
    return { status: "picked", value: Array.isArray(picked) ? picked : [picked] };
  } catch {
    return { status: "unavailable" };
  }
}

/** Native save dialog (`plugin:dialog|save`). Never rejects. */
export async function nativeSaveDialog(options: SaveFileOptions): Promise<DialogOutcome<string>> {
  if (!isTauri()) return { status: "unavailable" };
  try {
    const path = await invoke<string | null>("plugin:dialog|save", {
      options: {
        title: options.title,
        filters: nativeFilters(options.filters),
        defaultPath: options.defaultPath ?? options.suggestedName,
      },
    });
    return path ? { status: "picked", value: path } : { status: "cancelled" };
  } catch {
    return { status: "unavailable" };
  }
}

type BrowserFileHandle = { name: string; getFile(): Promise<File> };
type BrowserWritable = { write(data: Blob): Promise<void>; close(): Promise<void> };
type BrowserSaveHandle = { name: string; createWritable(): Promise<BrowserWritable> };
type PickerHost = {
  showOpenFilePicker?: (options: unknown) => Promise<BrowserFileHandle[]>;
  showSaveFilePicker?: (options: unknown) => Promise<BrowserSaveHandle>;
};

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

/** Ephemeral `<input type="file">`: resolves `[]` when the user dismisses the picker. */
function inputPick(options: OpenFileOptions): Promise<File[]> {
  const doc = globalThis.document;
  if (!doc?.body) return Promise.resolve([]);
  return new Promise((resolve) => {
    const input = doc.createElement("input");
    input.type = "file";
    input.multiple = Boolean(options.multiple);
    if (options.directory) input.setAttribute("webkitdirectory", "");
    const accept = acceptAttribute(options.filters);
    if (accept) input.accept = accept;
    input.hidden = true;
    const done = (files: File[]) => {
      input.remove();
      resolve(files);
    };
    input.addEventListener("change", () => done(Array.from(input.files ?? [])), { once: true });
    input.addEventListener("cancel", () => done([]), { once: true });
    doc.body.append(input);
    input.click();
  });
}

/** Browser picker: File System Access API when present, a file input otherwise. */
export async function browserOpenFiles(options: OpenFileOptions = {}): Promise<File[]> {
  const host = globalThis as unknown as PickerHost;
  if (!options.directory && typeof host.showOpenFilePicker === "function") {
    try {
      const handles = await host.showOpenFilePicker({
        multiple: Boolean(options.multiple),
        types: pickerTypes(options.filters),
      });
      return await Promise.all(handles.map((handle) => handle.getFile()));
    } catch (error) {
      if (isAbort(error)) return [];
    }
  }
  return inputPick(options);
}

/**
 * Open files: native paths inside Tauri (the engine reads them itself), browser `File`s
 * elsewhere or when the dialog plugin is missing. `[]` when the user cancels.
 */
export async function openFiles(options: OpenFileOptions = {}): Promise<PickedFile[]> {
  const native = await nativeOpenDialog(options);
  if (native.status === "picked") {
    return native.value.map((path) => ({ source: "native", name: baseName(path), path }));
  }
  if (native.status === "cancelled") return [];
  const files = await browserOpenFiles(options);
  return files.map((file) => ({ source: "browser", name: file.name, file }));
}

function toBlob(data: Blob | string | Uint8Array, type?: string): Blob {
  if (data instanceof Blob) return data;
  return new Blob([data as BlobPart], type ? { type } : undefined);
}

/** Bytes of a picked file: `plugin:fs|read_file` for a native path, `File` contents otherwise. */
export async function readPickedFile(picked: PickedFile): Promise<Uint8Array> {
  if (picked.source === "browser") return new Uint8Array(await picked.file.arrayBuffer());
  const bytes = await invoke<ArrayBuffer | number[]>("plugin:fs|read_file", {
    path: picked.path,
    options: {},
  });
  return bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : Uint8Array.from(bytes);
}

/** Write through `plugin:fs|write_file` (raw body, path in the headers, as the fs plugin expects). */
async function nativeWrite(path: string, bytes: Uint8Array): Promise<boolean> {
  try {
    await invoke("plugin:fs|write_file", bytes, {
      headers: { path: encodeURIComponent(path), options: JSON.stringify({}) },
    });
    return true;
  } catch {
    return false;
  }
}

function downloadBlob(blob: Blob, name: string): boolean {
  const doc = globalThis.document;
  if (!doc?.body || typeof URL.createObjectURL !== "function") return false;
  const url = URL.createObjectURL(blob);
  const anchor = doc.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.hidden = true;
  doc.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return true;
}

/** Browser save: `showSaveFilePicker` when present, a `download` link otherwise. */
export async function browserSaveFile(
  blob: Blob,
  options: SaveFileOptions,
): Promise<SaveFileResult> {
  const host = globalThis as unknown as PickerHost;
  if (typeof host.showSaveFilePicker === "function") {
    try {
      const handle = await host.showSaveFilePicker({
        suggestedName: options.suggestedName,
        types: pickerTypes(options.filters),
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return { status: "browser", name: handle.name };
    } catch (error) {
      if (isAbort(error)) return { status: "cancelled" };
    }
  }
  return downloadBlob(blob, options.suggestedName)
    ? { status: "browser", name: options.suggestedName }
    : { status: "cancelled" };
}

/**
 * Save data: native save dialog and write inside Tauri, browser picker or download elsewhere
 * (and inside Tauri when the dialog or fs plugin is missing).
 */
export async function saveFile(
  data: Blob | string | Uint8Array,
  options: SaveFileOptions & { type?: string },
): Promise<SaveFileResult> {
  const blob = toBlob(data, options.type);
  const native = await nativeSaveDialog(options);
  if (native.status === "cancelled") return { status: "cancelled" };
  if (native.status === "picked") {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (await nativeWrite(native.value, bytes)) return { status: "native", path: native.value };
  }
  return browserSaveFile(blob, options);
}
