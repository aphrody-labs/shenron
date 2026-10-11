// SPDX-License-Identifier: MIT OR Apache-2.0
// The editor imports the shared @aphrody/shenron-ui kit directly under its planche scope: these tests
// pin the hooks its stylesheet targets (`data-slot`, `data-koharu-ui-layer`), the semantic
// surface it paints on the host M3 roles, and the keyboard behaviour.
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "bun:test";
import { Toaster, TooltipProvider } from "@aphrody/m3-primitives";
import type { ReactNode } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogPopup,
  AlertDialogTitle,
} from "@aphrody/shenron-ui/alert-dialog";
import { Button } from "@aphrody/shenron-ui/button";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "@aphrody/shenron-ui/dialog";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuPopup,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@aphrody/shenron-ui/dropdown-menu";
import { Input } from "@aphrody/shenron-ui/input";
import i18n, { resources } from "@aphrody/shenron-ui/koharu/lib/i18n";
import { receiveError } from "@aphrody/shenron-ui/koharu/lib/store";
import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from "@aphrody/shenron-ui/popover";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@aphrody/shenron-ui/select";
import { Slider } from "@aphrody/shenron-ui/slider";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@aphrody/shenron-ui/tooltip";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "../../../src/koharu/internal/components/input-group";
import { KoharuSurface } from "../../../src/koharu/internal/surface";

/** Renders inside the scope `KoharuApp` puts around the whole editor. */
function renderInEditor(ui: ReactNode) {
  return render(<KoharuSurface>{ui}</KoharuSurface>);
}

/** The decorative band the site's toriyama popups paint; the editor never shows it. */
const band = (popup: HTMLElement) => popup.querySelector(":scope > .bg-gradient-to-r");

