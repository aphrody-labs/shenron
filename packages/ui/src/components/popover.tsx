"use client";

import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import type * as React from "react";

import { cn } from "../lib/utils";
import { SurfaceScope, useSurface, type SurfaceVariant } from "./surface";

const Popover = PopoverPrimitive.Root;

function PopoverTrigger(props: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverPortal(props: React.ComponentProps<typeof PopoverPrimitive.Portal>) {
  return <PopoverPrimitive.Portal data-slot="popover-portal" {...props} />;
}

function PopoverClose(props: React.ComponentProps<typeof PopoverPrimitive.Close>) {
  return <PopoverPrimitive.Close data-slot="popover-close" {...props} />;
}

type PopoverPlacement = Pick<
  PopoverPrimitive.Positioner.Props,
  "side" | "align" | "sideOffset" | "alignOffset"
>;

function PopoverPopup({
  className,
  children,
  variant,
  side,
  align,
  sideOffset = 8,
  alignOffset,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Popup> &
  PopoverPlacement & {
    variant?: SurfaceVariant;
  }) {
  const surface = useSurface();
  const resolved = variant ?? surface.variant ?? "toriyama";
  const planche = resolved === "planche";
  return (
    <PopoverPortal>
      <PopoverPrimitive.Positioner
        data-slot="popover-positioner"
        side={side}
        align={align}
        sideOffset={sideOffset}
        alignOffset={alignOffset}
        className="z-50 outline-none"
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          {...surface.portalAttributes}
          className={cn(
            planche
              ? "relative z-50 flex w-72 origin-[var(--transform-origin)] flex-col gap-2.5 rounded-lg border border-border bg-popover p-2.5 text-sm text-popover-foreground outline-none transition-[opacity,scale] duration-150"
              : "relative z-50 w-72 rounded-xl border-2 border-black bg-[#0e0e14] p-4 text-gray-100 shadow-[4px_4px_0px_#000] outline-none select-none transition-all duration-150",
            "data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
            className,
          )}
          {...props}
        >
          {!planche && (
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-dbz-orange via-dbz-yellow to-dbz-orange rounded-t-lg" />
          )}
          <SurfaceScope variant={resolved}>{children}</SurfaceScope>
        </PopoverPrimitive.Popup>
      </PopoverPrimitive.Positioner>
    </PopoverPortal>
  );
}

function PopoverHeader({ className, ...props }: React.ComponentProps<"div">) {
  const planche = useSurface().variant === "planche";
  return (
    <div
      data-slot="popover-header"
      className={cn(
        planche ? "flex flex-col gap-0.5 text-sm" : "mb-2 flex flex-col gap-1",
        className,
      )}
      {...props}
    />
  );
}

function PopoverTitle({
  className,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Title>) {
  const planche = useSurface().variant === "planche";
  return (
    <PopoverPrimitive.Title
      data-slot="popover-title"
      className={cn(
        planche
          ? "text-sm font-semibold"
          : "font-saiyan text-lg font-bold tracking-wider text-white mb-2",
        className,
      )}
      {...props}
    />
  );
}

function PopoverDescription({
  className,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Description>) {
  const planche = useSurface().variant === "planche";
  return (
    <PopoverPrimitive.Description
      data-slot="popover-description"
      className={cn(
        planche ? "text-sm text-muted-foreground" : "text-xs text-gray-300 leading-relaxed",
        className,
      )}
      {...props}
    />
  );
}

export {
  Popover,
  PopoverTrigger,
  PopoverPortal,
  PopoverPopup,
  PopoverHeader,
  PopoverTitle,
  PopoverDescription,
  PopoverClose,
};
