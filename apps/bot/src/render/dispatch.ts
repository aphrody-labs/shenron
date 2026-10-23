/**
 * One table of the card renderers by kind: what a render worker runs, and what the pool runs
 * in line when it cannot hand a card to a worker. Inputs are plain data (strings, numbers,
 * arrays, Sets), so they cross the worker boundary by structured clone.
 */
import { renderBalanceCard, type BalanceCardInput } from "./cards/balance";
import { renderGameCard, type GameCardSpec } from "./cards/game";
import { renderLeaderboardCard, type LeaderboardCardInput } from "./cards/leaderboard";
import { renderProfileCard, type ProfileCardInput } from "./cards/profile";
import {
  renderShopBoardCard,
  renderShopItemCard,
  type ShopBoardCardInput,
  type ShopItemCardInput,
} from "./cards/shop";
import { renderTierCard, type TierCardInput } from "./cards/tier";
import type { RenderOptions, RenderedCard } from "./types";

/** Input of each card kind. */
export interface CardInputs {
  profile: ProfileCardInput;
  leaderboard: LeaderboardCardInput;
  tier: TierCardInput;
  balance: BalanceCardInput;
  shopItem: ShopItemCardInput;
  shopBoard: ShopBoardCardInput;
  game: GameCardSpec;
}

export type CardKind = keyof CardInputs;

type Renderers = {
  [K in CardKind]: (input: CardInputs[K], options: RenderOptions) => Promise<RenderedCard>;
};

export const RENDERERS: Renderers = {
  profile: renderProfileCard,
  leaderboard: renderLeaderboardCard,
  tier: renderTierCard,
  balance: renderBalanceCard,
  shopItem: renderShopItemCard,
  shopBoard: renderShopBoardCard,
  game: renderGameCard,
};

export const CARD_KINDS = Object.keys(RENDERERS) as CardKind[];

/** Renders a card in this thread. */
export function renderInline<K extends CardKind>(
  kind: K,
  input: CardInputs[K],
  options: RenderOptions = {},
): Promise<RenderedCard> {
  const render = RENDERERS[kind] as (i: CardInputs[K], o: RenderOptions) => Promise<RenderedCard>;
  return render(input, options);
}
