"use client";

// Editor adapter over the shared alert dialog: the popup joins the editor portal layer, every
// part keeps its data-slot hook, and the colours follow the host M3 roles. Media, Action and
// Cancel are the parts the shared kit does not ship yet; they compose its Close and Button.
import type * as React from "react";

import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription as SharedAlertDialogDescription,
  AlertDialogFooter as SharedAlertDialogFooter,
  AlertDialogHeader as SharedAlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle as SharedAlertDialogTitle,
} from "../../../components/alert-dialog";
import { Button } from "../../../components/button";
import { cn } from "../../../lib/utils";

function AlertDialogContent({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPopup>) {
  return (
    <AlertDialogPopup
      data-koharu-ui-layer=""
      data-slot="alert-dialog-content"
      className={cn("bg-popover text-popover-foreground", className)}
      {...props}
    />
  );
}

function AlertDialogHeader(props: React.ComponentProps<typeof SharedAlertDialogHeader>) {
  return <SharedAlertDialogHeader data-slot="alert-dialog-header" {...props} />;
}

function AlertDialogFooter(props: React.ComponentProps<typeof SharedAlertDialogFooter>) {
  return <SharedAlertDialogFooter data-slot="alert-dialog-footer" {...props} />;
}

function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof SharedAlertDialogTitle>) {
  return (
    <SharedAlertDialogTitle
      data-slot="alert-dialog-title"
      className={cn("text-inherit", className)}
      {...props}
    />
  );
}

function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof SharedAlertDialogDescription>) {
  return (
    <SharedAlertDialogDescription
      data-slot="alert-dialog-description"
      className={cn("text-muted-foreground", className)}
      {...props}
    />
  );
}

function AlertDialogMedia({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-media"
      className={cn(
        "mb-2 inline-flex size-10 items-center justify-center rounded-md bg-muted *:[svg:not([class*='size-'])]:size-6",
        className,
      )}
      {...props}
    />
  );
}

function AlertDialogAction(props: React.ComponentProps<typeof Button>) {
  return <Button data-slot="alert-dialog-action" {...props} />;
}

function AlertDialogCancel({
  variant = "outline",
  size = "default",
  ...props
}: React.ComponentProps<typeof AlertDialogClose> &
  Pick<React.ComponentProps<typeof Button>, "variant" | "size">) {
  return (
    <AlertDialogClose
      data-slot="alert-dialog-cancel"
      render={<Button variant={variant} size={size} />}
      {...props}
    />
  );
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
};
