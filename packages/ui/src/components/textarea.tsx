"use client";

import type * as React from "react";

import { cn } from "../lib/utils";
import { useSurface, type SurfaceVariant } from "./surface";

function Textarea({
  className,
  variant,
  ...props
}: React.ComponentProps<"textarea"> & { variant?: SurfaceVariant }) {
  const surface = useSurface();
  const planche = (variant ?? surface.variant) === "planche";
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        planche
          ? [
              "field-sizing-content flex min-h-16 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm text-foreground transition-colors outline-none placeholder:text-muted-foreground",
              "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40",
              "disabled:cursor-not-allowed disabled:opacity-50",
              "aria-invalid:border-destructive",
            ]
          : [
              "field-sizing-content flex min-h-20 w-full rounded-xl border-2 border-black/80 bg-[#121218] px-3.5 py-2.5 text-sm text-gray-100 shadow-[2px_2px_0px_#000] transition-all outline-none selection:bg-dbz-orange selection:text-black placeholder:text-gray-400",
              "focus-visible:border-dbz-orange focus-visible:shadow-[3px_3px_0px_#000] focus-visible:ring-2 focus-visible:ring-dbz-orange",
              "disabled:cursor-not-allowed disabled:opacity-50",
              "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
            ],
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
