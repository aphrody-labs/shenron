export type CharacterIdentity = {
  id: number;
  name: string;
  nameJa: string | null;
  visible: boolean;
};

export type CharacterMerge = {
  winnerId: number;
  duplicateId: number;
  winnerName: string;
  duplicateName: string;
  nameJa: string;
  reason: string;
};

/**
 * Allow-list reviewed against the live wiki.
 *
 * Merge criterion: the two rows are the SAME character, proven by an identical
 * Japanese name (`name_ja`, checked by `validateCharacterMerge` on both rows) and
 * a French name that is only a spelling or localisation variant. A shared
 * `name_ja` alone is not enough: timeline, adaptation and form homonyms stay
 * separate (Broly DBZ/DBS, future Trunks, Cell 331 « Cell (futur) » and 333
 * « Cell (présent) », which share セル with Cell 9).
 *
 * `winnerName` and `duplicateName` are the exact current names: the script
 * refuses a merge as soon as one drifted (`names drifted`). Winners renamed in
 * production after the French edition of the manga (2026-10): 6 Zabon, 9 Cell,
 * 11 Krilin, 17 Tortue Géniale, 19 Lunch, 32 Majin Boo, 63 Kaio du Nord,
 * 72 Dai Kaio. A duplicate whose current name is unknown keeps its reviewed
 * name and is refused until checked.
 */
export const CHARACTER_MERGES: readonly CharacterMerge[] = [
  {
    winnerId: 83,
    duplicateId: 514,
    winnerName: "Guldo",
    duplicateName: "Ghourd",
    nameJa: "グルド",
    reason: "same Japanese identity; alternate French spelling",
  },
  {
    winnerId: 86,
    duplicateId: 634,
    winnerName: "Jeice",
    duplicateName: "Jeese",
    nameJa: "ジース",
    reason: "same Japanese identity; alternate romanization",
  },
  {
    winnerId: 18,
    duplicateId: 204,
    winnerName: "Bardock",
    duplicateName: "Bardack",
    nameJa: "バーダック",
    reason: "same Japanese identity; alternate French spelling",
  },
  {
    winnerId: 33,
    duplicateId: 208,
    winnerName: "Bills",
    duplicateName: "Beerus",
    nameJa: "ビルス",
    reason: "same Japanese identity; localized names",
  },
  {
    winnerId: 9,
    duplicateId: 323,
    winnerName: "Cell",
    duplicateName: "Cell",
    nameJa: "セル",
    reason: "same Japanese identity; localized names",
  },
  {
    winnerId: 17,
    duplicateId: 682,
    winnerName: "Tortue Géniale",
    duplicateName: "Kamé Sennin",
    nameJa: "亀仙人",
    reason: "same Japanese identity; localized names",
  },
  {
    winnerId: 63,
    duplicateId: 658,
    winnerName: "Kaio du Nord",
    duplicateName: "Kaio du Nord",
    nameJa: "北の界王",
    reason: "same title and Japanese identity",
  },
  {
    winnerId: 72,
    duplicateId: 399,
    winnerName: "Dai Kaio",
    duplicateName: "Dai Kaiô",
    nameJa: "大界王",
    reason: "same title and Japanese identity",
  },
  {
    winnerId: 32,
    duplicateId: 756,
    winnerName: "Majin Boo",
    duplicateName: "Majin Boo",
    nameJa: "魔人ブウ",
    reason: "same Japanese identity; alternate romanization",
  },
  {
    winnerId: 737,
    duplicateId: 1217,
    winnerName: "Les 3 Guerriers Namek chez Saichôrô",
    duplicateName: "Trois guerriers Nameks",
    nameJa: "戦士タイプのナメック星人",
    reason: "same collective identity",
  },
  {
    winnerId: 11,
    duplicateId: 706,
    winnerName: "Krilin",
    duplicateName: "Krilin",
    nameJa: "クリリン",
    reason: "same Japanese identity and canonical variant slugs",
  },
  {
    winnerId: 19,
    duplicateId: 758,
    winnerName: "Lunch",
    duplicateName: "Lunch",
    nameJa: "ランチ",
    reason: "same Japanese identity and canonical variant slugs",
  },
  {
    winnerId: 6,
    duplicateId: 1300,
    winnerName: "Zabon",
    duplicateName: "Zabon",
    nameJa: "ザーボン",
    reason: "same Japanese identity and canonical variant slug",
  },
  {
    winnerId: 25,
    duplicateId: 420,
    winnerName: "Android 20 (Dr. Gero)",
    duplicateName: "Dr Gero",
    nameJa: "ドクター・ゲロ",
    reason: "same person and Japanese identity",
  },
  {
    winnerId: 84,
    duplicateId: 277,
    winnerName: "Burter",
    duplicateName: "Butta",
    nameJa: "バータ",
    reason: "same Japanese identity; localized names",
  },
] as const;

export function validateCharacterMerge(
  merge: CharacterMerge,
  winner: CharacterIdentity | undefined,
  duplicate: CharacterIdentity | undefined,
): string | null {
  if (!winner || !duplicate) return "missing expected character row";
  if (winner.id !== merge.winnerId || duplicate.id !== merge.duplicateId) return "unexpected ids";
  if (winner.name !== merge.winnerName || duplicate.name !== merge.duplicateName)
    return "names drifted";
  if (winner.nameJa !== merge.nameJa || duplicate.nameJa !== merge.nameJa)
    return "Japanese identities differ";
  if (!winner.visible) return "canonical character is hidden";
  return null;
}
