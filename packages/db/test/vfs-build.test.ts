// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "bun:test";
import { readOnlyConnectionUrl } from "../src/vfs/build";

describe("VFS PostgreSQL source connections", () => {
  it("forces each transaction read-only while preserving URL options", () => {
    const value = new URL(
      readOnlyConnectionUrl("postgres://reader@db.example.test:5432/shenron?sslmode=require"),
    );

    expect(value.searchParams.get("sslmode")).toBe("require");
    expect(value.searchParams.get("options")).toBe("-c default_transaction_read_only=on");
  });

  it("appends the read-only guard after existing PostgreSQL options", () => {
    const value = new URL(
      readOnlyConnectionUrl(
        "postgres://reader@db.example.test:5432/shenron?options=-c%20statement_timeout%3D5s",
      ),
    );

    expect(value.searchParams.get("options")).toBe(
      "-c statement_timeout=5s -c default_transaction_read_only=on",
    );
  });
});
