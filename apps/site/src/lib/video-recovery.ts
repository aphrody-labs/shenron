// SPDX-License-Identifier: Apache-2.0
export function createVideoRecovery() {
  let networkAttempts = 0;
  let mediaAttempts = 0;
  return (type: "network" | "media" | "other"): "network" | "media" | "fail" => {
    if (type === "network" && networkAttempts++ < 2) return "network";
    if (type === "media" && mediaAttempts++ < 1) return "media";
    return "fail";
  };
}
