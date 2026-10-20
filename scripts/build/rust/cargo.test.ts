// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { cargoCommand, expandCargoAliases } from "./cargo";

const serial = { APHRODY_CARGO_SERIAL: "/factory/cargo-serial.sh" };

test("workspace build aliases reach the serialized wrapper as concrete commands", () => {
  for (const [alias, command] of Object.entries({
    ck: "check",
    lint: "clippy",
    t: "nextest",
    koharu: "clippy",
    "koharu-test": "nextest",
    wasm: "check",
    docs: "doc",
  })) {
    expect(cargoCommand([alias], serial).slice(0, 2)).toEqual([
      "/factory/cargo-serial.sh",
      command,
    ]);
  }
  expect(cargoCommand(["lint", "--locked"], serial)).toEqual([
    "/factory/cargo-serial.sh",
    "clippy",
    "--workspace",
    "--all-targets",
    "--",
    "-D",
    "warnings",
    "--locked",
  ]);
});

test("toolchain selection and explicit commands keep their argument boundaries", () => {
  expect(cargoCommand(["+nightly", "ck", "-p", "one"], serial)).toEqual([
    "/factory/cargo-serial.sh",
    "+nightly",
    "check",
    "--workspace",
    "--all-targets",
    "-p",
    "one",
  ]);
  expect(cargoCommand(["nextest", "--version"], serial)).toEqual([
    "/factory/cargo-serial.sh",
    "nextest",
    "--version",
  ]);
  expect(cargoCommand(["lint"], {})).toEqual(["cargo", "lint"]);
});

test("nested aliases resolve and unsafe aliases fail before spawning", () => {
  expect(
    expandCargoAliases(["a", "argument"], { a: "b --locked", b: ["check", "--workspace"] }),
  ).toEqual(["check", "--workspace", "--locked", "argument"]);
  for (const aliases of [
    { a: "a" },
    { a: "!cargo check" },
    { a: 'check "two words"' },
    { a: "" },
  ]) {
    expect(() => expandCargoAliases(["a"], aliases)).toThrow();
  }
});
