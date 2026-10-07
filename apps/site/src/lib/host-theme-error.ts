export class HostThemeError extends Error {
  constructor(public readonly status: number) {
    super("Theme service unavailable");
  }
}
