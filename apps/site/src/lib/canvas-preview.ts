// SPDX-License-Identifier: Apache-2.0
export function canvasPreviewParams(
  id: string,
  members: readonly { id: string }[],
  overrides: Record<string, string> = {},
): Record<string, string> {
  const validMembers = members.filter((member) => !member.id.startsWith("0"));
  const firstMember = validMembers[0]?.id ?? "";
  let defaults: Record<string, string>;
  switch (id) {
    case "profile":
      defaults = { userId: firstMember, theme: "default" };
      break;
    case "scan":
      defaults = { userId: firstMember };
      break;
    case "scouter":
      defaults = { userId: firstMember, type: "gay", pct: "50" };
      break;
    case "fusion":
      defaults = {
        a: firstMember,
        b: validMembers[1]?.id ?? "",
        state: "success",
        name: "Gokuetto",
      };
      break;
    case "leaderboard":
      defaults = { metric: "xp", limit: "10" };
      break;
    default:
      defaults = {};
  }
  return { ...defaults, ...overrides };
}
