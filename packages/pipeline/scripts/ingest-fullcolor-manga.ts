/**
 * Legacy Full Color importer, intentionally disabled.
 *
 * The previous implementation downloaded copyrighted pages from SushiScan
 * without verified rights or edition provenance. New acquisitions must use the
 * evidence-backed source-manifest workflow:
 * `packages/pipeline/scripts/source-coverage.ts` followed by
 * `packages/pipeline/scripts/source-ingestion-postgres.ts`.
 */
console.error(
  [
    "Full Color importer disabled: its former SushiScan source has no verified rights or edition provenance.",
    "Use a reviewed source manifest with verified assets, hashes, printed-page mapping, and documented ingestion rights.",
    "See docs/guides/sources-ingestion-soshuhen-kanzenshuu.md.",
  ].join("\n"),
);
process.exitCode = 1;