describe("shared field primitives in the editor", () => {
  it("keeps the slots the editor stylesheet targets", () => {
    renderInEditor(
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

  it("paints the one editor input on the host roles", () => {
    renderInEditor(<Input aria-label="Credential" />);

    const input = screen.getByRole("textbox", { name: "Credential" });
    expect(input).toHaveAttribute("data-slot", "input");
    expect(input).toHaveClass("bg-transparent", "border-input", "text-foreground");
    expect(input).not.toHaveClass("bg-[#121218]");
  });

  it("activates a button with Enter and Space", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    renderInEditor(<Button onClick={onClick}>Run</Button>);

    await user.tab();
    expect(screen.getByRole("button", { name: "Run" })).toHaveFocus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("focuses the grouped input when its addon is clicked", async () => {
    const user = userEvent.setup();
    renderInEditor(
      <InputGroup>
        <InputGroupAddon>Find</InputGroupAddon>
        <InputGroupInput aria-label="Search" />
      </InputGroup>,
    );

    await user.click(screen.getByText("Find"));
    expect(screen.getByRole("textbox", { name: "Search" })).toHaveFocus();
  });

  it("moves a slider with the arrow keys and keeps its thumb hook", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn((value: number) => value);
    renderInEditor(
      <Slider
        aria-label="Opacity"
        min={0}
        max={100}
        step={1}
        defaultValue={40}
        className="[&_[data-slot=slider-thumb]]:size-2"
        onValueChange={onValueChange}
      />,
    );

    const thumb = document.querySelector("[data-slot=slider-thumb]");
    expect(thumb).toHaveClass("bg-background");
    expect(document.querySelector("[data-slot=slider-track]")).toHaveClass("bg-muted");
    // The edge-aligned thumb stays hidden until a real layout measures the track.
    const slider = screen.getByRole("slider", { hidden: true });
    expect(slider).toHaveAttribute("aria-label", "Opacity");
    act(() => slider.focus());
    expect(slider).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    await waitFor(() => expect(onValueChange).toHaveBeenCalled());
    expect(onValueChange.mock.calls.at(-1)?.[0]).toBe(41);
  });
});

describe("shared dialogs in the editor", () => {
  it("opens the dialog in the editor layer and closes it with Escape", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderInEditor(
      <Dialog open onOpenChange={onOpenChange}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>Rename page</DialogTitle>
            <DialogDescription>Choose a new name.</DialogDescription>
          </DialogHeader>
          <input aria-label="Page name" />
        </DialogPopup>
      </Dialog>,
    );

    const dialog = await screen.findByRole("dialog", { name: "Rename page" });
    expect(dialog).toHaveAttribute("data-koharu-ui-layer");
    expect(dialog).toHaveAttribute("data-slot", "dialog-content");
    expect(dialog).toHaveClass("bg-popover", "text-popover-foreground");
    expect(band(dialog)).toBeNull();
    expect(screen.getByText("Rename page")).toHaveAttribute("data-slot", "dialog-title");
    expect(screen.getByText("Rename page")).not.toHaveClass("uppercase");
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
    renderInEditor(
      <AlertDialog open onOpenChange={onOpenChange}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/10 text-destructive">!</AlertDialogMedia>
            <AlertDialogTitle>Delete project?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={onConfirm}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>,
    );

    const dialog = await screen.findByRole("alertdialog", { name: "Delete project?" });
    expect(dialog).toHaveAttribute("data-koharu-ui-layer");
    expect(dialog).toHaveAttribute("data-slot", "alert-dialog-content");
    expect(dialog).toHaveClass("bg-popover");
    expect(screen.getByText("!")).toHaveAttribute("data-slot", "alert-dialog-media");
    expect(screen.getByText("!")).toHaveClass("bg-destructive/10", "text-destructive");
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
    renderInEditor(
      <Popover>
        <PopoverTrigger render={<Button />}>Brush size</PopoverTrigger>
        <PopoverPopup side="right" align="start">
          <PopoverTitle>Brush</PopoverTitle>
          <input aria-label="Diameter" />
        </PopoverPopup>
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
    expect(content).toHaveClass("bg-popover", "text-popover-foreground");
    expect(band(content)).toBeNull();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("shows a tooltip on keyboard focus on the requested side", async () => {
    const user = userEvent.setup();
    renderInEditor(
      <TooltipProvider delay={0}>
        <Tooltip>
          <TooltipTrigger render={<Button aria-label="Settings" />}>S</TooltipTrigger>
          <TooltipPopup side="right">Open settings</TooltipPopup>
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
    expect(tip).toHaveClass("bg-foreground", "text-background");
  });

  it("picks a radio item of a dropdown menu from the keyboard", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    renderInEditor(
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button />}>Font size</DropdownMenuTrigger>
        <DropdownMenuPopup align="end">
          <DropdownMenuRadioGroup value="12" onValueChange={onValueChange}>
            <DropdownMenuRadioItem value="12">12</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="14">14</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuPopup>
      </DropdownMenu>,
    );

    const trigger = screen.getByRole("button", { name: "Font size" });
    expect(trigger).toHaveAttribute("data-slot", "dropdown-menu-trigger");
    trigger.focus();
    await user.keyboard("{Enter}");
    const menu = await screen.findByRole("menu");
    expect(menu).toHaveAttribute("data-koharu-ui-layer");
    expect(menu).toHaveAttribute("data-slot", "dropdown-menu-content");
    expect(menu).toHaveAttribute("data-align", "end");
    expect(screen.getByRole("menuitemradio", { name: "14" })).toHaveClass(
      "data-[highlighted]:bg-accent",
    );

    await user.keyboard("{ArrowDown}");
    await waitFor(() =>
      expect(screen.getByRole("menuitemradio", { name: "14" })).toHaveAttribute("data-highlighted"),
    );
    await user.keyboard("{Enter}");
    await waitFor(() => expect(onValueChange).toHaveBeenCalled());
    expect(onValueChange.mock.calls[0]?.[0]).toBe("14");
  });

  it("opens a submenu in the editor layer from the keyboard", async () => {
    const user = userEvent.setup();
    renderInEditor(
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button />}>Filter fonts</DropdownMenuTrigger>
        <DropdownMenuPopup align="end">
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Source</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem>Bundled</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuPopup>
      </DropdownMenu>,
    );

    screen.getByRole("button", { name: "Filter fonts" }).focus();
    await user.keyboard("{Enter}");
    await screen.findByRole("menu");
    await user.keyboard("{ArrowDown}");
    await waitFor(() =>
      expect(screen.getByRole("menuitem", { name: "Source" })).toHaveAttribute("data-highlighted"),
    );
    await user.keyboard("{ArrowRight}");
    const item = await screen.findByRole("menuitem", { name: "Bundled" });
    const submenu = item.closest("[data-slot=dropdown-menu-sub-content]");
    expect(submenu).toHaveAttribute("data-koharu-ui-layer");
  });

  it("chooses a select option and keeps the trigger hooks", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    renderInEditor(
      <Select defaultValue="Auto" onValueChange={onValueChange}>
        <SelectTrigger size="sm" aria-label="Text direction">
          <SelectValue />
        </SelectTrigger>
        <SelectPopup>
          <SelectItem value="Auto">Auto</SelectItem>
          <SelectItem value="Vertical">Vertical</SelectItem>
        </SelectPopup>
      </Select>,
    );

    const trigger = screen.getByRole("combobox", { name: "Text direction" });
    expect(trigger).toHaveAttribute("data-slot", "select-trigger");
    expect(trigger).toHaveAttribute("data-size", "sm");
    expect(trigger).toHaveClass("h-7", "border-input");
    expect(trigger).not.toHaveClass("bg-[#121218]");
    await user.click(trigger);
    const list = await screen.findByRole("listbox");
    const popup = list.closest("[data-slot=select-content]");
    expect(popup).toHaveAttribute("data-koharu-ui-layer");
    expect(popup).toHaveClass("bg-popover");

    await user.click(screen.getByRole("option", { name: "Vertical" }));
    await waitFor(() => expect(onValueChange).toHaveBeenCalled());
    expect(onValueChange.mock.calls[0]?.[0]).toBe("Vertical");
    await waitFor(() => expect(trigger).toHaveTextContent("Vertical"));
  });
});

describe("editor notices", () => {
  it("shows store errors in the toaster the editor mounts", async () => {
    await i18n.changeLanguage("en-US");
    render(<Toaster />);
    act(() => receiveError("Disk full"));

    expect(
      await screen.findByText(resources["en-US"].translation.errors.actionFailed),
    ).toBeInTheDocument();
    expect(screen.getByText("Disk full")).toBeInTheDocument();
  });

  it("titles store errors with the language of the editor, French by default", async () => {
    const titles = Object.fromEntries(
      Object.entries(resources).map(([language, resource]) => [
        language,
        resource.translation.errors.actionFailed,
      ]),
    );
    expect(titles["fr-FR"]).toBe("Impossible de terminer cette action");
    expect(titles["ja-JP"]).toBeTruthy();

    const previous = i18n.language;
    try {
      await i18n.changeLanguage("ja-JP");
      render(<Toaster />);
      act(() => receiveError("Disk full"));
      expect(await screen.findByText(titles["ja-JP"] as string)).toBeInTheDocument();
    } finally {
      await i18n.changeLanguage(previous);
    }
  });
});
