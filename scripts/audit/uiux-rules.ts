// SPDX-License-Identifier: Apache-2.0
//
// uiux-rules.ts — static UI/UX Pro Max rules applied to one server-rendered HTML document.
// Rule ids follow .claude/skills/ui-ux-pro-max/SKILL.md (accessibility, layout, performance, forms).
// The rendered checks (overflow, touch targets, focus) live in uiux-render.ts.

export type Severity = "critical" | "high" | "medium";
export type UiuxIssue = { rule: string; severity: Severity; detail: string };

const SEVERITY: Record<string, Severity> = {
  "lang-attr": "critical",
  "viewport-meta": "critical",
  "zoom-disabled": "critical",
  "page-title": "high",
  "heading-h1": "high",
  "heading-hierarchy": "critical",
  "alt-text": "critical",
  "aria-labels": "critical",
  "form-labels": "critical",
  "landmark-main": "high",
  "skip-links": "medium",
  "tabindex-positive": "high",
  "image-dimensions": "high",
  "focus-states": "critical",
};

const issue = (rule: string, detail: string): UiuxIssue => ({
  rule,
  severity: SEVERITY[rule] ?? "medium",
  detail,
});

export async function auditHtml(html: string): Promise<UiuxIssue[]> {
  const issues: UiuxIssue[] = [];
  let hasLang = false;
  let viewport: string | null = null;
  let title = "";
  let inTitle = false;
  let hasMain = false;
  let skipLink = false;
  let linkIndex = 0;
  const headings: number[] = [];
  const counts = { missingAlt: 0, unsized: 0, unnamed: 0, unlabeled: 0, tabindex: 0, noOutline: 0 };
  const labelledIds = new Set<string>();
  const controls: { id: string | null; named: boolean }[] = [];
  let open: { named: boolean; text: string } | null = null;
  let labelDepth = 0;

  const rewriter = new HTMLRewriter()
    .on("html", {
      element(el) {
        hasLang = Boolean(el.getAttribute("lang")?.trim());
      },
    })
    .on('meta[name="viewport"]', {
      element(el) {
        viewport = el.getAttribute("content") ?? "";
      },
    })
    .on("title", {
      element() {
        inTitle = true;
      },
      text(chunk) {
        if (inTitle) title += chunk.text;
        if (chunk.lastInTextNode) inTitle = false;
      },
    })
    .on("main, [role=main]", {
      element() {
        hasMain = true;
      },
    })
    .on("h1, h2, h3, h4, h5, h6", {
      element(el) {
        headings.push(Number(el.tagName[1]));
      },
    })
    .on("img", {
      element(el) {
        const alt = el.getAttribute("alt");
        if (alt === null && el.getAttribute("role") !== "presentation") counts.missingAlt++;
        // next/image `fill` is absolutely positioned in a sized box: it cannot shift layout.
        const fill =
          el.getAttribute("data-nimg") === "fill" ||
          /position:\s*absolute/.test(el.getAttribute("style") ?? "");
        if (
          !fill &&
          !el.getAttribute("width") &&
          !el.getAttribute("height") &&
          !el.getAttribute("style")?.includes("aspect-ratio")
        )
          counts.unsized++;
        if (open && alt?.trim()) open.named = true;
      },
    })
    .on("a, button", {
      element(el) {
        if (el.tagName === "a" && linkIndex++ < 3) {
          const href = el.getAttribute("href") ?? "";
          if (
            href.startsWith("#") &&
            /skip|main|content|contenu/i.test(`${href} ${el.getAttribute("class") ?? ""}`)
          )
            skipLink = true;
        }
        open = {
          named: Boolean(
            el.getAttribute("aria-label")?.trim() ||
            el.getAttribute("aria-labelledby") ||
            el.getAttribute("title")?.trim() ||
            // Hidden duplicates (image links with tabindex=-1) are not exposed to assistive tech.
            el.getAttribute("aria-hidden") === "true",
          ),
          text: "",
        };
        const tracked = open;
        el.onEndTag(() => {
          if (!tracked.named && !tracked.text.trim()) counts.unnamed++;
          if (open === tracked) open = null;
        });
      },
      text(chunk) {
        if (open) open.text += chunk.text;
      },
    })
    .on("a *, button *", {
      element(el) {
        if (open && (el.getAttribute("aria-label")?.trim() || el.tagName === "title"))
          open.named = true;
      },
    })
    .on("label", {
      element(el) {
        const target = el.getAttribute("for");
        if (target) labelledIds.add(target);
        // A control wrapped in <label> is labelled without `for`.
        labelDepth++;
        el.onEndTag(() => {
          labelDepth--;
        });
      },
    })
    .on("input, select, textarea", {
      element(el) {
        const type = (el.getAttribute("type") ?? "text").toLowerCase();
        if (["hidden", "submit", "button", "reset", "image"].includes(type)) return;
        controls.push({
          id: el.getAttribute("id"),
          named:
            labelDepth > 0 ||
            Boolean(
              el.getAttribute("aria-label")?.trim() ||
              el.getAttribute("aria-labelledby") ||
              el.getAttribute("title"),
            ),
        });
      },
    })
    .on("[tabindex]", {
      element(el) {
        if (Number(el.getAttribute("tabindex")) > 0) counts.tabindex++;
      },
    })
    .on("[style]", {
      element(el) {
        if (/outline\s*:\s*(none|0)\b/i.test(el.getAttribute("style") ?? "")) counts.noOutline++;
      },
    });
  await rewriter.transform(new Response(html)).text();

  counts.unlabeled = controls.filter((c) => !c.named && !(c.id && labelledIds.has(c.id))).length;

  if (!hasLang) issues.push(issue("lang-attr", "<html> has no lang attribute"));
  if (viewport === null) issues.push(issue("viewport-meta", "missing <meta name=viewport>"));
  else if (/user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0)?\b/i.test(viewport))
    issues.push(issue("zoom-disabled", `zoom disabled by viewport: ${viewport}`));
  if (!title.trim()) issues.push(issue("page-title", "empty <title>"));
  const h1 = headings.filter((level) => level === 1).length;
  if (h1 !== 1) issues.push(issue("heading-h1", `${h1} <h1> elements (expected exactly 1)`));
  for (let i = 1; i < headings.length; i++) {
    if (headings[i] - headings[i - 1] > 1) {
      issues.push(issue("heading-hierarchy", `h${headings[i - 1]} followed by h${headings[i]}`));
      break;
    }
  }
  if (!hasMain) issues.push(issue("landmark-main", "no <main> landmark"));
  if (!skipLink) issues.push(issue("skip-links", "no skip-to-content link among the first links"));
  if (counts.missingAlt) issues.push(issue("alt-text", `${counts.missingAlt} <img> without alt`));
  if (counts.unnamed)
    issues.push(issue("aria-labels", `${counts.unnamed} links/buttons without accessible name`));
  if (counts.unlabeled)
    issues.push(issue("form-labels", `${counts.unlabeled} form controls without label`));
  if (counts.tabindex)
    issues.push(issue("tabindex-positive", `${counts.tabindex} elements with tabindex > 0`));
  if (counts.noOutline)
    issues.push(issue("focus-states", `${counts.noOutline} inline outline:none`));
  if (counts.unsized)
    issues.push(issue("image-dimensions", `${counts.unsized} <img> without width/height (CLS)`));
  return issues;
}
