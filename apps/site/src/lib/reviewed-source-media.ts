// SPDX-License-Identifier: Apache-2.0
/** Exact public source identities matched to their reviewed immutable publication. */
export const REVIEWED_SOURCE_PUBLICATION =
  "https://cdn.dragonballfr.com/publications/nozawa-yamaguchi-sdbh-ja/index.json";
export const REVIEWED_SOURCE_MEDIA = [
  {
    sourceUrl:
      "https://www.carddass.com/dbh/sdbh/prison_planet/images/news/cast_interview/img_01.png",
    publishedUrl:
      "https://cdn.dragonballfr.com/publications/nozawa-yamaguchi-sdbh-ja/objects/0dc0c9b95f45e74618f284828e3455b1063106ee0b8ffb6b11a5f369d0820e94.png",
    sha256: "0dc0c9b95f45e74618f284828e3455b1063106ee0b8ffb6b11a5f369d0820e94",
    bytes: 497030,
  },
  {
    sourceUrl:
      "https://www.carddass.com/dbh/sdbh/prison_planet/images/news/cast_interview/img_02.png",
    publishedUrl:
      "https://cdn.dragonballfr.com/publications/nozawa-yamaguchi-sdbh-ja/objects/7d982c73d0742b7c523b2ccb83579341cb5e9c5d80442351d66d83568cad9e53.png",
    sha256: "7d982c73d0742b7c523b2ccb83579341cb5e9c5d80442351d66d83568cad9e53",
    bytes: 51177,
  },
  {
    sourceUrl:
      "https://www.carddass.com/dbh/sdbh/prison_planet/images/news/cast_interview/img_03.png",
    publishedUrl:
      "https://cdn.dragonballfr.com/publications/nozawa-yamaguchi-sdbh-ja/objects/9ff7d0ff07eb6b1e46dbeda69bd495ab55c73c692202f640d4e386b527bc5837.png",
    sha256: "9ff7d0ff07eb6b1e46dbeda69bd495ab55c73c692202f640d4e386b527bc5837",
    bytes: 211346,
  },
  {
    sourceUrl:
      "https://www.carddass.com/dbh/sdbh/prison_planet/images/news/cast_interview/img_04.png",
    publishedUrl:
      "https://cdn.dragonballfr.com/publications/nozawa-yamaguchi-sdbh-ja/objects/967ed48aef0a3c93db31158a29235a18048b1bf51279677fa814f59a386c92d1.png",
    sha256: "967ed48aef0a3c93db31158a29235a18048b1bf51279677fa814f59a386c92d1",
    bytes: 137528,
  },
  {
    sourceUrl:
      "https://www.carddass.com/dbh/sdbh/prison_planet/images/news/cast_interview/img_05.png",
    publishedUrl:
      "https://cdn.dragonballfr.com/publications/nozawa-yamaguchi-sdbh-ja/objects/e602e7d0c375809c10b1f7fcd2504a4c14445b62204c188a5209ec1143ba8b1d.png",
    sha256: "e602e7d0c375809c10b1f7fcd2504a4c14445b62204c188a5209ec1143ba8b1d",
    bytes: 76615,
  },
  {
    sourceUrl:
      "https://www.carddass.com/dbh/sdbh/prison_planet/images/news/cast_interview/img_06.png",
    publishedUrl:
      "https://cdn.dragonballfr.com/publications/nozawa-yamaguchi-sdbh-ja/objects/d70f87c8f31a1f5901792b4c83a6d0489dfcef64b71f9026fd7f525984435481.png",
    sha256: "d70f87c8f31a1f5901792b4c83a6d0489dfcef64b71f9026fd7f525984435481",
    bytes: 145049,
  },
  {
    sourceUrl:
      "https://www.carddass.com/dbh/sdbh/prison_planet/images/news/cast_interview/img_07.png",
    publishedUrl:
      "https://cdn.dragonballfr.com/publications/nozawa-yamaguchi-sdbh-ja/objects/608a39b9fb6bc5e78182aefdb4609a410af34dec6750d2f0589b5455f578c7ee.png",
    sha256: "608a39b9fb6bc5e78182aefdb4609a410af34dec6750d2f0589b5455f578c7ee",
    bytes: 234237,
  },
  {
    sourceUrl:
      "https://www.carddass.com/dbh/sdbh/prison_planet/images/news/cast_interview/img_08.png",
    publishedUrl:
      "https://cdn.dragonballfr.com/publications/nozawa-yamaguchi-sdbh-ja/objects/5157ccb63897ea7f2268adacf7029ad994bdad6c4948efc8ecdb9d329ed9480b.png",
    sha256: "5157ccb63897ea7f2268adacf7029ad994bdad6c4948efc8ecdb9d329ed9480b",
    bytes: 63222,
  },
  {
    sourceUrl:
      "https://www.carddass.com/dbh/sdbh/prison_planet/images/news/cast_interview/img_09.png",
    publishedUrl:
      "https://cdn.dragonballfr.com/publications/nozawa-yamaguchi-sdbh-ja/objects/1742a17ff2d6b0d36dbce0cf8b337327a480dd9dabdc09c9a5f5a22f5afc16fe.png",
    sha256: "1742a17ff2d6b0d36dbce0cf8b337327a480dd9dabdc09c9a5f5a22f5afc16fe",
    bytes: 44542,
  },
] as const;
const sourceMedia = new Map<string, string>(
  REVIEWED_SOURCE_MEDIA.map((media) => [media.sourceUrl, media.publishedUrl]),
);
/** Unknown sources, query variants and other editions retain their original identity. */
export function reviewedSourceMediaUrl(source: string): string | null {
  return sourceMedia.get(source) ?? null;
}
