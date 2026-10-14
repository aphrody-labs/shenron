// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { mergeInterviewGallery } from "../src/lib/interview-gallery";
import type { ToriyamaSourceGroup, ToriyamaWord } from "../src/lib/toriyama-shared";

const word: ToriyamaWord = {
  id: "toriyama-quote",
  subject: "Creation",
  text: "Original statement",
  textFr: "Traduction revue",
  lang: "ja",
  source: "Printed interview, p. 3",
  year: 1995,
  document: "Toriyama interview",
  href: "/wiki/databooks/2",
};
const group: ToriyamaSourceGroup = {
  document: "Toriyama interview",
  documentKey: "toriyama",
  year: 1995,
  databookId: 2,
  kind: "interview",
  cover: null,
  words: [word],
};
function document(id: number, title: string, options: { kind?: string; visible?: boolean } = {}) {
  return {
    id,
    title,
    title_ja: null,
    kind: options.kind ?? "interview",
    visible: options.visible ?? true,
    published_at: Date.UTC(2018, 0, 1) / 1000,
    cover: `/wiki/interviews/${id}.png`,
  };
}

test("adds a visible Nozawa interview without inventing quotations or duplicating Toriyama", () => {
  const result = mergeInterviewGallery(
    [group],
    [document(2, "Toriyama interview"), document(9, "Nozawa and Yamaguchi")],
  );
  expect(result).toHaveLength(2);
  expect(result.find((entry) => entry.databookId === 2)?.words).toEqual([word]);
  expect(result.find((entry) => entry.databookId === 2)?.cover).toBe("/wiki/interviews/2.png");
  expect(result.find((entry) => entry.databookId === 9)).toMatchObject({
    document: "Nozawa and Yamaguchi",
    documentKey: "interview-9",
    year: 2018,
    words: [],
  });
  expect(group.cover).toBeNull();
  expect(group.words).toEqual([word]);
});

test("merges duplicate references by document identity while preserving the reviewed quote", () => {
  const extra = { ...word, id: "another-quote", text: "Second statement" };
  const result = mergeInterviewGallery(
    [group, { ...group, document: "Alternate title", words: [word, extra] }],
    [document(2, "Toriyama interview")],
  );
  expect(result).toHaveLength(1);
  expect(result[0]?.words).toEqual([word, extra]);
  expect(result[0]?.documentKey).toBe("toriyama");
  expect(group.words).toHaveLength(1);
});

test("only visible kind=interview catalogue documents expand the gallery", () => {
  const result = mergeInterviewGallery(
    [group],
    [
      document(3, "Hidden interview", { visible: false }),
      document(4, "Toriyama letter", { kind: "letter" }),
      document(5, "Databook mentioning interviews", { kind: "databook" }),
      document(6, "Untranscribed interview"),
    ],
  );
  expect(result.map((entry) => entry.databookId)).toEqual([2, 6]);
  expect(result[1]?.words).toEqual([]);
});

test("resolves an unlinked Japanese interview but keeps different catalogue identities distinct", () => {
  const original: ToriyamaSourceGroup = {
    ...group,
    document: "鳥山明 インタビュー",
    databookId: null,
    year: null,
  };
  const result = mergeInterviewGallery(
    [original],
    [
      { ...document(2, "Toriyama interview"), title_ja: "鳥山明 インタビュー" },
      document(7, "Toriyama interview"),
    ],
  );
  expect(result).toHaveLength(2);
  expect(result[0]?.databookId).toBe(2);
  expect(result[0]?.words[0]).toEqual(word);
  expect(result[1]?.databookId).toBe(7);
});

test("same-title editions with distinct canonical ids remain separate documents", () => {
  const result = mergeInterviewGallery(
    [group],
    [document(2, "Toriyama interview"), document(7, "Toriyama interview")],
  );
  expect(result.map((entry) => entry.databookId)).toEqual([2, 7]);
  expect(result[0]?.words).toEqual([word]);
  expect(result[1]?.words).toEqual([]);
});

test("normalizes width, surrounding spaces and case only for unlinked document identities", () => {
  const unresolved = { ...group, document: "  ＴＯＲＩＹＡＭＡ interview  ", databookId: null };
  const result = mergeInterviewGallery([unresolved], [document(2, "Toriyama interview")]);
  expect(result).toHaveLength(1);
  expect(result[0]?.databookId).toBe(2);
  expect(result[0]?.documentKey).toBe("toriyama");
  expect(result[0]?.words).toEqual([word]);
});
