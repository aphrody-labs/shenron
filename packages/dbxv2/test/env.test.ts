import { describe, expect, test } from "bun:test";
import {
  dbxv2DbPath,
  dbxv2Status,
  isDbxv2Enabled,
  normalizeServerUrl,
  parseRef,
  resourcePath,
} from "../src";

const OK = { DBXV2_SERVER_URL: "http://10.200.77.1:8788/", DBXV2_TOKEN: "t".repeat(20) };

describe("isDbxv2Enabled", () => {
  test("disabled by default", () => {
    expect(isDbxv2Enabled({})).toBe(false);
    expect(dbxv2Status({})).toEqual({ enabled: false, reason: "missing-url" });
  });

  test("needs a valid URL and a long enough token", () => {
    expect(isDbxv2Enabled(OK)).toBe(true);
    expect(dbxv2Status({ ...OK, DBXV2_TOKEN: "short" })).toEqual({
      enabled: false,
      reason: "short-token",
    });
    expect(dbxv2Status({ DBXV2_SERVER_URL: OK.DBXV2_SERVER_URL })).toEqual({
      enabled: false,
      reason: "missing-token",
    });
    expect(dbxv2Status({ ...OK, DBXV2_SERVER_URL: "http://0.0.0.0:1" })).toEqual({
      enabled: false,
      reason: "invalid-url",
    });
  });

  test("private credentials stay out of public renders and builds, but work in production", () => {
    expect(isDbxv2Enabled({ ...OK, SHENRON_PROFILE: "public" })).toBe(false);
    expect(isDbxv2Enabled({ ...OK, SHENRON_PUBLIC_RENDER: "1" })).toBe(false);
    expect(isDbxv2Enabled({ ...OK, SHENRON_PUBLIC_BUILD: "true" })).toBe(false);
    expect(isDbxv2Enabled({ ...OK, NODE_ENV: "production" })).toBe(true);
    expect(isDbxv2Enabled({ ...OK, NODE_ENV: "development" })).toBe(true);
  });

  test("the config is normalized", () => {
    const status = dbxv2Status(OK);
    expect(status.enabled && status.config.baseUrl).toBe("http://10.200.77.1:8788");
    expect(normalizeServerUrl("http://u:p@host")).toBeNull();
  });

  test("the database path follows the same gate", () => {
    expect(dbxv2DbPath({})).toBeNull();
    expect(dbxv2DbPath({ DBXV2_DB_PATH: " /x/y.sqlite " })).toBe("/x/y.sqlite");
    expect(dbxv2DbPath({ DBXV2_DB_PATH: "/x", SHENRON_PROFILE: "public" })).toBeNull();
  });
});

describe("references", () => {
  test("parse and encode", () => {
    expect(parseRef("CHARA/a b/c.emb")).toEqual({ cpk: "CHARA", path: "a b/c.emb" });
    expect(resourcePath("png", "CHARA/a b/c.emb")).toBe("/cpk/CHARA/png/a%20b/c.emb");
    expect(resourcePath("model.glb", "CHARA/x.emd")).toBe("/cpk/CHARA/model/x.emd.glb");
    expect(() => parseRef("bad name/x")).toThrow();
    expect(() => parseRef("CHARA//x")).toThrow();
    expect(() => parseRef("CHARA/../x")).toThrow();
  });
});
