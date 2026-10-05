// src/policy.ts
function decideAccess(rule, visitor, options) {
  if (rule.mode === "public")
    return "allow";
  if (visitor.isAdmin)
    return "allow";
  if (!visitor.authenticated)
    return "deny-anonymous";
  if (rule.mode === "admin")
    return "deny";
  if (rule.mode === "members")
    return "allow";
  const roleIds = rule.roleIds ?? [];
  const discordIds = rule.discordIds ?? [];
  if (roleIds.length === 0 && discordIds.length === 0) {
    return options.emptyRoles === "members" ? "allow" : "deny";
  }
  const held = visitor.roleIds ?? [];
  const byRole = roleIds.some((role) => held.includes(role));
  const byAccount = !!visitor.discordId && discordIds.includes(visitor.discordId);
  return byRole || byAccount ? "allow" : "deny";
}
export {
  decideAccess
};
