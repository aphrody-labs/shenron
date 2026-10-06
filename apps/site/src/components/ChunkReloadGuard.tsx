"use client";

import { useEffect } from "react";
import { browserReloadDeps, recoverFromChunkError } from "@/lib/chunk-reload";

/** Listens for chunk load failures anywhere on the page and reloads once (`lib/chunk-reload`). */
export function ChunkReloadGuard() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      recoverFromChunkError(event.error ?? { message: event.message }, browserReloadDeps());
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      recoverFromChunkError(event.reason, browserReloadDeps());
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
