// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "bun:test";
import {
  classifyMagikaAsset,
  generateArcSysWgslShader,
  resolveVfsMountOrder,
} from "../../../scripts/ops/ue-to-web-migrator";

describe("Unreal Engine to Web Full Migrator Tool", () => {
  it("classifies formats via Magika byte signatures and fallbacks", () => {
    // Pak magic (0x5A6F12E1)
    const pakMagic = new Uint8Array([0xe1, 0x12, 0x6f, 0x5a]);
    expect(classifyMagikaAsset(pakMagic, "archive.pak")).toBe("application/x-unreal-pak");

    // UAsset magic (0x9E2A83C1)
    const uassetMagic = new Uint8Array([0xc1, 0x83, 0x2a, 0x9e]);
    expect(classifyMagikaAsset(uassetMagic, "char.uasset")).toBe("application/x-unreal-uasset");

    // Windows PE (MZ)
    const peMagic = new Uint8Array([0x4d, 0x5a, 0x90, 0x00]);
    expect(classifyMagikaAsset(peMagic, "game.exe")).toBe(
      "application/vnd.microsoft.portable-executable",
    );

    // Ogg Vorbis
    const oggMagic = new Uint8Array([0x4f, 0x67, 0x67, 0x53]);
    expect(classifyMagikaAsset(oggMagic, "sound.ogg")).toBe("audio/ogg");

    // Extension fallback
    const emptyBuf = new Uint8Array([0, 0, 0, 0]);
    expect(classifyMagikaAsset(emptyBuf, "mesh.uexp")).toBe("application/x-unreal-uexp");
    expect(classifyMagikaAsset(emptyBuf, "video.mp4")).toBe("video/mp4");
  });

  it("generates ArcSys WGSL cel-shading shader with custom normal & ILM mapping", () => {
    const wgsl = generateArcSysWgslShader();

    expect(wgsl).toContain("@location(3) color: vec4<f32>");
    expect(wgsl).toContain("let weight = in.color.g * in.color.a * uniforms.outlineThickness;");
    expect(wgsl).toContain("textureSample(ilmTexture, ilmSampler, in.uv)");
    expect(wgsl).toContain("in.color.r * 0.2 - 0.1 + (ilm.g - 0.5) * 0.3");
    expect(wgsl).toContain("select(0.35, 1.0, biasedNdotL > 0.05)");
  });

  it("verifies VFS mount order where ~mods outranks base archives", () => {
    const archives = [
      "RED/Content/Paks/pakchunk1-WindowsNoEditor.pak",
      "RED/Content/Paks/~mods/costume_mod_P.pak",
      "RED/Content/Paks/pakchunk0-WindowsNoEditor.pak",
    ];

    const sorted = resolveVfsMountOrder(archives);

    // pakchunk0 comes first
    expect(sorted[0]).toBe("RED/Content/Paks/pakchunk0-WindowsNoEditor.pak");
    // pakchunk1 comes second
    expect(sorted[1]).toBe("RED/Content/Paks/pakchunk1-WindowsNoEditor.pak");
    // ~mods comes last (~ has ASCII 0x7E, taking precedence in VFS override lookups)
    expect(sorted[2]).toBe("RED/Content/Paks/~mods/costume_mod_P.pak");
  });
});
