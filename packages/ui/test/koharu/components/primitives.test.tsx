// SPDX-License-Identifier: MIT OR Apache-2.0
// The editor composes the shared @shenron/ui primitives: these tests pin the hooks its
// stylesheet targets (`data-slot`, `data-koharu-ui-layer`) and the keyboard behaviour.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "bun:test";

import { Button } from "@shenron/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../../src/koharu/internal/components/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../../src/koharu/internal/components/dialog";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "../../../src/koharu/internal/components/input-group";

describe("shared field primitives in the editor", () => {
  it("keeps the slots the editor stylesheet targets", () => {
    render(
      <>
        <Button>Run</Button>
        <InputGroup>
          <InputGroupAddon>Find</InputGroupAddon>
          <InputGroupInput aria-label="Search" />
        </InputGroup>
      </>,
    );

    expect(screen.getByRole("button", { name: "Run" })).toHaveAttribute("data-slot", "button");
    const search = screen.getByRole("textbox", { name: "Search" });
    expect(search).toHaveAttribute("data-slot", "input-group-control");
    // A transparent field inherits the surface text colour instead of the kit's light ink.
    expect(search).toHaveClass("bg-transparent", "text-inherit");
    expect(search).not.toHaveClass("text-gray-100");
  });

  it("activates a button with Enter and Space", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Run</Button>);

    await user.tab();
    expect(screen.getByRole("button", { name: "Run" })).toHaveFocus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("focuses the grouped input when its addon is clicked", async () => {
    const user = userEvent.setup();
    render(
      <InputGroup>
        <InputGroupAddon>Find</InputGroupAddon>
        <InputGroupInput aria-label="Search" />
      </InputGroup>,
    );

    await user.click(screen.getByText("Find"));
    expect(screen.getByRole("textbox", { name: "Search" })).toHaveFocus();
  });
});

describe("shared dialogs in the editor", () => {
  it("opens the dialog in the editor layer and closes it with Escape", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename page</DialogTitle>
            <DialogDescription>Choose a new name.</DialogDescription>
          </DialogHeader>
          <input aria-label="Page name" />
        </DialogContent>
      </Dialog>,
    );

    const dialog = await screen.findByRole("dialog", { name: "Rename page" });
    expect(dialog).toHaveAttribute("data-koharu-ui-layer");
    expect(dialog).toHaveAttribute("data-slot", "dialog-content");
    expect(dialog).toHaveClass("bg-popover", "text-popover-foreground");
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    await user.keyboard("{Escape}");
    await waitFor(() => expect(onOpenChange).toHaveBeenCalled());
    expect(onOpenChange.mock.calls[0]?.[0]).toBe(false);
  });

  it("confirms or cancels from the alert dialog", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn();
    render(
      <AlertDialog open onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete project?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={onConfirm}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>,
    );

    const dialog = await screen.findByRole("alertdialog", { name: "Delete project?" });
    expect(dialog).toHaveAttribute("data-koharu-ui-layer");
    expect(dialog).toHaveAttribute("data-slot", "alert-dialog-content");
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalled());
    expect(onOpenChange.mock.calls[0]?.[0]).toBe(false);
  });
});
