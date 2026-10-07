export class HostHomeError extends Error {
  constructor(public readonly status: number) {
    super("Home configuration service unavailable");
  }
}
