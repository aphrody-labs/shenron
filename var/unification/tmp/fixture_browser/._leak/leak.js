// src/leak.ts
async function loadFs() {
  const specifier = "node:fs";
  return import(specifier);
}
export {
  loadFs
};
