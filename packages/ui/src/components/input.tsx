"use client";

import type * as React from "react";

import { cn } from "../lib/utils";
import { useSurface, type SurfaceVariant } from "./surface";

function Input({
  className,
  type,
  variant,
  ...props
}: React.ComponentProps<"input"> & { variant?: SurfaceVariant }) {
  const surface = useSurface();
  const planche = (variant ?? surface.variant) === "planche";
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        planche
          ? [
              "flex h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-3 py-1.5 text-sm text-foreground transition-colors outline-none placeholder:text-muted-foreground",
              "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40",
              "disabled:cursor-not-allowed disabled:opacity-50",
              "aria-invalid:border-destructive",
            ]
          : [
              "flex h-10 w-full min-w-0 rounded-xl border-2 border-black/80 bg-[#121218] px-3.5 py-2 text-sm text-gray-100 transition-all outline-none selection:bg-dbz-orange selection:text-black placeholder:text-gray-500",
              "focus-visible:border-dbz-orange focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dbz-orange",
              "disabled:cursor-not-allowed disabled:opacity-50",
              "aria-invalid:border-destructive dark:aria-invalid:border-destructive/50",
            ],
        className,
      )}
      {...props}
    />
  );
}

export { Input };
