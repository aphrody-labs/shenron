// SPDX-License-Identifier: Apache-2.0
/** One lazy native CPython owner for all Shenron consumers; the SDK remains in Aphrody. */
import { existsSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

export type PythonJson =
  | null
  | boolean
  | number
  | string
  | PythonJson[]
  | { [key: string]: PythonJson };
export type PythonArgument =
  | null
  | boolean
  | number
  | string
  | AphrodyPythonObject
  | PythonArgument[]
  | { [key: string]: PythonArgument };
export interface PythonSession {
  exec(code: string): Promise<void>;
  evalJSON<T = unknown>(expression: string): Promise<T>;
  call(module: string, fn: string, arg?: string): Promise<string>;
  version(): Promise<string>;
  close(): Promise<void>;
}
export interface PythonOwner {
  Python: {
    async(options?: { libraryPath?: string; libpython?: string | null }): Promise<PythonSession>;
  };
  pythonHostLibraryPath(): string;
  buvLibpython(): string | null;
}
export interface AphrodyPythonOptions {
  /** Selected source roots or qualified installed packages, never copied providers or stores. */
  sourceRoots?: readonly string[];
  libraryPath?: string;
  libpython?: string | null;
  /** Explicit qualified venv; Buv owns discovery/acquisition. This module never runs UV. */
  virtualEnv?: string;
  /** Test/qualified embedder boundary; production defaults to the fork builtin. */
  loadOwner?: () => Promise<PythonOwner>;
}
interface State {
  py: PythonSession;
  metadata: {
    pid: number;
    python: string;
    sdkPath: string;
    hostLibrary: string;
    libpython: string | null;
    nativeInProcess: true;
  };
  pending: number;
}
interface Entry {
  key: string;
  loadOwner?: AphrodyPythonOptions["loadOwner"];
  state: Promise<State>;
  leases: number;
  closing?: Promise<void>;
}
let active: Entry | undefined;
const BUILTIN = "bun:python";
const DISPATCH = "_shenron_python_sdk_dispatch_v1";
const BOOTSTRAP = `
import asyncio as _ss_asyncio, importlib as _ss_importlib, inspect as _ss_inspect
import json as _ss_json, uuid as _ss_uuid, dataclasses as _ss_dataclasses
_ss_objects = {}
def _ss_argument(value):
    if isinstance(value, dict):
        if list(value) == ['$shenronObject']:
            return _ss_objects[value['$shenronObject']]
        return {key: _ss_argument(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_ss_argument(item) for item in value]
    return value
def _shenron_python_sdk_dispatch_v1(encoded):
    request = _ss_json.loads(encoded)
    try:
        operation = request['operation']
        if operation == 'exports':
            value = list(getattr(_ss_importlib.import_module('aphrody'), '__all__', []))
        elif operation == 'release':
            obj = _ss_objects.pop(request['handle'], None)
            close = getattr(obj, 'aclose', None) or getattr(obj, 'close', None)
            value = close() if callable(close) else None
        elif operation == 'close':
            failures = 0
            for handle in list(_ss_objects):
                response = _ss_json.loads(_shenron_python_sdk_dispatch_v1(_ss_json.dumps({'operation':'release','handle':handle})))
                failures += not response['ok']
            value = {'released': not _ss_objects, 'failures': failures}
        else:
            target = _ss_objects[request['handle']] if 'handle' in request else _ss_importlib.import_module(request['module'])
            value = getattr(target, request['name'])
            if operation == 'invoke':
                value = value(*_ss_argument(request.get('args', [])), **_ss_argument(request.get('kwargs', {})))
        if _ss_inspect.isawaitable(value):
            value = _ss_asyncio.run(value)
        if request.get('retain', False):
            handle = _ss_uuid.uuid4().hex
            _ss_objects[handle] = value
            value = {'handle': handle}
        if _ss_dataclasses.is_dataclass(value) and not isinstance(value, type):
            value = _ss_dataclasses.asdict(value)
        encoded = _ss_json.dumps({'ok': True, 'value': value}, ensure_ascii=False, allow_nan=False)
        if len(encoded.encode('utf-8')) > 1024 * 1024:
            raise ValueError('SDK result exceeds boundary')
        return encoded
    except Exception as error:
        return _ss_json.dumps({'ok': False, 'error': type(error).__name__})
`;

function moduleName(name: string) {
  if (
    !/^(aphrody|aphrody_train|aphrody_cli|aphrody_embedding_fixtures)(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(
      name,
    )
  )
    throw new TypeError("Select an Aphrody SDK module explicitly");
}
function publicName(name: string) {
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name) && name !== "__version__")
    throw new TypeError("Select a public SDK member");
}
function configuration(options: AphrodyPythonOptions) {
  const roots = options.sourceRoots ?? [];
  if (roots.length > 32) throw new Error("Too many Python source roots");
  for (const root of roots) {
    if (!isAbsolute(root) || !existsSync(root) || !statSync(root).isDirectory())
      throw new Error("Selected Python source root is unavailable");
  }
  for (const path of [options.libraryPath, options.libpython, options.virtualEnv])
    if (path && (!isAbsolute(path) || !existsSync(path)))
      throw new Error("Selected native Python artifact is unavailable");
  return {
    roots: roots.map((root) => resolve(root)),
    libraryPath: options.libraryPath,
    libpython: options.libpython,
    virtualEnv: options.virtualEnv,
  };
}
async function initialize(options: AphrodyPythonOptions): Promise<State> {
  const config = configuration(options);
  const owner = await (options.loadOwner?.() ?? import(BUILTIN));
  if (!owner.Python?.async || !owner.pythonHostLibraryPath || !owner.buvLibpython)
    throw new Error("The selected Bun fork does not expose the qualified Python ABI");
  const hostLibrary = config.libraryPath ?? owner.pythonHostLibraryPath();
  const libpython = config.libpython === undefined ? owner.buvLibpython() : config.libpython;
  const py: PythonSession = await owner.Python.async({ libraryPath: hostLibrary, libpython });
  try {
    await py.exec(`import os, sys\nsys.path[:0] = ${JSON.stringify(config.roots)}`);
    if (config.virtualEnv) {
      const sitePackages =
        process.platform === "win32"
          ? join(config.virtualEnv, "Lib", "site-packages")
          : join(
              config.virtualEnv,
              "lib",
              `python${await py.evalJSON<string>("str(sys.version_info.major) + '.' + str(sys.version_info.minor)")}`,
              "site-packages",
            );
      if (!existsSync(sitePackages))
        throw new Error("Qualified Python virtualenv site-packages are unavailable");
      await py.exec(`import site\nsite.addsitedir(${JSON.stringify(sitePackages)})`);
    }
    const pid = await py.evalJSON<number>("os.getpid()");
    if (pid !== process.pid) throw new Error("SDK Python must execute in the Shenron Bun process");
    // The SDK root exposes lazy public exports; optional modules load only on explicit invocation.
    await py.exec("import aphrody");
    const sdkPath = await py.evalJSON<string>("str(aphrody.__file__)");
    if (
      config.roots.length &&
      !config.roots.some((root) => {
        const local = relative(root, sdkPath);
        return local && !local.startsWith("..") && !isAbsolute(local);
      })
    )
      throw new Error("Loaded Aphrody SDK differs from the selected source roots");
    await py.exec(BOOTSTRAP);
    return {
      py,
      metadata: {
        pid,
        python: await py.version(),
        sdkPath,
        hostLibrary,
        libpython,
        nativeInProcess: true,
      },
      pending: 0,
    };
  } catch (error) {
    await py.close();
    throw error;
  }
}

