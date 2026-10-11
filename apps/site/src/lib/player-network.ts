// SPDX-License-Identifier: Apache-2.0
/** Probe network reachability only: an opaque response does not prove playback. */
export async function probePlayerNetwork(
  url: string,
  signal: AbortSignal,
  request: (input: string, init: RequestInit) => Promise<Response> = fetch,
): Promise<"reachable" | "unreachable" | "unknown"> {
  try {
    const response = await request(url, {
      method: "HEAD",
      mode: "no-cors",
      credentials: "omit",
      signal,
    });
    await response.body?.cancel();
    return "reachable";
  } catch {
    return signal.aborted ? "unknown" : "unreachable";
  }
}
