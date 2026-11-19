// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { loadCluster, meshAddresses, renderNodeConfig } from "./garage-config";

test("renders every declared node from the mesh addresses", async () => {
  const cluster = await loadCluster();
  const mesh = await meshAddresses();
  for (const node of cluster.nodes) {
    const config = renderNodeConfig(cluster, node, mesh(node.triad));
    expect(config).toContain(`rpc_bind_addr = "${mesh(node.triad)}:${cluster.ports.rpc}"`);
    expect(config).toContain(`replication_factor = ${cluster.garage.replication_factor}`);
    expect(config).not.toMatch(/rpc_secret = |admin_token = /);
  }
});

test("node zones are distinct so replicas land on different hosts", async () => {
  const cluster = await loadCluster();
  expect(new Set(cluster.nodes.map((node) => node.zone)).size).toBe(cluster.nodes.length);
});
