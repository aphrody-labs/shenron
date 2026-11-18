import { API_URL } from "@/lib/config";
import {
  createServiceHealth,
  probeHttp,
  probeDatabase,
  probeRag,
  databaseRequired,
  enforceDatabaseRequirement,
  type ServiceHealth,
} from "@/lib/service-health";

export interface ReadinessDeps {
  probeHttp?: (url: string) => Promise<ServiceHealth["checks"][string]>;
  probeDatabase?: () => Promise<"ok" | "unreachable" | "disabled">;
  probeRag?: () => Promise<ServiceHealth["checks"][string]>;
  databaseRequired?: () => boolean;
}

/** Builds the GET /api/health/ready handler with injectable dependency probes. */
export function createReadinessHandler(deps: ReadinessDeps = {}) {
  const checkHttp = deps.probeHttp ?? probeHttp;
  const checkDb = deps.probeDatabase ?? probeDatabase;
  const checkRag = deps.probeRag ?? (() => probeRag());
  const dbRequired = deps.databaseRequired ?? (() => databaseRequired());

  return async function GET(): Promise<Response> {
    const [api, databaseState, rag] = await Promise.all([
      checkHttp(`${API_URL}/api/health/check`),
      checkDb(),
      checkRag(),
    ]);
    const database = enforceDatabaseRequirement(databaseState, dbRequired());

    const health = createServiceHealth(
      "site",
      process.env.npm_package_version ?? "0.1.0",
      {
        api,
        database,
        ...(rag === "disabled" ? {} : { rag }),
      },
      {
        probe: "readiness",
        failureSemantics:
          "Readiness probe indicates whether upstream dependencies are ready. A 503 stops ingress traffic without container restart.",
      },
    );

    return Response.json(health, {
      status: health.status === "ok" ? 200 : 503,
      headers: { "cache-control": "no-store" },
    });
  };
}
