// SPDX-License-Identifier: Apache-2.0
import "./setup";
import { afterAll, expect, test } from "bun:test";
import { container } from "tsyringe";
import { PgService } from "../src/db/pg";
import { hybridSearch, buildRagContext } from "../src/lib/rag";
import { closeBunRag } from "../src/lib/bun-rag";
const backend = process.env.RAG_BACKEND,
  original = container.resolve(PgService);
afterAll(async () => {
  await closeBunRag();
  container.registerInstance(PgService, original);
  if (backend === undefined) delete process.env.RAG_BACKEND;
  else process.env.RAG_BACKEND = backend;
});
test("explicit Bun backend fails closed through product search and context without SQLite or remote RAG fallback", async () => {
  container.registerInstance(
    PgService,
    PgService.withEnv({ SHENRON_PG_ENV: "/tmp/shenron-bun-rag-no-database-fixture.env" }),
  );
  process.env.RAG_BACKEND = "bun";
  await expect(hybridSearch(null, "fixture source", 5)).rejects.toThrow(
    "Bun RAG requires the existing PostgreSQL owner",
  );
  await expect(buildRagContext(null, "fixture source")).rejects.toThrow(
    "Bun RAG requires the existing PostgreSQL owner",
  );
});
