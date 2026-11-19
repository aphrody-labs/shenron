/** Échappe une chaîne pour un usage littéral dans un `RegExp`. */
export function echapperRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
