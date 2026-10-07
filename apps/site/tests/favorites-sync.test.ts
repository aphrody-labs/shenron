import { afterAll, beforeEach, expect, test } from "bun:test";

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalFetch = globalThis.fetch;
const storage = new Map<string, string>();
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
    dispatchEvent: () => true,
  },
});
beforeEach(() => storage.clear());
afterAll(() => {
  globalThis.fetch = originalFetch;
  if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
  else Reflect.deleteProperty(globalThis, "window");
});
const entry = (id: string) => ({
  kind: "chapter" as const,
  id,
  title: id,
  href: `/wiki/manga/${id}`,
  at: 1,
});
const client = async (name: string): Promise<typeof import("../src/lib/favorites")> =>
  import(`../src/lib/favorites.ts?fixture=${name}`);
const installFetch = (handler: (init?: RequestInit) => Promise<Response>) => {
  globalThis.fetch = Object.assign(
    (_input: Parameters<typeof fetch>[0], init?: RequestInit) => handler(init),
    { preconnect: originalFetch.preconnect },
  ) as typeof fetch;
};

test("a failed initial read can be retried and concurrent callers share one read", async () => {
  const favorites = await client("retry");
  let reads = 0;
  installFetch(async (init) => {
    if (init?.method === "PUT") return Response.json({ ok: true });
    reads++;
    await Bun.sleep(10);
    return Response.json({ favorites: [] }, { status: reads === 1 ? 503 : 200 });
  });
  try {
    await favorites.syncFavorites();
    // An invalid successful response must remain retryable too.
    installFetch(async (init) => {
      if (init?.method === "PUT") return Response.json({ ok: true });
      reads++;
      await Bun.sleep(10);
      return Response.json({ favorites: reads === 2 ? "invalid" : [] });
    });
    await favorites.syncFavorites();
    await Promise.all([favorites.syncFavorites(), favorites.syncFavorites()]);
    expect(reads).toBe(3);
  } finally {
    await Bun.sleep(850);
  }
});

test("an in-flight server read cannot resurrect a locally removed favorite", async () => {
  const favorites = await client("deletion");
  storage.set("dbfr_favorites_v1", JSON.stringify([entry("7")]));
  let resolve!: (response: Response) => void;
  const pending = new Promise<Response>((done) => {
    resolve = done;
  });
  installFetch(async (init) => (init?.method === "PUT" ? Response.json({ ok: true }) : pending));
  const sync = favorites.syncFavorites();
  try {
    favorites.toggleFavorite(entry("7"));
    resolve(Response.json({ favorites: [entry("7")] }));
    await sync;
    expect(favorites.readFavorites()).toEqual([]);
  } finally {
    resolve(Response.json({ favorites: [] }));
    await sync;
    await Bun.sleep(850);
  }
});

test("writes are serialized and the latest local snapshot follows a slow write", async () => {
  const favorites = await client("writes");
  let finish!: (response: Response) => void;
  let finishLatest!: (response: Response) => void;
  const first = new Promise<Response>((done) => {
    finish = done;
  });
  const latest = new Promise<Response>((done) => {
    finishLatest = done;
  });
  const writes: { favorites: { id: string }[] }[] = [];
  installFetch(async (init) => {
    if (init?.method !== "PUT") return Response.json({ favorites: [] });
    writes.push(JSON.parse(String(init.body)));
    return writes.length === 1 ? first : latest;
  });
  try {
    await favorites.syncFavorites();
    favorites.toggleFavorite(entry("7"));
    await Bun.sleep(850);
    expect(writes).toHaveLength(1);
    favorites.toggleFavorite(entry("7"));
    favorites.toggleFavorite(entry("8"));
    await Bun.sleep(850);
    expect(writes).toHaveLength(1);
    finish(Response.json({ ok: true }));
    await Bun.sleep(30);
    expect(writes).toHaveLength(2);
    expect(writes[1]!.favorites.map((favorite) => favorite.id)).toEqual(["8"]);
    expect(JSON.parse(storage.get("dbfr_favorites_removed_v1")!)).toEqual(["chapter:7"]);
    finishLatest(Response.json({ ok: true }));
    await Bun.sleep(30);
    expect(JSON.parse(storage.get("dbfr_favorites_removed_v1")!)).toEqual([]);
  } finally {
    finish(Response.json({ ok: true }));
    finishLatest(Response.json({ ok: true }));
    await Bun.sleep(850);
  }
});

test("a failed save preserves deletion intent across a page reload", async () => {
  const favorites = await client("failed-save");
  storage.set("dbfr_favorites_v1", JSON.stringify([entry("7")]));
  let writes = 0;
  installFetch(async (init) => {
    if (init?.method !== "PUT") return Response.json({ favorites: [entry("7")] });
    writes++;
    return Response.json({ ok: writes > 1 }, { status: writes === 1 ? 503 : 200 });
  });
  try {
    await favorites.syncFavorites();
    favorites.toggleFavorite(entry("7"));
    await Bun.sleep(850);
    expect(JSON.parse(storage.get("dbfr_favorites_removed_v1")!)).toEqual(["chapter:7"]);
    const reloaded = await client("reloaded");
    await reloaded.syncFavorites();
    expect(reloaded.readFavorites()).toEqual([]);
    await Bun.sleep(850);
    expect(writes).toBe(2);
    expect(JSON.parse(storage.get("dbfr_favorites_removed_v1")!)).toEqual([]);
  } finally {
    await Bun.sleep(850);
  }
});
