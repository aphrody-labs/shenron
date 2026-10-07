export class HostChronologyError extends Error {
  constructor(public readonly status: number) {
    super("Chronology service unavailable");
  }
}
