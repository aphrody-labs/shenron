// SPDX-License-Identifier: Apache-2.0

/** A component that cannot be built as asked (empty text, too many buttons…): a coding error. */
export class UiBuildError extends Error {
  override name = "UiBuildError";
}
