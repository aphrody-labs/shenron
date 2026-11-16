/**
 * Hoists `<root>/node_modules/.bun` (Bun's isolated store) to `<root>/node_modules`, then replaces the
 * remaining symlinks by copies of their in-tree targets. Throws on two versions of one package.
 */
export function flattenStandalone(root: string): { packages: string[] };
