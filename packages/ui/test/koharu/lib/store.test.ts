import { describe, expect, it } from "bun:test";

import {
  maxBrushDiameter,
  receiveDownload,
  useKoharuStore,
} from "@aphrody/shenron-ui/koharu/lib/store";

describe("editor state", () => {
  it("preserves the upstream brush range on large manga and databook pages", () => {
    expect(maxBrushDiameter({ width: 1024, height: 1536 })).toBe(128);
    expect(maxBrushDiameter({ width: 2048, height: 3072 })).toBe(128);
    expect(maxBrushDiameter({ width: 4096, height: 6144 })).toBe(256);
    expect(maxBrushDiameter({ width: 8192, height: 12288 })).toBe(512);
    expect(maxBrushDiameter({ width: Number.NaN, height: 100 })).toBe(128);
  });
  it("retains failed downloads until they are dismissed", () => {
    useKoharuStore.setState({ downloads: {} });
    receiveDownload({
      state: "failed",
      id: 9,
      name: "weights.bin",
      completed: 0,
      total: 0,
      error: "network unavailable",
    });
    expect(useKoharuStore.getState().downloads[9]).toMatchObject({
      state: "failed",
      name: "weights.bin",
    });

    useKoharuStore.getState().dismissDownload(9);
    expect(useKoharuStore.getState().downloads[9]).toBeUndefined();
  });

  it("defaults paint brush color to pure white (#FFFFFF)", () => {
    expect(useKoharuStore.getState().brush.color).toBe("#FFFFFF");
  });
});
