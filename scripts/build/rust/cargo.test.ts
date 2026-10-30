// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { cargoCommand } from "./cargo";

test("cargo runs directly, aliases and toolchain selection left to Cargo", () => {
  expect(cargoCommand(["lint"])).toEqual(["cargo", "lint"]);
  expect(cargoCommand(["+nightly", "ck", "-p", "one"])).toEqual([
    "cargo",
    "+nightly",
    "ck",
    "-p",
    "one",
  ]);
  expect(cargoCommand(["nextest", "--version"])).toEqual(["cargo", "nextest", "--version"]);
});
