import { afterEach, describe, expect, mock, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseLogsResponse } from "../src/app/admin/logs/logs-view";

let query = { data: undefined as unknown, isLoading: false, isError: true, isFetching: false };
let options: { queryFn: (context: { signal: AbortSignal }) => Promise<unknown> };
mock.module("@tanstack/react-query", () => ({
  useQuery: (config: typeof options) => {
    options = config;
    return { ...query, refetch() {} };
  },
}));
mock.module("next-intl", () => ({ useTranslations: () => (key: string) => `adminLogs.${key}` }));
let receivedSignal: AbortSignal | undefined;
mock.module("@/lib/admin-api", () => ({
  api: {
    get: async (_path: string, opts: { signal: AbortSignal }) => {
      receivedSignal = opts.signal;
      return { logs: [], count: 0, source: "process" };
    },
  },
}));
const { default: Logs } = await import("../src/app/admin/logs/page");
afterEach(() => {
  query = { data: undefined, isLoading: false, isError: true, isFetching: false };
});

describe("admin process logs", () => {
  test("accepts process entries and refuses malformed upstream data", () => {
    expect(
      parseLogsResponse({
        logs: [{ time: "12:00", message: "Ready" }],
        count: 1,
        source: "process",
      }).logs,
    ).toHaveLength(1);
    expect(() => parseLogsResponse({ logs: "invalid", count: 1 })).toThrow();
    expect(() => parseLogsResponse({ logs: [{ raw: 42 }], count: 1 })).toThrow();
  });

  test("reports failed reads instead of displaying an empty journal", () => {
    const html = renderToStaticMarkup(createElement(Logs));
    expect(html).toContain('role="alert"');
    expect(html).toContain("adminLogs.error");
    expect(html).not.toContain("adminLogs.empty");
    expect(html).toContain("adminLogs.refresh");
  });

  test("forwards query cancellation and preserves an actual empty journal", async () => {
    query = { data: { logs: [], count: 0 }, isLoading: false, isError: false, isFetching: false };
    const html = renderToStaticMarkup(createElement(Logs));
    expect(html).toContain("adminLogs.empty");
    const signal = new AbortController().signal;
    await options.queryFn({ signal });
    expect(receivedSignal).toBe(signal);
  });
});
