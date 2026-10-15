// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  deliver,
  prepareDelivery,
  runDeliveryOwner,
  type SourceDeliveryConfig,
  type SourceDeliveryPorts,
} from "./bun-source-delivery";

const sourceUrl = "https://dragon-ball-official.com/news/fixture";
const policy = {
  version: 1,
  profile: "dbfr",
  sources: [
    {
      domain: "dragon-ball-official.com",
      kind: "reference",
      reviewed: true,
      evidence: sourceUrl,
      rights: { ragPermitted: true, trainingPermitted: false, publicImagesPermitted: false },
    },
  ],
};
const document = {
  crawl_id: "fixture",
  document_uid: "fixture",
  canonical_url: sourceUrl,
  source_domain: "dragon-ball-official.com",
  category: "official",
  http_status: 200,
  raw_checksum: "a".repeat(64),
  timestamp_utc: "2026-10-15T00:00:00Z",
  payload: {
    title_raw: "Fixture article",
    body_markdown: "Verified private fixture corpus content",
    embedded_media: [],
  },
};
const rag: SourceDeliveryConfig = {
  rag: {
    productOrigin: "https://dragonballfr.com",
    probeQuery: "fixture",
    expectedSourceUrl: sourceUrl,
  },
};

test("DB and CDN gates prevent any RAG or production mutation", async () => {
  let calls = 0;
  const plan = await prepareDelivery(rag);
  for (const [databaseVerified, cdnVerified] of [
    [false, true],
    [true, false],
  ]) {
    await expect(
      deliver(
        rag,
        {
          input: "/unused",
          policy,
          plan,
          databaseVerified: databaseVerified!,
          cdnVerified: cdnVerified!,
        },
        {
          compute: {
            ragIngest: async () => {
              calls++;
              throw new Error("must not run");
            },
          },
        },
      ),
    ).rejects.toThrow("Database and CDN verification");
  }
  expect(calls).toBe(0);
});

