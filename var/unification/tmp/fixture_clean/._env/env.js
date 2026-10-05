// src/env.ts
function mode(env = process.env) {
  return env.NODE_ENV ?? "development";
}
export {
  mode
};
