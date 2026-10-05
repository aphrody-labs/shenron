"use client";

// Editor adapter over the shared dialog: the popup joins the editor portal layer, every part
// keeps the data-slot hook the editor stylesheet targets, and the colours follow the host M3
// roles so the light scheme keeps its contrast.
import type * as React from "react";

import {
  Dialog,
  DialogDescription as SharedDialogDescription,
  DialogFooter as SharedDialogFooter,
  DialogHeader as SharedDialogHeader,
  DialogPopup,
  DialogTitle as SharedDialogTitle,
} from "../../../components/dialog";
import { cn } from "../../../lib/utils";

function DialogContent({ className, ...props }: React.ComponentProps<typeof DialogPopup>) {
  return (
    <DialogPopup
      data-koharu-ui-layer=""
      data-slot="dialog-content"
      className={cn("bg-popover text-popover-foreground", className)}
      {...props}
    />
  );
}

function DialogHeader(props: React.ComponentProps<typeof SharedDialogHeader>) {
  return <SharedDialogHeader data-slot="dialog-header" {...props} />;
}

function DialogFooter(props: React.ComponentProps<typeof SharedDialogFooter>) {
  return <SharedDialogFooter data-slot="dialog-footer" {...props} />;
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof SharedDialogTitle>) {
  return (
    <SharedDialogTitle
      data-slot="dialog-title"
      className={cn("text-inherit", className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof SharedDialogDescription>) {
  return (
    <SharedDialogDescription
      data-slot="dialog-description"
      className={cn("text-muted-foreground", className)}
      {...props}
    />
  );
}

export { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle };
