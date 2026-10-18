// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import * as catalogue from "../src/lib/episode-series-catalogue";

test("Beerus is a series: its landing page is not redirected to a single episode", () => {
  expect("DBS_BEERUS_REDIRECTS" in catalogue).toBe(false);
  expect(catalogue.DBS_BEERUS_SERIES_CODE).toBe("DBS_BEERUS");
  expect(catalogue.DBS_BEERUS_EPISODE_HREF).toBe("/wiki/episodes/875");
});