export class AphrodyPythonSdk implements AsyncDisposable {
  private closed = false;
  constructor(
    private readonly state: State,
    private readonly release: () => Promise<void>,
  ) {}
  info() {
    return { ...this.state.metadata };
  }
  private async dispatch(request: Record<string, unknown>): Promise<PythonJson> {
    if (this.closed) throw new Error("The Python SDK lease is closed");
    if (this.state.pending >= 64) throw new Error("The Python SDK queue is saturated");
    const payload = JSON.stringify(request, (_key, value) => {
      if (value instanceof AphrodyPythonObject) return value.argument(this.state);
      if (typeof value === "number" && !Number.isFinite(value))
        throw new TypeError("SDK numeric arguments must be finite");
      return value;
    });
    if (Buffer.byteLength(payload) > 1024 * 1024) throw new Error("SDK request exceeds boundary");
    this.state.pending++;
    try {
      const receipt = JSON.parse(await this.state.py.call("__main__", DISPATCH, payload));
      if (!receipt || receipt.ok !== true)
        throw new Error(`Aphrody SDK invocation failed (${receipt?.error ?? "invalid-receipt"})`);
      return receipt.value as PythonJson;
    } finally {
      this.state.pending--;
    }
  }
  exports() {
    return this.dispatch({ operation: "exports" }) as Promise<string[]>;
  }
  read(module: string, name: string) {
    moduleName(module);
    publicName(name);
    return this.dispatch({ operation: "read", module, name });
  }
  invoke(
    module: string,
    name: string,
    args: PythonArgument[] = [],
    kwargs: Record<string, PythonArgument> = {},
  ) {
    moduleName(module);
    publicName(name);
    return this.dispatch({ operation: "invoke", module, name, args, kwargs });
  }
  async construct(
    module: string,
    name: string,
    args: PythonArgument[] = [],
    kwargs: Record<string, PythonArgument> = {},
  ) {
    moduleName(module);
    publicName(name);
    const result = (await this.dispatch({
      operation: "invoke",
      module,
      name,
      args,
      kwargs,
      retain: true,
    })) as { handle: string };
    return new AphrodyPythonObject(result.handle, this.state, (request) => this.dispatch(request));
  }
  async close() {
    if (this.closed) return;
    this.closed = true;
    await this.release();
  }
  [Symbol.asyncDispose]() {
    return this.close();
  }
}
export class AphrodyPythonObject implements AsyncDisposable {
  private closed = false;
  constructor(
    private readonly handle: string,
    private readonly state: State,
    private readonly dispatch: (request: Record<string, unknown>) => Promise<PythonJson>,
  ) {}
  argument(state: State) {
    if (this.closed || state !== this.state)
      throw new Error("SDK object belongs to a closed or different Python owner");
    return { $shenronObject: this.handle };
  }
  call(name: string, args: PythonArgument[] = [], kwargs: Record<string, PythonArgument> = {}) {
    if (this.closed) throw new Error("The Python object is closed");
    publicName(name);
    return this.dispatch({ operation: "invoke", handle: this.handle, name, args, kwargs });
  }
  async retain(
    name: string,
    args: PythonArgument[] = [],
    kwargs: Record<string, PythonArgument> = {},
  ) {
    if (this.closed) throw new Error("The Python object is closed");
    publicName(name);
    const result = (await this.dispatch({
      operation: "invoke",
      handle: this.handle,
      name,
      args,
      kwargs,
      retain: true,
    })) as { handle: string };
    return new AphrodyPythonObject(result.handle, this.state, this.dispatch);
  }
  async close() {
    if (this.closed) return;
    await this.dispatch({ operation: "release", handle: this.handle });
    this.closed = true;
  }
  [Symbol.asyncDispose]() {
    return this.close();
  }
}

