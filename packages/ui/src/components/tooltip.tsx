"use client";

import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import type * as React from "react";

import { cn } from "../lib/utils";
import { useSurface } from "./surface";

const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;

function TooltipTrigger(props: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

function TooltipPortal(props: React.ComponentProps<typeof TooltipPrimitive.Portal>) {
  return <TooltipPrimitive.Portal data-slot="tooltip-portal" {...props} />;
}

function TooltipPopup({
  className,
  variant,
  side,
  align,
  sideOffset = 6,
  alignOffset,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Popup> &
  Pick<TooltipPrimitive.Positioner.Props, "side" | "align" | "sideOffset" | "alignOffset"> & {
    variant?: "comic" | "scouter" | "ki" | "planche";
  }) {
  const surface = useSurface();
  const resolved = variant ?? (surface.variant === "planche" ? "planche" : "comic");
  const variantStyles = {
    comic:
      "rounded-lg px-3 py-1.5 border-2 border-black bg-white text-black font-extrabold shadow-[2px_2px_0px_#000] text-xs uppercase tracking-wide",
    scouter:
      "rounded-lg px-3 py-1.5 border border-green-500/80 bg-[#061408]/95 text-green-300 font-mono text-[11px] shadow-[0_0_12px_rgba(34,197,94,0.3)] tracking-wider",
    ki: "rounded-lg px-3 py-1.5 border-2 border-black bg-[#121018] text-dbz-orange font-bold text-xs shadow-[2.5px_2.5px_0px_#000]",
    planche:
      "inline-flex w-fit max-w-xs origin-[var(--transform-origin)] items-center gap-1.5 rounded-md bg-foreground px-2.5 py-1.5 text-xs text-background",
  };

  return (
    <TooltipPortal>
      <TooltipPrimitive.Positioner
        data-slot="tooltip-positioner"
        side={side}
        align={align}
        sideOffset={sideOffset}
        alignOffset={alignOffset}
        className="z-50"
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          {...surface.portalAttributes}
          className={cn(
            "relative z-50 transition-all duration-150 outline-none select-none",
            "data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
            variantStyles[resolved],
            className,
          )}
          {...props}
        />
      </TooltipPrimitive.Positioner>
    </TooltipPortal>
  );
}

export { TooltipProvider, Tooltip, TooltipTrigger, TooltipPortal, TooltipPopup };
