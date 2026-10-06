// SPDX-License-Identifier: Apache-2.0
import { permanentRedirect } from "next/navigation";

/** `/sources` has a single collection today: the Dragon Ball sources. */
export default function SourcesIndex(): never {
  permanentRedirect("/sources/dragon-ball");
}