/** All packages acquire this owner rather than starting independent interpreters. */
export async function openAphrodyPython(
  options: AphrodyPythonOptions = {},
): Promise<AphrodyPythonSdk> {
  if (active?.closing) {
    await active.closing;
    return openAphrodyPython(options);
  }
  const key = JSON.stringify(configuration(options));
  if (active && (active.key !== key || active.loadOwner !== options.loadOwner))
    throw new Error("The Python SDK already owns a different native runtime configuration");
  const entry = (active ??= {
    key,
    loadOwner: options.loadOwner,
    state: initialize(options),
    leases: 0,
  });
  entry.leases++;
  let state: State;
  try {
    state = await entry.state;
  } catch (error) {
    if (--entry.leases === 0) active = undefined;
    throw error;
  }
  return new AphrodyPythonSdk(state, async () => {
    if (--entry.leases > 0) return;
    const closing = (async () => {
      try {
        // Queued work precedes cleanup in the fork's FIFO worker queue.
        const receipt = JSON.parse(
          await state.py.call("__main__", DISPATCH, JSON.stringify({ operation: "close" })),
        );
        if (!receipt.ok || receipt.value?.failures) throw new Error("SDK resource cleanup failed");
      } finally {
        await state.py.close();
        if (active === entry) active = undefined;
      }
    })();
    entry.closing = closing;
    await closing;
  });
}
