// SPDX-License-Identifier: Apache-2.0
/** Finite native Web operations; admin authority is enforced by the existing API router. */
export {
  WEB_PATHS,
  WebCapability,
  WebImage,
  WebFrameSearch,
  WebMediaResolve,
  WebMediaSearch,
} from "@shenron/pipeline/bxc/contracts";

import {
  WebStatus as Status,
  WebMediaSource as MediaSource,
  WebMediaResults as MediaResults,
  BxcFramesStatsSchema,
  BxcVectorOutputSchema,
  BxcSearchOutputSchema,
} from "@shenron/pipeline/bxc/contracts";

export const WebStatus = Status.meta({ id: "WebStatus" });
export const WebMediaSource = MediaSource.meta({ id: "WebMediaSource" });
export const WebMediaResults = MediaResults.meta({ id: "WebMediaResults" });
export const WebFrameStats = BxcFramesStatsSchema.meta({ id: "WebFrameStats" });
export const WebFrameVector = BxcVectorOutputSchema.meta({ id: "WebFrameVector" });
export const WebFrameMatches = BxcSearchOutputSchema.meta({ id: "WebFrameMatches" });
