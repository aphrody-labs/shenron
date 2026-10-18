import fr from "../../messages/game-runtime/fr.json";
import en from "../../messages/game-runtime/en.json";
import ja from "../../messages/game-runtime/ja.json";

export const XENOVERSE_2_STEAM_APP_ID = 454650;
export const XENOVERSE_2_GAME_PATH = "/games/xenoverse-2";

const dictionaries = { fr, en, ja };

export function gameRuntimeMessages(locale: string): typeof fr {
  return dictionaries[locale as keyof typeof dictionaries] ?? fr;
}
