// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Snippet } from "../src/components/manga/MangaDialogueSearch";

test("dialogue snippets render API highlights and retain the older bracket format", () => {
  for (const text of ["The <mark>KAMEHAMEHA</mark> wave", "The [KAMEHAMEHA] wave"]) {
    const html = renderToStaticMarkup(<Snippet text={text} />);
    expect(html).toMatch(/<mark[^>]*>KAMEHAMEHA<\/mark>/);
    expect(html).not.toContain("&lt;mark&gt;");
  }
});

test("source markup is escaped even inside highlighted text", () => {
  const html = renderToStaticMarkup(
    <Snippet text={'<img src=x onerror=alert(1)> <mark><script>alert(1)</script></mark>'} />,
  );
  expect(html).toContain("&lt;img");
  expect(html).toContain("&lt;script&gt;");
  expect(html).not.toContain("<img");
  expect(html).not.toContain("<script>");
});
