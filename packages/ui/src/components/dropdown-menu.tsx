"use client";

import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { Check, ChevronRight } from "lucide-react";
import type * as React from "react";

import { cn } from "../lib/utils";
import { SurfaceScope, useSurface, type SurfaceVariant } from "./surface";

const DropdownMenu = MenuPrimitive.Root;
const DropdownMenuSub = MenuPrimitive.SubmenuRoot;

function DropdownMenuTrigger(props: React.ComponentProps<typeof MenuPrimitive.Trigger>) {
  return <MenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />;
}

function DropdownMenuPortal(props: React.ComponentProps<typeof MenuPrimitive.Portal>) {
  return <MenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />;
}

function DropdownMenuGroup(props: React.ComponentProps<typeof MenuPrimitive.Group>) {
  return <MenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />;
}

function DropdownMenuRadioGroup(props: React.ComponentProps<typeof MenuPrimitive.RadioGroup>) {
  return <MenuPrimitive.RadioGroup data-slot="dropdown-menu-radio-group" {...props} />;
}

type DropdownMenuPopupProps = React.ComponentProps<typeof MenuPrimitive.Popup> &
  Pick<MenuPrimitive.Positioner.Props, "side" | "align" | "sideOffset" | "alignOffset"> & {
    variant?: SurfaceVariant;
  };

function DropdownMenuPopup({
  className,
  children,
  variant,
  side,
  align,
  sideOffset = 6,
  alignOffset,
  ...props
}: DropdownMenuPopupProps) {
  const surface = useSurface();
  const resolved = variant ?? surface.variant ?? "toriyama";
  const planche = resolved === "planche";
  return (
    <DropdownMenuPortal>
      <MenuPrimitive.Positioner
        data-slot="dropdown-menu-positioner"
        side={side}
        align={align}
        sideOffset={sideOffset}
        alignOffset={alignOffset}
        className="z-50 outline-none"
      >
        <MenuPrimitive.Popup
          data-slot="dropdown-menu-content"
          {...surface.portalAttributes}
          className={cn(
            planche
              ? "relative z-50 max-h-[var(--available-height)] min-w-32 origin-[var(--transform-origin)] overflow-x-hidden overflow-y-auto rounded-lg border border-border bg-popover p-1 text-sm text-popover-foreground outline-none transition-[opacity,scale] duration-150 select-none"
              : "relative z-50 min-w-[12rem] overflow-hidden rounded-xl border-2 border-black bg-[#0d0d12] p-1.5 text-gray-100 shadow-[4px_4px_0px_#000] outline-none transition-all duration-150 select-none",
            "data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
            className,
          )}
          {...props}
        >
          {!planche && (
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-dbz-orange via-dbz-yellow to-dbz-orange" />
          )}
          <SurfaceScope variant={resolved}>{children}</SurfaceScope>
        </MenuPrimitive.Popup>
      </MenuPrimitive.Positioner>
    </DropdownMenuPortal>
  );
}

/** The popup of a submenu: it opens beside its trigger, its first item level with it. */
function DropdownMenuSubContent({
  sideOffset = 0,
  alignOffset = -4,
  ...props
}: DropdownMenuPopupProps) {
  return (
    <DropdownMenuPopup
      data-slot="dropdown-menu-sub-content"
      sideOffset={sideOffset}
      alignOffset={alignOffset}
      {...props}
    />
  );
}

const plancheItem =
  "relative flex cursor-default select-none items-center gap-1.5 rounded-md px-2 py-1.5 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[inset]:pl-8 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";

