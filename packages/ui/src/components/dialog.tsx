"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import type * as React from "react";

import { cn } from "../lib/utils";
import { SurfaceScope, useSurface } from "./surface";

const Dialog = DialogPrimitive.Root;

function DialogTrigger(props: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal(props: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose(props: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogBackdrop({
  className,
  variant,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Backdrop> & {
  variant?: "toriyama" | "planche";
}) {
  const surface = useSurface();
  const planche = (variant ?? surface.variant) === "planche";
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        planche
          ? "fixed inset-0 z-50 bg-black/40 transition-opacity duration-150"
          : "fixed inset-0 z-50 bg-black/80 backdrop-blur-sm transition-all duration-200",
        "data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
        className,
      )}
      {...props}
    />
  );
}

function DialogPopup({
  className,
  children,
  variant,
  closeLabel = "Close",
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Popup> & {
  variant?: "toriyama" | "capsule" | "scouter" | "planche";
  /** Localized accessible name supplied by the host. */
  closeLabel?: string;
}) {
  const surface = useSurface();
  const resolved = variant ?? surface.variant ?? "toriyama";
  const planche = resolved === "planche";
  const variantStyles = {
    toriyama: "border-3 border-black bg-[#0d0d12] shadow-[6px_6px_0px_#000] text-gray-100",
    capsule:
      "border-2 border-dbz-blue-light/60 bg-[#080d1a] shadow-[0_0_25px_rgba(0,180,255,0.25)] text-white rounded-3xl",
    scouter:
      "border-2 border-green-500/80 bg-[#061208]/95 shadow-[0_0_20px_rgba(34,197,94,0.3)] text-green-300 font-mono",
    planche: "rounded-xl border border-border bg-popover p-6 text-popover-foreground",
  };

  return (
    <DialogPortal>
      <DialogBackdrop variant={planche ? "planche" : "toriyama"} />
      <DialogPrimitive.Viewport
        data-slot="dialog-viewport"
        className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4 sm:p-6"
      >
        <DialogPrimitive.Popup
          data-slot="dialog-content"
          {...surface.portalAttributes}
          className={cn(
            planche
              ? "relative w-full max-w-lg outline-none transition-[opacity,scale] duration-150"
              : "relative w-full max-w-lg rounded-2xl p-6 sm:p-8 transition-all duration-200 outline-none",
            "data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
            variantStyles[resolved],
            className,
          )}
          {...props}
        >
          {/* Dragon Ball Top Glow Aura */}
          {resolved === "toriyama" && (
            <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-dbz-orange via-dbz-yellow to-dbz-orange rounded-t-xl" />
          )}
          <SurfaceScope variant={planche ? "planche" : "toriyama"}>{children}</SurfaceScope>
          <DialogPrimitive.Close
            data-slot="dialog-close"
            aria-label={closeLabel}
            className={
              planche
                ? "absolute top-3 right-3 inline-flex size-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                : "absolute top-4 right-4 inline-flex size-11 items-center justify-center rounded-lg border-2 border-black bg-black/60 text-white/70 shadow-[2px_2px_0px_#000] transition-all hover:bg-dbz-orange hover:text-black active:translate-x-px active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dbz-yellow"
            }
          >
            <X className="size-4" />
          </DialogPrimitive.Close>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Viewport>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  const planche = useSurface().variant === "planche";
  return (
    <div
      data-slot="dialog-header"
      className={cn(
        planche
          ? "mb-4 flex flex-col gap-1.5 pr-10 text-left"
          : "flex flex-col space-y-2 text-center sm:text-left mb-6",
        className,
      )}
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  const planche = useSurface().variant === "planche";
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        planche
          ? "mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"
          : "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-3 gap-2 mt-6 pt-4 border-t border-black/40",
        className,
      )}
      {...props}
    />
  );
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  const planche = useSurface().variant === "planche";
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        planche
          ? "text-lg leading-tight font-semibold"
          : "font-saiyan text-2xl sm:text-3xl text-white tracking-wider uppercase drop-shadow-[0_2px_8px_rgba(255,107,0,0.3)]",
        className,
      )}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  const planche = useSurface().variant === "planche";
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        planche
          ? "text-sm text-muted-foreground"
          : "text-sm text-gray-300 leading-relaxed font-sans",
        className,
      )}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogClose,
  DialogBackdrop,
  DialogPopup,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
