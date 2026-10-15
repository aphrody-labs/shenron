// SPDX-License-Identifier: Apache-2.0
/** Offline only. Uses the compute owner's existing credential in its protected process. */
import { SQL } from "bun";
import {
  buildVectorSidecar,
  exportVectorSidecar,
  postgresVectorSource,
} from "../src/ai/vector-sidecar";
const [action, directory, pin] = Bun.argv.slice(2);
if (
  !directory ||
  !["export", "build-verify"].includes(action ?? "") ||
  !process.env.APHRODY_MCP_DATABASE_URL
)
  throw Error(
    "export|build-verify ABSOLUTE_PRIVATE_DIRECTORY [MANIFEST_SHA256] requires existing owner database configuration",
  );
const sql = new SQL(process.env.APHRODY_MCP_DATABASE_URL, { max: 1, connectionTimeout: 10 });
try {
  const source = postgresVectorSource(sql);
  const receipt =
    action === "export"
      ? await exportVectorSidecar(source, directory)
      : await buildVectorSidecar(source, directory, pin ?? "");
  console.log(JSON.stringify(receipt));
} catch {
  console.error(JSON.stringify({ schema: "shenron-vector-sidecar-failure/v1", complete: false }));
  process.exitCode = 1;
} finally {
  await sql.close();
}
