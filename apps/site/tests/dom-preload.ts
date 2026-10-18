// SPDX-License-Identifier: Apache-2.0
import "@aphrody/bun-test-dom";

// Next Image and other browser URL consumers require an HTTP document origin.
const browserWindow = window as unknown as Window & { happyDOM: { setURL(url: string): void } };
browserWindow.happyDOM.setURL("https://dragonballfr.com/");
