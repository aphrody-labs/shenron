// SPDX-License-Identifier: Apache-2.0
export class HostLaunchError extends Error {
  constructor(readonly status: number) {
    super("Bun launch configuration unavailable");
    this.name = "HostLaunchError";
  }
}
