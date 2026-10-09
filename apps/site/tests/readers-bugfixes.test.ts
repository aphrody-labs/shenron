// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "bun:test";
import { colorisationDemandee } from "../src/lib/manga-editions";

describe("colorisationDemandee", () => {
  it("accepts both the published 'couleur' links and the reader's 'color'", () => {
    expect(colorisationDemandee("couleur")).toBe("couleur");
    expect(colorisationDemandee("color")).toBe("couleur");
    expect(colorisationDemandee("nb")).toBe("nb");
  });

  it("returns null for a missing or unknown value", () => {
    expect(colorisationDemandee(null)).toBeNull();
    expect(colorisationDemandee(undefined)).toBeNull();
    expect(colorisationDemandee("unknown")).toBeNull();
  });
});
