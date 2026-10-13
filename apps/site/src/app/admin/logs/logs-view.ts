import { z } from "zod";

const logEntry = z.object({
  time: z.string().optional(),
  host: z.string().optional(),
  unit: z.string().optional(),
  message: z.string().optional(),
  raw: z.string().optional(),
});

const logsResponse = z.object({
  logs: z.array(logEntry),
  count: z.number().int().nonnegative(),
  source: z.string().optional(),
});

export function parseLogsResponse(data: unknown) {
  const parsed = logsResponse.parse(data);
  const occurrences = new Map<string, number>();
  return {
    ...parsed,
    logs: parsed.logs.map((log) => {
      const signature = JSON.stringify([log.time, log.unit, log.raw, log.message]);
      const occurrence = occurrences.get(signature) ?? 0;
      occurrences.set(signature, occurrence + 1);
      return Object.assign(log, { key: `${signature}:${occurrence}` });
    }),
  };
}
