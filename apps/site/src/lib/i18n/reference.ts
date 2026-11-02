// SPDX-License-Identifier: Apache-2.0

import { createTranslator, type NamespaceKeys, type NestedKeyOf } from "next-intl";
import { getDictionary } from "./index";

/**
 * Translator pinned to the reference language (French), independent of the request.
 *
 * `getTranslations({ locale: "fr" })` is NOT enough: next-intl still loads the messages of
 * the request locale (cookie, then `Accept-Language`), so a page title came out English while
 * the statically cached body stayed French. Metadata of static public pages must follow the
 * body, which renders the reference language until the client provider switches it, so it
 * reads the French dictionary directly and never touches cookies or headers (the route stays
 * static).
 */
type Messages = ReturnType<typeof getDictionary>;

export function getReferenceTranslations<N extends NamespaceKeys<Messages, NestedKeyOf<Messages>>>(
  namespace: N,
) {
  return createTranslator({ locale: "fr", messages: getDictionary("fr"), namespace });
}
