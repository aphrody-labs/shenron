// SPDX-License-Identifier: Apache-2.0
/** The client reads this build-time constant (scripts/build.ts `define`); tests flip it per case. */
(globalThis as { __ACTIVITY_MOCK__?: boolean }).__ACTIVITY_MOCK__ = false;
