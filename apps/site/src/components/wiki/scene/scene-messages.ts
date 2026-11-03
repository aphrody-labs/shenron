// SPDX-License-Identifier: Apache-2.0
import fr from "../../../../messages/wiki-scene/fr.json";
import en from "../../../../messages/wiki-scene/en.json";
import ja from "../../../../messages/wiki-scene/ja.json";
export type SceneMessageKey = keyof typeof fr;
export function sceneMessages(locale: string) {
  const messages = { fr, en, ja }[locale as "fr" | "en" | "ja"] ?? fr;
  return (key: string) => messages[key as SceneMessageKey] ?? key;
}
