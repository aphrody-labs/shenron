// SPDX-License-Identifier: Apache-2.0
import { expect, test, describe } from "bun:test";
import {
  initReTelemetryDb,
  saveReTelemetry,
  getReTelemetry,
  listReTelemetry,
} from "../src/re-telemetry";

describe("RE Telemetry SQLite Persistence Engine", () => {
  test("creates in-memory database and saves binary telemetry record", async () => {
    const db = initReTelemetryDb(":memory:");

    const sample = {
      game_slug: "fighterz",
      binary_name: "RED-Win64-Shipping.exe",
      binary_path:
        "C:\\Program Files (x86)\\Steam\\steamapps\\common\\DRAGON BALL FighterZ\\RED\\Binaries\\Win64\\RED-Win64-Shipping.exe",
      architecture: "x64" as const,
      format: "PE (Protected/Overlay)",
      entry_point: "0xB762000",
      sections: [
        { name: ".data1", virtual_address: 4096, size: 45618688 },
        { name: ".edata", virtual_address: 45625344, size: 13352960 },
      ],
      exports_count: 0,
      imports_count: 0,
      paks: [
        { name: "pakchunk0-WindowsNoEditor.pak", size: 5414923132, version: 4, encrypted: true },
      ],
    };

    await saveReTelemetry(db, sample);

    const fetched = getReTelemetry(db, "fighterz", "RED-Win64-Shipping.exe");
    expect(fetched).not.toBeNull();
    expect(fetched?.game_slug).toBe("fighterz");
    expect(fetched?.entry_point).toBe("0xB762000");
    expect(fetched?.sections.length).toBe(2);
    expect(fetched?.paks?.[0].encrypted).toBeTrue();

    const list = listReTelemetry(db, "fighterz");
    expect(list.length).toBe(1);
    expect(list[0].binary_name).toBe("RED-Win64-Shipping.exe");
  });
});
