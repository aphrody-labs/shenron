// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { msvcCrossConfig } from "./msvc-cross.ts";

test("cross-build CFLAGS preserve caller flags and enable libwebp SIMD", () => {
  const args = msvcCrossConfig(' -O2 -DNAME="two words" ');
  const value = Bun.TOML.parse(args[1]!) as {
    env: { CFLAGS: { value: string } };
  };
  expect(value.env.CFLAGS.value).toBe('-O2 -DNAME="two words" -msse4.1');
  expect(args[3]).toBe("env.CFLAGS.force=true");
  expect(msvcCrossConfig()[1]).toBe('env.CFLAGS.value="-msse4.1"');
});
