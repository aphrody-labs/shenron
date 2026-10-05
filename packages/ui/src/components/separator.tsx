"use client";

import { Separator as SeparatorPrimitive } from "@base-ui/react/separator";
import type * as React from "react";

import { cn } from "../lib/utils";
import { useSurface } from "./surface";

function Separator({
  className,
  orientation = "horizontal",
  variant,
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive> & {
  variant?: "default" | "ki" | "speedline" | "planche";
}) {
  const surface = useSurface();
  const resolved = variant ?? (surface.variant === "planche" ? "planche" : "default");
  const horizontal = orientation === "horizontal";
  const variants = {
    default: "bg-black/80 border-b border-white/10",
    ki: "bg-gradient-to-r from-transparent via-dbz-orange to-transparent h-0.5",
    speedline: "bg-gradient-to-r from-white/40 via-dbz-yellow to-transparent h-0.5",
    planche: cn("bg-border", horizontal ? "h-px" : "w-px"),
  };

  return (
    <SeparatorPrimitive
      data-slot="separator"
      orientation={orientation}
      className={cn(
        "shrink-0",
        horizontal ? "h-0.5 w-full" : "h-full w-0.5",
        variants[resolved],
        className,
      )}
      {...props}
    />
  );
}

export { Separator };