test("private RAG uses existing owner and qualifies actual product source retrieval", async () => {
  const directory = await mkdtemp(join(tmpdir(), "shenron-delivery-"));
  let expectedId = "";
  let probes = 0;
  let writes = 0;
  try {
    const input = join(directory, "native-export.jsonl");
    await Bun.write(input, JSON.stringify(document) + "\n");
    const ports: SourceDeliveryPorts = {
      compute: {
        ragIngest: async (record) => {
          writes++;
          expect(record.content).toBe(document.payload.body_markdown);
          expect(record.url).toBe(sourceUrl);
          expect(record.originSourceId).toBe(record.sourceId);
          expectedId = record.sourceId;
          return { indexed: true, vectorIndexed: true, sourceId: record.sourceId };
        },
      },
      fetcher: async (request) => {
        const url = new URL(String(request));
        expect(url.pathname).toBe("/api/public/rag/search");
        expect(url.searchParams.get("sourceId")).toBe(expectedId);
        probes++;
        return Response.json({ q: "fixture", results: [{ sourceId: expectedId, url: sourceUrl }] });
      },
    };
    const plan = await prepareDelivery(rag);
    const receipt = await deliver(
      rag,
      {
        input,
        policy,
        plan,
        databaseVerified: true,
        cdnVerified: true,
        ragEligibleUrls: [sourceUrl],
      },
      ports,
    );
    expect(receipt).toEqual({
      complete: true,
      ragDocuments: 1,
      productRetrievalVerified: true,
      deployed: false,
      canonicalPromotions: 0,
      trainingEnabled: false,
    });
    expect(probes).toBe(1);
    await deliver(
      rag,
      {
        input,
        policy,
        plan,
        databaseVerified: true,
        cdnVerified: true,
        ragEligibleUrls: [sourceUrl],
        verifyOnly: true,
        receipt,
      },
      ports,
    );
    expect(writes).toBe(1);
    expect(probes).toBe(2);
    const wrongProbe = {
      ...ports,
      fetcher: async () =>
        Response.json({ results: [{ sourceId: expectedId, url: sourceUrl + "/wrong" }] }),
    };
    await expect(
      deliver(
        rag,
        {
          input,
          policy,
          plan,
          databaseVerified: true,
          cdnVerified: true,
          ragEligibleUrls: [sourceUrl],
          verifyOnly: true,
          receipt,
        },
        wrongProbe,
      ),
    ).rejects.toThrow("Product retriever did not return indexed source");
    await expect(
      deliver(
        rag,
        { input, policy, plan, databaseVerified: true, cdnVerified: true, ragEligibleUrls: [] },
        ports,
      ),
    ).rejects.toThrow("Expected RAG probe source absent");
    expect(probes).toBe(2);
    const denied = {
      ...policy,
      sources: policy.sources.map((source) => ({
        ...source,
        rights: { ...source.rights, ragPermitted: false },
      })),
    };
    const beforeDenied = writes;
    await expect(
      deliver(
        rag,
        {
          input,
          policy: denied,
          plan,
          databaseVerified: true,
          cdnVerified: true,
          ragEligibleUrls: [sourceUrl],
        },
        ports,
      ),
    ).rejects.toThrow("Reviewed RAG rights");
    expect(writes).toBe(beforeDenied);
    const mixedPolicy = {
      ...policy,
      sources: [
        ...policy.sources,
        {
          ...policy.sources[0]!,
          domain: "unused.example",
          rights: { ...policy.sources[0]!.rights, ragPermitted: false },
        },
      ],
    };
    expect(
      (
        await deliver(
          rag,
          {
            input,
            policy: mixedPolicy,
            plan,
            databaseVerified: true,
            cdnVerified: true,
            ragEligibleUrls: [sourceUrl],
          },
          ports,
        )
      ).ragDocuments,
    ).toBe(1);
    expect(writes).toBe(beforeDenied + 1);
    const deniedUrl = "https://unused.example/news/denied";
    await Bun.write(
      input,
      [document, { ...document, canonical_url: deniedUrl, source_domain: "unused.example" }]
        .map((value) => JSON.stringify(value))
        .join("\n") + "\n",
    );
    await expect(
      deliver(
        rag,
        {
          input,
          policy: mixedPolicy,
          plan,
          databaseVerified: true,
          cdnVerified: true,
          ragEligibleUrls: [sourceUrl, deniedUrl],
        },
        ports,
      ),
    ).rejects.toThrow("Reviewed RAG rights");
    expect(writes).toBe(beforeDenied + 1);
    await Bun.write(input, JSON.stringify(document) + "\n");
    const altered = { rag: { ...rag.rag!, expectedSourceUrl: sourceUrl + "/missing" } };
    await expect(
      deliver(
        altered,
        {
          input,
          policy,
          plan,
          databaseVerified: true,
          cdnVerified: true,
          ragEligibleUrls: [sourceUrl],
        },
        ports,
      ),
    ).rejects.toThrow("Delivery plan changed");
    const missingPlan = await prepareDelivery(altered);
    await expect(
      deliver(
        altered,
        {
          input,
          policy,
          plan: missingPlan,
          databaseVerified: true,
          cdnVerified: true,
          ragEligibleUrls: [sourceUrl],
        },
        ports,
      ),
    ).rejects.toThrow("Expected RAG probe source absent");
    expect(probes).toBe(3);
  } finally {
    await rm(directory, { recursive: true });
  }
});

test("sealed deployment revalidates owner plan and rolls back a failed public probe", async () => {
  const deployment = {
    release: "/home/ubuntu/apps/shenron/releases/docker-" + "a".repeat(40),
    manifestSha256: "b".repeat(64),
    probeUrl: "https://dragonballfr.com/health",
    probeSha256: "c".repeat(64),
  };
  const config = { deployment };
  const calls: string[][] = [];
  const ports: SourceDeliveryPorts = {
    run: async (args) => {
      calls.push(args);
      if (args.includes("sha256sum")) return deployment.manifestSha256 + "  release.json";
      if (args.includes("--apply"))
        return "Docker activation verified; rollback=/home/ubuntu/apps/shenron/deploy-backups/docker-fixture";
      if (args.includes("readlink")) return deployment.release;
      return args.includes("deploy") ? "stable-owner-plan" : "verified";
    },
    fetcher: async () => new Response("wrong deployment"),
  };
  const plan = await prepareDelivery(config, undefined, ports);
  expect(calls.some((args) => args.includes("--apply"))).toBe(false);
  await expect(
    deliver(
      config,
      {
        input: "/unused",
        policy,
        plan,
        databaseVerified: true,
        cdnVerified: true,
        ragEligibleUrls: [sourceUrl],
      },
      ports,
    ),
  ).rejects.toThrow("owner rollback completed");
  expect(calls.some((args) => args.includes("--apply"))).toBe(true);
  expect(calls.at(-1)).toContain("restore");
  const changed = {
    ...ports,
    run: async (args: string[]) => (args.includes("sha256sum") ? "0".repeat(64) : "changed"),
  };
  await expect(prepareDelivery(config, undefined, changed)).rejects.toThrow(
    "Remote sealed release changed",
  );
});

