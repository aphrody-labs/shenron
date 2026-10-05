// src/helper.ts
function helper(size) {
  return `${size} bytes`;
}

// src/pure.ts
var label = "server-only and @aphrody/x inside a string are not imports";
var pattern = /process\.env|window\.name/;
function describe(stat) {
  return `${helper(stat.size)} ${"window.location"}`;
}
export {
  describe,
  label,
  pattern
};
