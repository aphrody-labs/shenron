// SPDX-License-Identifier: Apache-2.0

/** Exact official-channel links matched to the 48 public SDBH episode IDs. */
const VIDEO_IDS: Readonly<Record<number, string>> = {
  827: "8dgszLUSWHg",
  828: "DnqODAUOg7c",
  829: "-fn3WWNC2IE",
  830: "F05Z1zWL3iE",
  831: "GVjdxFbGEdg",
  832: "6Zzk3UF6bu8",
  833: "ktX7iXveejI",
  834: "7xItAfx3vCA",
  835: "FmqncjkrOb8",
  836: "bDiiEDSICdg",
  837: "NV2Ao5dSk3U",
  838: "AT_J9jYJ_m4",
  839: "yvke6hiV_GM",
  840: "gTnMCTKAgRY",
  841: "5BoeCYQ_OYo",
  842: "f_RtZ4Dhkjs",
  843: "NiK2dtBePIM",
  844: "oVG2OzQmrlE",
  845: "Pg4qMAiBhMM",
  846: "9tK3JjycOe0",
  847: "soKbd1cyiZo",
  848: "PJ06YtuTzvs",
  849: "lnMxjp7vhMw",
  850: "c5AUStKgumI",
  851: "3SdA2VkS2aA",
  852: "IVWQJfybk6M",
  853: "De_umvXxP84",
  854: "hZf8duzewus",
  855: "CMTSeCc6EgM",
  856: "d0-l84bpApI",
  857: "3tgaUHy7wzo",
  858: "TUmhMV0ZsaM",
  859: "FusBxEfP0EQ",
  860: "KuG2iHSgVWI",
  861: "Oxd6uuph5UQ",
  862: "EilcRB82jfI",
  863: "uoKXtXCUwSc",
  864: "C56i5l2NIi4",
  865: "jXY6g_iRRts",
  866: "bAe5ZHGLOEg",
  867: "IRNCeCgCnOg",
  868: "6SF9QYPbJWU",
  869: "9uDBT2bwYvw",
  870: "SIzYZ2FVmQM",
  871: "tRTcLOEbNC4",
  872: "u9DDxYElsIA",
  873: "sHCvIc4EnEk",
  874: "YjBBr5LgYDI",
};

export function sdbhOfficialSourceUrl(episodeId: number | string): string | null {
  const id = typeof episodeId === "number" ? episodeId : Number(episodeId);
  const videoId = Number.isSafeInteger(id) ? VIDEO_IDS[id] : undefined;
  return videoId ? `https://www.youtube.com/watch?v=${videoId}` : null;
}

export const SDBH_OFFICIAL_EPISODE_IDS = Object.freeze(Object.keys(VIDEO_IDS).map(Number));
