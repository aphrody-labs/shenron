"use client";

import { Select as SelectPrimitive } from "@base-ui/react/select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import type * as React from "react";

import { cn } from "../lib/utils";
import { SurfaceScope, useSurface, type SurfaceVariant } from "./surface";

const Select = SelectPrimitive.Root;

function SelectGroup(props: React.ComponentProps<typeof SelectPrimitive.Group>) {
  return <SelectPrimitive.Group data-slot="select-group" {...props} />;
}

function SelectPortal(props: React.ComponentProps<typeof SelectPrimitive.Portal>) {
  return <SelectPrimitive.Portal data-slot="select-portal" {...props} />;
}

function SelectTrigger({
  className,
  children,
  variant,
  size = "default",
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger> & {
  variant?: SurfaceVariant;
  /** `sm` is the dense trigger of toolbars and inspectors. */
  size?: "default" | "sm";
}) {
  const surface = useSurface();
  const planche = (variant ?? surface.variant) === "planche";
  const sm = size === "sm";
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        planche
          ? [
              "inline-flex w-full items-center justify-between gap-2 rounded-lg border border-input bg-transparent text-foreground outline-none transition-colors",
              "hover:border-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 data-[popup-open]:border-ring",
              "data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
              sm ? "h-7 gap-1 px-2 text-xs" : "h-9 px-3 text-sm",
            ]
          : [
              "inline-flex w-full items-center justify-between rounded-xl border-2 border-black bg-[#121218] font-semibold uppercase tracking-wider text-gray-100 shadow-[2.5px_2.5px_0px_#000] outline-none transition-all",
              "hover:border-dbz-orange/70 hover:shadow-[3.5px_3.5px_0px_#000] active:translate-x-px active:translate-y-px active:shadow-none focus-visible:border-dbz-orange focus-visible:ring-2 focus-visible:ring-dbz-orange",
              sm ? "h-8 gap-1.5 px-2.5 py-1 text-[11px]" : "h-10 px-3.5 py-2 text-xs",
            ],
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon
        data-slot="select-icon"
        className={planche ? "text-muted-foreground" : "text-white/60"}
      >
        <ChevronDown className={sm ? "size-3.5" : "size-4"} />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

function SelectValue({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return (
    <SelectPrimitive.Value
      data-slot="select-value"
      className={cn("line-clamp-1 text-left font-medium", className)}
      {...props}
    />
  );
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpArrow>) {
  return (
    <SelectPrimitive.ScrollUpArrow
      data-slot="select-scroll-up-button"
      className={cn(
        "top-0 z-10 flex w-full cursor-default items-center justify-center bg-inherit py-1",
        className,
      )}
      {...props}
    >
      <ChevronUp className="size-4" />
    </SelectPrimitive.ScrollUpArrow>
  );
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownArrow>) {
  return (
    <SelectPrimitive.ScrollDownArrow
      data-slot="select-scroll-down-button"
      className={cn(
        "bottom-0 z-10 flex w-full cursor-default items-center justify-center bg-inherit py-1",
        className,
      )}
      {...props}
    >
      <ChevronDown className="size-4" />
    </SelectPrimitive.ScrollDownArrow>
  );
}

function SelectPopup({
  className,
  children,
  variant,
  side,
  align,
  sideOffset = 6,
  alignOffset,
  alignItemWithTrigger,
  portalContainer,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Popup> &
  Pick<
    SelectPrimitive.Positioner.Props,
    "side" | "align" | "sideOffset" | "alignOffset" | "alignItemWithTrigger"
  > & {
    variant?: SurfaceVariant;
    /** Keep public media menus inside the browser's fullscreen element. */
    portalContainer?: HTMLElement | null;
  }) {
  const surface = useSurface();
  const resolved = variant ?? surface.variant ?? "toriyama";
  const planche = resolved === "planche";
  return (
    <SelectPortal container={portalContainer ?? undefined}>
      <SelectPrimitive.Positioner
        data-slot="select-positioner"
        side={side}
        align={align}
        sideOffset={sideOffset}
        alignOffset={alignOffset}
        alignItemWithTrigger={alignItemWithTrigger}
        className="z-50 outline-none"
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          {...surface.portalAttributes}
          className={cn(
            planche
              ? "relative z-50 max-h-[var(--available-height)] min-w-[var(--anchor-width)] origin-[var(--transform-origin)] overflow-x-hidden overflow-y-auto rounded-lg border border-border bg-popover p-1 text-sm text-popover-foreground outline-none transition-[opacity,scale] duration-150 select-none"
              : "relative z-50 max-h-72 min-w-[var(--anchor-width)] overflow-y-auto rounded-xl border-2 border-black bg-[#0d0d14] p-1.5 text-gray-100 shadow-[5px_5px_0px_#000] outline-none transition-all select-none",
            "data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
            className,
          )}
          {...props}
        >
          {!planche && (
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-dbz-orange via-dbz-yellow to-dbz-orange" />
          )}
          <SurfaceScope variant={resolved}>
            <SelectScrollUpButton />
            <SelectPrimitive.List
              data-slot="select-list"
              className={planche ? undefined : "space-y-0.5"}
            >
              {children}
            </SelectPrimitive.List>
            <SelectScrollDownButton />
          </SurfaceScope>
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPortal>
  );
}

function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  const planche = useSurface().variant === "planche";
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        planche
          ? "relative flex min-h-7 w-full cursor-default select-none items-center gap-1.5 rounded-md py-1 pr-7 pl-2 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0"
          : [
              "relative flex cursor-pointer select-none items-center rounded-lg py-2 pl-9 pr-3 text-xs font-semibold uppercase tracking-wider outline-none transition-colors",
              "data-[highlighted]:bg-dbz-orange data-[highlighted]:text-black text-gray-200",
            ],
        className,
      )}
      {...props}
    >
      <span
        data-slot="select-item-indicator"
        className={
          planche
            ? "pointer-events-none absolute right-2 flex size-4 items-center justify-center"
            : "absolute left-2.5 flex size-4 items-center justify-center"
        }
      >
        <SelectPrimitive.ItemIndicator>
          <Check className={planche ? "size-3.5" : "size-3.5 stroke-[3]"} />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText
        data-slot="select-item-text"
        className={planche ? "min-w-0 flex-1 truncate" : undefined}
      >
        {children}
      </SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

function SelectLabel({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.GroupLabel>) {
  const planche = useSurface().variant === "planche";
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-label"
      className={cn(
        planche
          ? "px-2 py-1.5 text-xs font-medium text-muted-foreground"
          : "px-3 py-1.5 text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-dbz-yellow/80",
        className,
      )}
      {...props}
    />
  );
}

function SelectSeparator({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Separator>) {
  const planche = useSurface().variant === "planche";
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn(
        planche
          ? "-mx-1 my-1 h-px bg-border"
          : "-mx-1 my-1.5 h-0.5 bg-black/60 border-b border-white/5",
        className,
      )}
      {...props}
    />
  );
}

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectPortal,
  SelectPopup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
};
