// src/staff.ts
var SNOWFLAKE = /^\d{17,20}$/;
function parseSnowflakeCsv(raw) {
  if (!raw)
    return [];
  const out = [];
  for (const part of raw.split(",")) {
    const value = part.trim();
    if (SNOWFLAKE.test(value) && !out.includes(value))
      out.push(value);
  }
  return out;
}
function createStaffPolicy(input) {
  const ids = new Set([...input.ownerIds ?? [], ...input.devIds ?? [], ...input.allowedUsers ?? []].filter((id) => SNOWFLAKE.test(id)));
  return {
    ids,
    isStaff: (discordId) => !!discordId && ids.has(discordId)
  };
}
function staffPolicyFromEnv(env, scope) {
  const owner = parseSnowflakeCsv(env.OWNER_ID);
  const allowedUsers = parseSnowflakeCsv(env.OAUTH_ALLOWED_USERS);
  if (scope === "site")
    return createStaffPolicy({ ownerIds: owner, allowedUsers });
  return createStaffPolicy({
    ownerIds: [...owner, ...parseSnowflakeCsv(env.OWNER_IDS)],
    devIds: parseSnowflakeCsv(env.BOT_DEV_ID),
    allowedUsers
  });
}
export {
  createStaffPolicy,
  parseSnowflakeCsv,
  staffPolicyFromEnv
};
