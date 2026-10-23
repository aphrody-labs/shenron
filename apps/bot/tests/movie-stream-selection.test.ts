import { expect, test } from "bun:test";
import { movieStreamCandidates } from "../src/api/movie-stream-selection";

const row = {
  video_url: "https://media.example/unknown.mp4",
  stream_url: "https://media.example/unknown.m3u8",
  players: JSON.stringify([
    { provider: "archive", embedUrl: "https://archive.org/embed/french", lang: "vf" },
    { provider: "direct", embedUrl: "https://media.example/japanese.mp4", lang: "vostfr" },
    { provider: "direct", embedUrl: "https://media.example/untagged.mp4" },
  ]),
};

test("explicit Japanese audio never falls back to French or an untagged stored stream", () => {
  const result = movieStreamCandidates(row, "vostfr");
  expect(result.stored).toBeNull();
  expect(result.players.map((player) => player.embedUrl)).toEqual([
    "https://media.example/japanese.mp4",
  ]);
  expect(movieStreamCandidates({ ...row, players: "[]" }, "vostfr").players).toEqual([]);
});

test("explicit French audio keeps only French candidates", () => {
  expect(movieStreamCandidates(row, "vf").players.map((player) => player.lang)).toEqual(["vf"]);
  expect(movieStreamCandidates(row, "vf").stored).toBeNull();
});

test("unversioned requests preserve stored priority and all valid providers", () => {
  expect(movieStreamCandidates(row).stored).toBe(row.video_url);
  expect(movieStreamCandidates({ ...row, video_url: null }).stored).toBe(row.stream_url);
  expect(movieStreamCandidates(row).players).toHaveLength(3);
});

test("malformed metadata never acquires a language", () => {
  for (const players of ["invalid", "null", "{}", '[null,1,{}, {"embedUrl":false}]']) {
    expect(movieStreamCandidates({ players }, "vostfr")).toEqual({ stored: null, players: [] });
  }
});
