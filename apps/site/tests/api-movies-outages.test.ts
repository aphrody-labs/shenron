import { expect, mock, spyOn, test } from "bun:test";

let readMovies: () => Promise<unknown> = async () => null;
mock.module("@/lib/db-universe", () => ({
  dbUniverse: { movies: () => readMovies() },
}));
mock.module("@/lib/assets", () => ({ assetUrl: (path: string) => path }));

const { GET } = await import("../src/app/api/movies/route");
const request = () => new Request("https://dragonballfr.com/api/movies");

test("database outage is non-cacheable and does not become an empty catalogue", async () => {
  readMovies = async () => null;
  const response = await GET(request());

  expect(response.status).toBe(503);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(response.headers.get("Retry-After")).toBe("30");
  expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  expect(await response.json()).toEqual({
    error: "Le catalogue des films est momentanément indisponible.",
  });
});

test("unexpected read failures return the same safe outage response", async () => {
  readMovies = async () => {
    throw new Error("private database detail");
  };
  const log = spyOn(console, "error").mockImplementation(() => {});
  try {
    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body.detail).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("private database detail");
  } finally {
    log.mockRestore();
  }
});
