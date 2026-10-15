// SPDX-License-Identifier: Apache-2.0
/** Public serialization evidence only; it never establishes a collected-volume edition. */
export async function jumpPublicReaderUrls(html: string, source: string): Promise<string[]> {
  const origin = new URL(source);
  if (origin.origin !== "https://shonenjumpplus.com" || !/^\/episode\/\d+$/.test(origin.pathname))
    return [];
  let encoded: string | undefined;
  await new HTMLRewriter()
    .on("script#episode-json", {
      element(element) {
        encoded = element.getAttribute("data-value") ?? undefined;
      },
    })
    .transform(new Response(html))
    .text();
  if (!encoded) return [];
  let value: any;
  try {
    value = JSON.parse(
      encoded.replaceAll("&quot;", '"').replaceAll("&#34;", '"').replaceAll("&amp;", "&"),
    );
  } catch {
    return [];
  }
  const product = value?.readableProduct;
  if (product?.isPublic !== true || product.permalink !== source) return [];
  const urls = new Set<string>();
  for (const page of product.pageStructure?.pages ?? []) {
    if (page.type !== "main" || typeof page.src !== "string") continue;
    try {
      const url = new URL(page.src);
      if (
        url.origin === "https://cdn-ak-img.shonenjumpplus.com" &&
        url.pathname.startsWith("/public/page/") &&
        !url.username &&
        !url.password &&
        !url.search
      )
        urls.add(url.href);
    } catch {}
  }
  const next = product.nextReadableProductUri;
  if (typeof next === "string" && /^https:\/\/shonenjumpplus\.com\/episode\/\d+$/.test(next))
    urls.add(next);
  return [...urls];
}
