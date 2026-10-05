// SPDX-License-Identifier: MIT OR Apache-2.0
// The editor composes the shared @shenron/ui primitives: these tests pin the hooks its
// stylesheet targets (`data-slot`, `data-koharu-ui-layer`) and the keyboard behaviour.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "bun:test";
import { TooltipProvider } from "@aphrody/m3-primitives";

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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "../../../src/koharu/internal/components/dropdown-menu";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "../../../src/koharu/internal/components/input-group";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "../../../src/koharu/internal/components/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../src/koharu/internal/components/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../../src/koharu/internal/components/tooltip";

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

describe("shared overlays in the editor", () => {
  it("opens a positioned popover and returns focus on Escape", async () => {
    const user = userEvent.setup();
    render(
      <Popover>
        <PopoverTrigger render={<Button />}>Brush size</PopoverTrigger>
        <PopoverContent side="right" align="start">
          <PopoverTitle>Brush</PopoverTitle>
          <input aria-label="Diameter" />
        </PopoverContent>
      </Popover>,
    );

    const trigger = screen.getByRole("button", { name: "Brush size" });
    expect(trigger).toHaveAttribute("data-slot", "popover-trigger");
    await user.click(trigger);
    const content = await screen.findByRole("dialog");
    expect(content).toHaveAttribute("data-koharu-ui-layer");
    expect(content).toHaveAttribute("data-slot", "popover-content");
    expect(content).toHaveAttribute("data-side", "right");
    expect(content).toHaveAttribute("data-align", "start");

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("shows a tooltip on keyboard focus on the requested side", async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider delay={0}>
        <Tooltip>
          <TooltipTrigger render={<Button aria-label="Settings" />}>S</TooltipTrigger>
          <TooltipContent side="right">Open settings</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );

    await user.tab();
    expect(screen.getByRole("button", { name: "Settings" })).toHaveAttribute(
      "data-slot",
      "tooltip-trigger",
    );
    const tip = await screen.findByText("Open settings");
    expect(tip).toHaveAttribute("data-slot", "tooltip-content");
    expect(tip).toHaveAttribute("data-side", "right");
    expect(tip).toHaveAttribute("data-koharu-ui-layer");
  });

  it("picks a radio item of a dropdown menu from the keyboard", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button />}>Font size</DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuRadioGroup value="12" onValueChange={onValueChange}>
            <DropdownMenuRadioItem value="12">12</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="14">14</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    const trigger = screen.getByRole("button", { name: "Font size" });
    expect(trigger).toHaveAttribute("data-slot", "dropdown-menu-trigger");
    trigger.focus();
    await user.keyboard("{Enter}");
    const menu = await screen.findByRole("menu");
    expect(menu).toHaveAttribute("data-koharu-ui-layer");
    expect(menu).toHaveAttribute("data-align", "end");

    await user.keyboard("{ArrowDown}");
    await waitFor(() =>
      expect(screen.getByRole("menuitemradio", { name: "14" })).toHaveAttribute("data-highlighted"),
    );
    await user.keyboard("{Enter}");
    await waitFor(() => expect(onValueChange).toHaveBeenCalled());
    expect(onValueChange.mock.calls[0]?.[0]).toBe("14");
  });

  it("chooses a select option and keeps the trigger hooks", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <Select defaultValue="Auto" onValueChange={onValueChange}>
        <SelectTrigger size="sm" aria-label="Text direction">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="Auto">Auto</SelectItem>
          <SelectItem value="Vertical">Vertical</SelectItem>
        </SelectContent>
      </Select>,
    );

    const trigger = screen.getByRole("combobox", { name: "Text direction" });
    expect(trigger).toHaveAttribute("data-slot", "select-trigger");
    expect(trigger).toHaveAttribute("data-size", "sm");
    await user.click(trigger);
    const list = await screen.findByRole("listbox");
    expect(list.closest("[data-slot=select-content]")).toHaveAttribute("data-koharu-ui-layer");

    await user.click(screen.getByRole("option", { name: "Vertical" }));
    await waitFor(() => expect(onValueChange).toHaveBeenCalled());
    expect(onValueChange.mock.calls[0]?.[0]).toBe("Vertical");
    await waitFor(() => expect(trigger).toHaveTextContent("Vertical"));
  });
});
