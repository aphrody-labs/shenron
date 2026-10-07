export class HostBannerError extends Error {
  constructor(public readonly status: number) {
    super("Banner service unavailable");
  }
}
