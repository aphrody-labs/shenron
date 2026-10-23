/**
 * Card renderer of the bot: PNG cards at 2x, in the Dragon Ball identity of the site.
 *
 *   renderProfileCard      profile (level, XP gauge, rank, race, tier, zeni)
 *   renderLeaderboardCard  top 10 with podium
 *   renderTierCard         tier-up ("Level 12 -> 15", new transformation role)
 *   renderBalanceCard      zeni balance with figures and sparkline
 *   renderShopItemCard     one shop item preview
 *   renderShopBoardCard    board of up to four previews
 *   renderGameCard         game card primitive (tiles, lives, keyboard, range, grid, scores)
 *
 * Every function takes localized texts and returns a `RenderedCard`; a missing avatar or
 * background never throws. See `docs/products/bot-discord-refonte.md` section 4.4.
 */
export type { CardFormat, ImageSource, RenderOptions, RenderedCard } from "./types";
export {
  type PaletteToken,
  type RenderPalette,
  raceAccent,
  rankColor,
  resolvePalette,
  setPaletteOverrides,
  toHexColor,
} from "./theme";
export { clearAssetCache, defaultImages, loadLocalImage } from "./images";
export { clearRemoteImageCache } from "~/lib/canvas-kit";
export { imageSourceFrom, withExtensions, type BackgroundLoader } from "./adapters";
export { DEFAULT_MAX_BYTES, DEFAULT_SCALE } from "./surface";
export {
  PROFILE_CARD_SIZE,
  renderProfileCard,
  type ProfileCardInput,
  type ProfileCardLabels,
  type ProfileCardTheme,
} from "./cards/profile";
export {
  LEADERBOARD_CARD_SIZE,
  renderLeaderboardCard,
  type LeaderboardCardEntry,
  type LeaderboardCardInput,
} from "./cards/leaderboard";
export {
  TIER_CARD_SIZE,
  renderTierCard,
  type TierCardInput,
  type TierCardLabels,
} from "./cards/tier";
export {
  BALANCE_CARD_SIZE,
  renderBalanceCard,
  type BalanceCardInput,
  type BalanceStat,
} from "./cards/balance";
export {
  SHOP_BOARD_CARD_SIZE,
  SHOP_ITEM_CARD_SIZE,
  renderShopBoardCard,
  renderShopItemCard,
  type ShopBoardCardInput,
  type ShopItemCardInput,
  type ShopItemInput,
  type ShopPreview,
} from "./cards/shop";
export {
  GAME_CARD_WIDTH,
  gameCardHeight,
  renderGameCard,
  type GameBlock,
  type GameCardSpec,
  type GridCell,
  type ScorePlayer,
  type Tone,
  type TileCell,
} from "./cards/game";
