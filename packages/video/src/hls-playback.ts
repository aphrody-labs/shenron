// SPDX-License-Identifier: Apache-2.0
/** Browser lifecycle adapter. The caller supplies its qualified HLS decoder and worker. */
export interface HlsPlaybackInstance<Media> {
  attachMedia(media: Media): void;
  loadSource(source: string): void;
  destroy(): void;
}

export interface HlsPlaybackConstructor<Media, Config, Instance extends HlsPlaybackInstance<Media>> {
  new (config?: Config): Instance;
  isSupported?(): boolean;
}

export interface HlsPlaybackOptions<Config, Instance> {
  src: string;
  config?: Config & { enableWorker?: boolean; workerPath?: string | null };
  /** Required outside a browser document when a worker is enabled. */
  pageUrl?: string;
  /** Register event listeners before either attachMedia or loadSource can emit events. */
  beforeStart?: (instance: Instance) => void;
}

function httpUrl(value: string, base?: string): URL {
  if (!value.trim()) throw new Error("HLS URLs must not be empty");
  const url = new URL(value, base);
  if (!/^https?:$/.test(url.protocol) || url.username || url.password)
    throw new Error("HLS URLs must use HTTP(S) without embedded credentials");
  return url;
}

export function attachHlsPlayback<
  Media extends { ownerDocument?: { URL?: string; baseURI?: string; location?: { href: string } | null } },
  Config extends object,
  Instance extends HlsPlaybackInstance<Media>,
>(
  video: Media,
  Hls: HlsPlaybackConstructor<Media, Config, Instance>,
  options: HlsPlaybackOptions<Config, Instance>,
): { instance: Instance; destroy(): void } {
  const document = video.ownerDocument;
  const pageUrl = document?.URL ?? document?.location?.href ?? options.pageUrl;
  const source = httpUrl(options.src, document?.baseURI ?? pageUrl);
  let config = options.config;
  if (config?.enableWorker !== false) {
    if (!pageUrl || !config?.workerPath)
      throw new Error("HLS worker playback requires an explicit page URL and workerPath");
    const page = httpUrl(pageUrl);
    const worker = httpUrl(config.workerPath, page.href);
    if (worker.origin !== page.origin) throw new Error("HLS workerPath must use the page origin");
    // Worker URL resolution must not inherit an unrelated document <base> origin.
    config = { ...config, workerPath: worker.href };
  }
  if (Hls.isSupported && !Hls.isSupported()) {
    throw new Error("HLS playback is not supported by this browser");
  }
  const instance = new Hls(config);
  let destroyed = false;
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    instance.destroy();
  };
  try {
    const prepared: unknown = options.beforeStart?.(instance);
    if (prepared && typeof (prepared as { then?: unknown }).then === "function")
      throw new Error("HLS beforeStart must register listeners synchronously");
    instance.attachMedia(video);
    instance.loadSource(source.href);
  } catch (error) {
    try {
      destroy();
    } catch {
      /* Preserve the original startup failure. */
    }
    throw error;
  }
  return { instance, destroy };
}