function DropdownMenuItem({
  className,
  variant = "default",
  inset,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.Item> & {
  variant?: "default" | "destructive" | "saiyan";
  /** Aligns the label with items that carry a leading indicator. */
  inset?: boolean;
}) {
  const planche = useSurface().variant === "planche";
  const variants = planche
    ? {
        default: "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
        destructive:
          "text-destructive data-[highlighted]:bg-destructive/10 data-[highlighted]:text-destructive",
        saiyan:
          "font-semibold text-primary data-[highlighted]:bg-primary data-[highlighted]:text-primary-foreground",
      }
    : {
        default:
          "text-gray-200 hover:bg-white/10 hover:text-white data-[highlighted]:bg-white/10 data-[highlighted]:text-white",
        destructive:
          "text-red-400 hover:bg-red-500/20 hover:text-red-300 data-[highlighted]:bg-red-500/20 data-[highlighted]:text-red-300",
        saiyan:
          "text-dbz-yellow hover:bg-dbz-orange hover:text-black data-[highlighted]:bg-dbz-orange data-[highlighted]:text-black font-bold",
      };

  return (
    <MenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-variant={variant}
      data-inset={inset || undefined}
      className={cn(
        planche
          ? plancheItem
          : "relative flex cursor-pointer select-none items-center gap-2 rounded-lg px-3 py-2 text-xs font-sans font-semibold uppercase tracking-wider outline-none transition-colors data-[inset]:pl-9",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.CheckboxItem>) {
  const planche = useSurface().variant === "planche";
  return (
    <MenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      checked={checked}
      className={cn(
        planche
          ? cn(
              plancheItem,
              "pr-8 data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
            )
          : "relative flex cursor-pointer select-none items-center rounded-lg py-2 pl-9 pr-3 text-xs font-semibold uppercase tracking-wider outline-none transition-colors data-[highlighted]:bg-white/10",
        className,
      )}
      {...props}
    >
      <span
        data-slot="dropdown-menu-checkbox-item-indicator"
        className={
          planche
            ? "pointer-events-none absolute right-2 flex size-4 items-center justify-center"
            : "absolute left-2.5 flex size-4 items-center justify-center rounded border border-black bg-black/60 text-dbz-orange"
        }
      >
        <MenuPrimitive.CheckboxItemIndicator>
          <Check className={planche ? "size-4" : "size-3 stroke-[3]"} />
        </MenuPrimitive.CheckboxItemIndicator>
      </span>
      {children}
    </MenuPrimitive.CheckboxItem>
  );
}

function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.RadioItem>) {
  const planche = useSurface().variant === "planche";
  return (
    <MenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      className={cn(
        planche
          ? cn(
              plancheItem,
              "pr-8 data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
            )
          : "relative flex cursor-pointer select-none items-center rounded-lg py-2 pl-9 pr-3 text-xs font-semibold uppercase tracking-wider outline-none transition-colors data-[highlighted]:bg-white/10",
        className,
      )}
      {...props}
    >
      <span
        data-slot="dropdown-menu-radio-item-indicator"
        className={
          planche
            ? "pointer-events-none absolute right-2 flex size-4 items-center justify-center"
            : "absolute left-2.5 flex size-4 items-center justify-center rounded-full border border-black bg-black/60 text-dbz-orange"
        }
      >
        <MenuPrimitive.RadioItemIndicator>
          {planche ? (
            <Check className="size-4" />
          ) : (
            <span className="block size-2 rounded-full bg-current" />
          )}
        </MenuPrimitive.RadioItemIndicator>
      </span>
      {children}
    </MenuPrimitive.RadioItem>
  );
}

function DropdownMenuSubTrigger({
  className,
  children,
  inset,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.SubmenuTrigger> & {
  /** Aligns the label with items that carry a leading indicator. */
  inset?: boolean;
}) {
  const planche = useSurface().variant === "planche";
  return (
    <MenuPrimitive.SubmenuTrigger
      data-slot="dropdown-menu-sub-trigger"
      data-inset={inset || undefined}
      className={cn(
        planche
          ? cn(
              plancheItem,
              "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[popup-open]:bg-accent data-[popup-open]:text-accent-foreground",
            )
          : "relative flex cursor-pointer select-none items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-200 outline-none transition-colors data-[highlighted]:bg-white/10 data-[highlighted]:text-white data-[inset]:pl-9 data-[popup-open]:bg-white/10 data-[popup-open]:text-white",
        className,
      )}
      {...props}
    >
      {children}
      <ChevronRight data-slot="dropdown-menu-sub-trigger-icon" className="ml-auto size-4" />
    </MenuPrimitive.SubmenuTrigger>
  );
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.Separator>) {
  const planche = useSurface().variant === "planche";
  return (
    <MenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn(
        planche
          ? "-mx-1 my-1 h-px bg-border"
          : "-mx-1.5 my-1.5 h-0.5 bg-black/60 border-b border-white/5",
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.GroupLabel> & {
  /** Aligns the label with items that carry a leading indicator. */
  inset?: boolean;
}) {
  const planche = useSurface().variant === "planche";
  return (
    <MenuPrimitive.GroupLabel
      data-slot="dropdown-menu-label"
      data-inset={inset || undefined}
      className={cn(
        planche
          ? "px-2 py-1.5 text-xs font-medium text-muted-foreground data-[inset]:pl-8"
          : "px-3 py-1 text-[10px] font-mono uppercase tracking-[0.2em] text-dbz-yellow/80 font-bold data-[inset]:pl-9",
        className,
      )}
      {...props}
    />
  );
}

/** A keyboard shortcut shown at the end of an item. */
function DropdownMenuShortcut({ className, ...props }: React.ComponentProps<"span">) {
  const planche = useSurface().variant === "planche";
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn(
        "ml-auto text-xs tracking-widest",
        planche ? "text-muted-foreground" : "text-gray-400",
        className,
      )}
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuPopup,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuRadioGroup,
};
