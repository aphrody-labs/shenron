// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { openAphrodyPython, type PythonOwner, type PythonSession } from "../../src/runtime/python";

function fixture(options: { wrongPid?: boolean; delayedClose?: Promise<void> } = {}) {
  const calls: Record<string, unknown>[] = [];
  let opened = 0;
  let closed = 0;
  const py: PythonSession = {
    exec: async () => {},
    evalJSON: async <T>(expression: string) =>
      (expression === "os.getpid()"
        ? options.wrongPid
          ? -1
          : process.pid
        : "qualified-installed-sdk/aphrody/__init__.py") as T,
    version: async () => "3.12.15",
    call: async (_module, _name, encoded) => {
      const request = JSON.parse(encoded!);
      calls.push(request);
      if (request.operation === "close") {
        await options.delayedClose;
        return JSON.stringify({ ok: true, value: { failures: 0 } });
      }
      return JSON.stringify({ ok: true, value: request.retain ? { handle: "owned-object" } : 42 });
    },
    close: async () => {
      closed++;
    },
  };
  const owner: PythonOwner = {
    Python: {
      async: async () => {
        opened++;
        return py;
      },
    },
    pythonHostLibraryPath: () => "qualified-host-library",
    buvLibpython: () => "qualified-cpython",
  };
  const loadOwner = async () => owner;
  return { loadOwner, calls, counts: () => ({ opened, closed }) };
}

test("one lazy interpreter is shared until all leases close, and public calls preserve structured args", async () => {
  const host = fixture();
  expect(host.counts()).toEqual({ opened: 0, closed: 0 });
  const [first, second] = await Promise.all([
    openAphrodyPython({ loadOwner: host.loadOwner }),
    openAphrodyPython({ loadOwner: host.loadOwner }),
  ]);
  try {
    expect(host.counts().opened).toBe(1);
    expect(first.info()).toMatchObject({ pid: process.pid, nativeInProcess: true });
    expect(
      await first.invoke("aphrody.command_guard", "normalize_command", ["été🐍"], { flags: [] }),
    ).toBe(42);
    expect(host.calls[0]).toMatchObject({ args: ["été🐍"], kwargs: { flags: [] } });
    await first.close();
    expect(host.counts().closed).toBe(0);
    await expect(first.invoke("aphrody", "Something")).rejects.toThrow("closed");
    await second.read("aphrody", "__version__");
  } finally {
    await first.close();
    await second.close();
  }
  expect(host.counts().closed).toBe(1);
});

test("foreign modules/configurations and out-of-process Python are rejected with cleanup", async () => {
  const wrong = fixture({ wrongPid: true });
  await expect(openAphrodyPython({ loadOwner: wrong.loadOwner })).rejects.toThrow(
    "Shenron Bun process",
  );
  expect(wrong.counts()).toEqual({ opened: 1, closed: 1 });
  const host = fixture();
  await using sdk = await openAphrodyPython({ loadOwner: host.loadOwner });
  expect(() => sdk.invoke("os", "system", ["invalid"])).toThrow();
  expect(() => sdk.invoke("aphrody", "__getattribute__")).toThrow();
  await expect(openAphrodyPython({ loadOwner: fixture().loadOwner })).rejects.toThrow("different");
  await expect(sdk.invoke("aphrody", "Something", [NaN])).rejects.toThrow("finite");
});

test("native object ownership carries arguments and explicitly releases resources", async () => {
  const host = fixture();
  await using sdk = await openAphrodyPython({ loadOwner: host.loadOwner });
  const object = await sdk.construct("aphrody", "AphrodyClient", [], {
    base_url: "https://dragonballfr.com",
  });
  await sdk.invoke("aphrody", "Something", [object]);
  expect(host.calls.at(-1)?.args).toEqual([{ $shenronObject: "owned-object" }]);
  await object.close();
  expect(host.calls.at(-1)?.operation).toBe("release");
  await expect(sdk.invoke("aphrody", "Something", [object])).rejects.toThrow("closed");
});

test("acquisition during final cleanup waits rather than attaching to a closing interpreter", async () => {
  let finish!: () => void;
  const host = fixture({
    delayedClose: new Promise<void>((resolve) => {
      finish = resolve;
    }),
  });
  const first = await openAphrodyPython({ loadOwner: host.loadOwner });
  const closing = first.close();
  const next = openAphrodyPython({ loadOwner: host.loadOwner });
  expect(host.counts().opened).toBe(1);
  finish();
  await closing;
  const second = await next;
  expect(host.counts().opened).toBe(2);
  await second.close();
});

test("bounded queued work drains before native host release", async () => {
  let finish!: () => void;
  const gate = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const host = fixture();
  const owner = await host.loadOwner();
  const py = await owner.Python.async();
  const original = py.call;
  py.call = async (...args) => {
    await gate;
    return original(...args);
  };
  owner.Python.async = async () => py;
  const loadOwner = async () => owner;
  const sdk = await openAphrodyPython({ loadOwner });
  const queued = Array.from({ length: 64 }, () => sdk.invoke("aphrody", "Something"));
  await expect(sdk.invoke("aphrody", "Something")).rejects.toThrow("saturated");
  const closing = sdk.close();
  expect(host.counts().closed).toBe(0);
  finish();
  expect(await Promise.all(queued)).toHaveLength(64);
  await closing;
  expect(host.counts().closed).toBe(1);
  expect(host.calls.at(-1)?.operation).toBe("close");
});
