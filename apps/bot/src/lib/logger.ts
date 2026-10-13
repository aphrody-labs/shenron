import { isCompiledBinary } from "@aphrody/discord-kit";
import pino from "pino";
import { env } from "./env";
import { botOperationalLogs } from "./operational-logs";

export const logger = pino({
  level: env.LOG_LEVEL,
  base: { app: "shenron" },
  hooks: {
    logMethod(args, method, level) {
      botOperationalLogs.record(level, args);
      method.apply(this, args);
    },
  },
  transport:
    env.NODE_ENV === "development" && !isCompiledBinary()
      ? {
          target: "pino-pretty",
          options: { colorize: true, singleLine: false },
        }
      : undefined,
});
