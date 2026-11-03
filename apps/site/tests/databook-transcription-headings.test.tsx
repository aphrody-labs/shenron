import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { TranscriptionTexte } from "../src/components/databooks/TranscriptionTexte";

test("scan transcription headings remain below the book and reader headings without changing the source text", () => {
  const html = renderToStaticMarkup(
    <TranscriptionTexte
      texte={"# ドラゴンボール\n\n## Original subtitle\n\nOriginal text."}
      verifiee
    />,
  );
  expect(html).not.toContain("<h1");
  expect(html).toContain("<h3>ドラゴンボール</h3>");
  expect(html).toContain("<h4>Original subtitle</h4>");
  expect(html).toContain("Original text.");
});
