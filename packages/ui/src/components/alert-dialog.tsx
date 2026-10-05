"use client";

import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog";
import type * as React from "react";

import { cn } from "../lib/utils";
import { Button } from "./button";
import { SurfaceScope, useSurface } from "./surface";

const AlertDialog = AlertDialogPrimitive.Root;

function AlertDialogTrigger(props: React.ComponentProps<typeof AlertDialogPrimitive.Trigger>) {
  return <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />;
}

function AlertDialogPortal(props: React.ComponentProps<typeof AlertDialogPrimitive.Portal>) {
  return <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />;
}

function AlertDialogClose(props: React.ComponentProps<typeof AlertDialogPrimitive.Close>) {
  return <AlertDialogPrimitive.Close data-slot="alert-dialog-close" {...props} />;
}

function AlertDialogBackdrop({
  className,
  variant,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Backdrop> & {
  variant?: "toriyama" | "planche";
}) {
  const surface = useSurface();
  const planche = (variant ?? surface.variant) === "planche";
  return (
    <AlertDialogPrimitive.Backdrop
      data-slot="alert-dialog-overlay"
      className={cn(
        planche
          ? "fixed inset-0 z-50 bg-black/40 transition-opacity duration-150"
          : "fixed inset-0 z-50 bg-black/85 backdrop-blur-md transition-all duration-200",
        "data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
        className,
      )}
      {...props}
    />
  );
}

function AlertDialogPopup({
  className,
  children,
  variant,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Popup> & {
  variant?: "shenron" | "danger" | "saiyan" | "planche";
}) {
  const surface = useSurface();
  const resolved = variant ?? (surface.variant === "planche" ? "planche" : "shenron");
  const planche = resolved === "planche";
  const variants = {
    shenron: "border-3 border-black bg-[#0d0d14] shadow-[8px_8px_0px_#000] text-gray-100",
    danger:
      "border-3 border-red-600/90 bg-[#140608] shadow-[0_0_30px_rgba(220,38,38,0.4)] text-red-200",
    saiyan:
      "border-3 border-dbz-orange bg-[#120a04] shadow-[0_0_30px_rgba(255,107,0,0.4)] text-amber-100",
    planche: "rounded-xl border border-border bg-popover p-6 text-popover-foreground",
  };

  return (
    <AlertDialogPortal>
      <AlertDialogBackdrop variant={planche ? "planche" : "toriyama"} />
      <AlertDialogPrimitive.Viewport
        data-slot="alert-dialog-viewport"
        className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4 sm:p-6"
      >
        <AlertDialogPrimitive.Popup
          data-slot="alert-dialog-content"
          {...surface.portalAttributes}
          className={cn(
            planche
              ? "relative w-full max-w-md outline-none transition-[opacity,scale] duration-150"
              : "relative w-full max-w-md rounded-2xl p-6 sm:p-8 transition-all duration-200 outline-none",
            "data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
            variants[resolved],
            className,
          )}
          {...props}
        >
          {resolved === "shenron" && (
            <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-green-500 via-emerald-400 to-green-500 rounded-t-xl" />
          )}
          {resolved === "danger" && (
            <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-red-600 via-rose-500 to-red-600 rounded-t-xl" />
          )}
          <SurfaceScope variant={planche ? "planche" : "toriyama"}>{children}</SurfaceScope>
        </AlertDialogPrimitive.Popup>
      </AlertDialogPrimitive.Viewport>
    </AlertDialogPortal>
  );
}

function AlertDialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  const planche = useSurface().variant === "planche";
  return (
    <div
      data-slot="alert-dialog-header"
      className={cn(
        planche
          ? "mb-4 flex flex-col gap-1.5 text-left"
          : "flex flex-col space-y-2 text-center sm:text-left mb-6",
        className,
      )}
      {...props}
    />
  );
}

function AlertDialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  const planche = useSurface().variant === "planche";
  return (
    <div
      data-slot="alert-dialog-footer"
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

/** An icon or illustration above the title. */
function AlertDialogMedia({ className, ...props }: React.ComponentProps<"div">) {
  const planche = useSurface().variant === "planche";
  return (
    <div
      data-slot="alert-dialog-media"
      className={cn(
        "mb-2 inline-flex size-10 items-center justify-center *:[svg:not([class*='size-'])]:size-6",
        planche
          ? "rounded-md bg-muted text-foreground"
          : "rounded-lg border-2 border-black bg-black/60 text-dbz-orange",
        className,
      )}
      {...props}
    />
  );
}

function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
  const planche = useSurface().variant === "planche";
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn(
        planche
          ? "text-lg leading-tight font-semibold"
          : "font-saiyan text-2xl sm:text-3xl font-bold uppercase tracking-wider text-white drop-shadow-[0_2px_8px_rgba(255,107,0,0.3)]",
        className,
      )}
      {...props}
    />
  );
}

function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
  const planche = useSurface().variant === "planche";
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
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

/** The confirming action. It does not close the dialog by itself: the host decides when. */
function AlertDialogAction(props: React.ComponentProps<typeof Button>) {
  return <Button data-slot="alert-dialog-action" {...props} />;
}

/** Dismisses the dialog; rendered as an outline button unless told otherwise. */
function AlertDialogCancel({
  variant = "outline",
  size = "default",
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Close> &
  Pick<React.ComponentProps<typeof Button>, "variant" | "size">) {
  return (
    <AlertDialogPrimitive.Close
      data-slot="alert-dialog-cancel"
      render={<Button variant={variant} size={size} />}
      {...props}
    />
  );
}

export {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogPortal,
  AlertDialogClose,
  AlertDialogBackdrop,
  AlertDialogPopup,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
};