test("qualified production delivery verifies current identity and rechecks without activation", async () => {
  const body = "qualified public artifact";
  const deployment = {
    release: "/home/ubuntu/apps/shenron/releases/docker-" + "d".repeat(40),
    manifestSha256: "e".repeat(64),
    probeUrl: "https://dragonballfr.com/health",
    probeSha256: new Bun.CryptoHasher("sha256").update(body).digest("hex"),
  };
  const config = { deployment };
  let activations = 0;
  const ports: SourceDeliveryPorts = {
    run: async (args) => {
      if (args.includes("sha256sum")) return deployment.manifestSha256;
      if (args.includes("readlink")) return deployment.release;
      if (args.includes("--apply")) {
        activations++;
        return "Docker activation verified; rollback=/home/ubuntu/apps/shenron/deploy-backups/docker-fixture";
      }
      return "stable owner plan";
    },
    fetcher: async () => new Response(body),
  };
  const plan = await prepareDelivery(config, undefined, ports);
  const context = { input: "/unused", policy, plan, databaseVerified: true, cdnVerified: true };
  const receipt = await deliver(config, context, ports);
  expect(receipt.deployed).toBe(true);
  expect(activations).toBe(1);
  expect(await deliver(config, { ...context, verifyOnly: true, receipt }, ports)).toEqual(receipt);
  expect(activations).toBe(1);
  const changed = {
    ...ports,
    run: async (args: string[]) =>
      args.includes("readlink")
        ? deployment.release + "-wrong"
        : ports.run!(args, { timeoutMs: 1000 }),
  };
  await expect(deliver(config, { ...context, verifyOnly: true, receipt }, changed)).rejects.toThrow(
    "Current deployment verification failed",
  );
  expect(activations).toBe(1);
  let probedAfterFailure = false;
  const uncertain = {
    ...ports,
    run: async (args: string[]) => {
      if (args.includes("--apply")) throw new Error("remote connection ended");
      return ports.run!(args, { timeoutMs: 1000 });
    },
    fetcher: async () => {
      probedAfterFailure = true;
      return new Response(body);
    },
  };
  await expect(deliver(config, context, uncertain)).rejects.toMatchObject({
    code: "ERR_DELIVERY_STATE_UNCERTAIN",
  });
  expect(probedAfterFailure).toBe(false);
});

test("delivery cancellation stops before owner commands and propagates into retrieval probes", async () => {
  const controller = new AbortController();
  controller.abort(new Error("cancelled fixture"));
  let calls = 0;
  await expect(
    prepareDelivery(rag, controller.signal, {
      run: async () => {
        calls++;
        return "unexpected";
      },
    }),
  ).rejects.toThrow("cancelled fixture");
  expect(calls).toBe(0);
  const directory = await mkdtemp(join(tmpdir(), "shenron-delivery-abort-"));
  const active = new AbortController();
  try {
    const input = join(directory, "export.jsonl");
    await Bun.write(input, JSON.stringify(document) + "\n");
    const plan = await prepareDelivery(rag);
    await expect(
      deliver(
        rag,
        {
          input,
          policy,
          plan,
          databaseVerified: true,
          cdnVerified: true,
          ragEligibleUrls: [sourceUrl],
        },
        {
          signal: active.signal,
          compute: {
            ragIngest: async (record) => ({
              indexed: true,
              vectorIndexed: true,
              sourceId: record.sourceId,
            }),
          },
          fetcher: async (_url, options) => {
            expect(options?.redirect).toBe("error");
            expect(options?.signal?.aborted).toBe(false);
            active.abort(new Error("cancelled retrieval"));
            options?.signal?.throwIfAborted();
            throw new Error("Missing cancellation signal");
          },
        },
      ),
    ).rejects.toThrow("cancelled retrieval");
  } finally {
    await rm(directory, { recursive: true });
  }
});

test.skipIf(!Bun.which("aphrody"))(
  "owner subprocess cancellation drains its bounded pipes",
  async () => {
    const controller = new AbortController();
    const pending = runDeliveryOwner(["--help"], { timeoutMs: 5000, signal: controller.signal });
    controller.abort(new Error("cancelled owner fixture"));
    await expect(pending).rejects.toThrow("cancelled owner fixture");
  },
);
