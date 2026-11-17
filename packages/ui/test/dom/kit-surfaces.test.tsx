// SPDX-License-Identifier: Apache-2.0
// The shared kit (`@aphrody/shenron-ui/<part>`): placement props reach the positioner, every part names
// itself with `data-slot`, the site keeps the toriyama look by default, and a `planche` scope
// paints semantic tokens and stamps its attributes on portaled surfaces.
import * as matchers from "@testing-library/jest-dom/matchers";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "bun:test";

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
} from "../../src/components/alert-dialog";
import { Button } from "../../src/components/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "../../src/components/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPopup,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "../../src/components/dropdown-menu";
import { Input } from "../../src/components/input";
import {
  Popover,
  PopoverClose,
  PopoverDescription,
  PopoverHeader,
  PopoverPopup,
  PopoverTitle,
  PopoverTrigger,
} from "../../src/components/popover";
import {
  Select,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectPopup,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "../../src/components/select";
import { Separator } from "../../src/components/separator";
import { Slider } from "../../src/components/slider";
import { SurfaceScope } from "../../src/components/surface";
import { Textarea } from "../../src/components/textarea";
import {
  ToastDescription,
  ToastProvider,
  ToastRoot,
  ToastTitle,
  ToastViewport,
} from "../../src/components/toast";
import {
  Tooltip,
  TooltipPopup,
  TooltipProvider,
  TooltipTrigger,
} from "../../src/components/tooltip";

expect.extend(matchers);

if (!("ResizeObserver" in globalThis)) {
  class Observer {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(globalThis, "ResizeObserver", { value: Observer, writable: true });
}
Element.prototype.scrollIntoView ??= () => undefined;
Element.prototype.setPointerCapture ??= () => undefined;
Element.prototype.hasPointerCapture ??= () => true;
Element.prototype.releasePointerCapture ??= () => undefined;

afterEach(cleanup);

const host = { "data-host-layer": "" } as const;

function Planche({ children }: { children: React.ReactNode }) {
  return (
    <SurfaceScope variant="planche" portalAttributes={host}>
      {children}
    </SurfaceScope>
  );
}

/** The decorative orange-yellow band the toriyama popups paint on top. */
const band = (popup: HTMLElement) => popup.querySelector(":scope > .bg-gradient-to-r");

describe("site defaults stay unchanged", () => {
  it("keeps the toriyama popover, below its trigger, without host attributes", async () => {
    const user = userEvent.setup();
    render(
      <Popover>
        <PopoverTrigger render={<Button />}>Infos</PopoverTrigger>
        <PopoverPopup>
          <PopoverTitle>Saga</PopoverTitle>
        </PopoverPopup>
      </Popover>,
    );

    await user.click(screen.getByRole("button", { name: "Infos" }));
    const popup = await screen.findByRole("dialog");
    expect(popup).toHaveAttribute("data-side", "bottom");
    expect(popup).toHaveClass("bg-[#0e0e14]", "border-black", "shadow-[4px_4px_0px_#000]");
    expect(popup).not.toHaveAttribute("data-host-layer");
    expect(band(popup)).not.toBeNull();
    expect(screen.getByText("Saga")).toHaveClass("font-saiyan");
  });

  it("keeps the toriyama dialog with its close button and band", async () => {
    render(
      <Dialog open>
        <DialogPopup closeLabel="Fermer">
          <DialogTitle>Filtres</DialogTitle>
        </DialogPopup>
      </Dialog>,
    );

    const dialog = await screen.findByRole("dialog", { name: "Filtres" });
    expect(dialog).toHaveAttribute("data-slot", "dialog-content");
    expect(dialog).toHaveClass("bg-[#0d0d12]", "border-3", "p-6");
    expect(band(dialog)).not.toBeNull();
    expect(screen.getByText("Filtres")).toHaveClass("font-saiyan", "uppercase");
    expect(screen.getByRole("button", { name: "Fermer" })).toHaveAttribute(
      "data-slot",
      "dialog-close",
    );
  });

  it("keeps the toriyama form fields", () => {
    render(
      <>
        <Input aria-label="Pseudo" />
        <Textarea aria-label="Message" />
      </>,
    );
    expect(screen.getByRole("textbox", { name: "Pseudo" })).toHaveClass("bg-[#121218]");
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveClass("bg-[#121218]");
  });
});

describe("placement reaches the positioner", () => {
  it("opens a popover on the requested side and alignment, with its parts named", async () => {
    const user = userEvent.setup();
    render(
      <Popover>
        <PopoverTrigger render={<Button />}>Brush size</PopoverTrigger>
        <PopoverPopup side="right" align="start" alignOffset={4}>
          <PopoverHeader>
            <PopoverTitle>Brush</PopoverTitle>
            <PopoverDescription>Diameter in pixels.</PopoverDescription>
          </PopoverHeader>
          <input aria-label="Diameter" />
          <PopoverClose>Done</PopoverClose>
        </PopoverPopup>
      </Popover>,
    );

    const trigger = screen.getByRole("button", { name: "Brush size" });
    expect(trigger).toHaveAttribute("data-slot", "popover-trigger");
    await user.click(trigger);
    const popup = await screen.findByRole("dialog");
    expect(popup).toHaveAttribute("data-slot", "popover-content");
    expect(popup).toHaveAttribute("data-side", "right");
    expect(popup).toHaveAttribute("data-align", "start");
    expect(popup.parentElement).toHaveAttribute("data-slot", "popover-positioner");
    expect(screen.getByText("Brush")).toHaveAttribute("data-slot", "popover-title");
    expect(screen.getByText("Diameter in pixels.")).toHaveAttribute(
      "data-slot",
      "popover-description",
    );
    expect(screen.getByText("Brush").parentElement).toHaveAttribute("data-slot", "popover-header");
    expect(screen.getByRole("button", { name: "Done" })).toHaveAttribute(
      "data-slot",
      "popover-close",
    );

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
          <TooltipPopup side="right" align="end">
            Open settings
          </TooltipPopup>
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
    expect(tip).toHaveAttribute("data-align", "end");
    // Default variant: the comic bubble.
    expect(tip).toHaveClass("bg-white", "uppercase");
  });

  it("aligns a select list off its trigger when asked", async () => {
    const user = userEvent.setup();
    render(
      <Select defaultValue="Auto">
        <SelectTrigger aria-label="Direction">
          <SelectValue />
        </SelectTrigger>
        <SelectPopup side="top" align="start" alignItemWithTrigger={false}>
          <SelectItem value="Auto">Auto</SelectItem>
          <SelectItem value="Vertical">Vertical</SelectItem>
        </SelectPopup>
      </Select>,
    );

    await user.click(screen.getByRole("combobox", { name: "Direction" }));
    const list = await screen.findByRole("listbox");
    const popup = list.closest("[data-slot=select-content]");
    expect(popup).toHaveAttribute("data-side", "top");
    expect(popup).toHaveAttribute("data-align", "start");
    expect(list).toHaveAttribute("data-slot", "select-list");
  });
});

describe("menu parts", () => {
  it("picks a radio item from the keyboard and names every part", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button />}>Font size</DropdownMenuTrigger>
        <DropdownMenuPopup align="end">
          <DropdownMenuGroup>
            <DropdownMenuLabel inset>Size</DropdownMenuLabel>
            <DropdownMenuRadioGroup value="12" onValueChange={onValueChange}>
              <DropdownMenuRadioItem value="12">12</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="14">14</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem checked>Bold</DropdownMenuCheckboxItem>
          <DropdownMenuItem inset>
            Reset
            <DropdownMenuShortcut>⌘R</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuPopup>
      </DropdownMenu>,
    );

    const trigger = screen.getByRole("button", { name: "Font size" });
    expect(trigger).toHaveAttribute("data-slot", "dropdown-menu-trigger");
    trigger.focus();
    await user.keyboard("{Enter}");
    const menu = await screen.findByRole("menu");
    expect(menu).toHaveAttribute("data-slot", "dropdown-menu-content");
    expect(menu).toHaveAttribute("data-align", "end");
    expect(menu.parentElement).toHaveAttribute("data-slot", "dropdown-menu-positioner");
    expect(screen.getByText("Size")).toHaveAttribute("data-slot", "dropdown-menu-label");
    expect(screen.getByText("Size")).toHaveAttribute("data-inset");
    const group = screen.getByRole("group", { name: "Size" });
    expect(group).toHaveAttribute("data-slot", "dropdown-menu-group");
    expect(group.querySelector("[data-slot=dropdown-menu-radio-group]")).not.toBeNull();
    expect(screen.getByRole("separator")).toHaveAttribute("data-slot", "dropdown-menu-separator");
    expect(screen.getByRole("menuitemcheckbox", { name: "Bold" })).toHaveAttribute(
      "data-slot",
      "dropdown-menu-checkbox-item",
    );
    expect(screen.getByRole("menuitem", { name: /Reset/ })).toHaveAttribute(
      "data-slot",
      "dropdown-menu-item",
    );
    expect(screen.getByText("⌘R")).toHaveAttribute("data-slot", "dropdown-menu-shortcut");
    expect(screen.getByRole("menuitemradio", { name: "12" })).toHaveAttribute(
      "data-slot",
      "dropdown-menu-radio-item",
    );

    await user.keyboard("{ArrowDown}");
    await waitFor(() =>
      expect(screen.getByRole("menuitemradio", { name: "14" })).toHaveAttribute("data-highlighted"),
    );
    await user.keyboard("{Enter}");
    await waitFor(() => expect(onValueChange).toHaveBeenCalled());
    expect(onValueChange.mock.calls[0]?.[0]).toBe("14");
  });

  it("opens a submenu with ArrowRight and closes it with ArrowLeft", async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button />}>Filter</DropdownMenuTrigger>
        <DropdownMenuPopup>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Source</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem>Bundled</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuPopup>
      </DropdownMenu>,
    );

    screen.getByRole("button", { name: "Filter" }).focus();
    await user.keyboard("{Enter}");
    await screen.findByRole("menu");
    const subTrigger = screen.getByRole("menuitem", { name: "Source" });
    expect(subTrigger).toHaveAttribute("data-slot", "dropdown-menu-sub-trigger");
    await user.keyboard("{ArrowDown}");
    await waitFor(() => expect(subTrigger).toHaveAttribute("data-highlighted"));
    await user.keyboard("{ArrowRight}");
    const item = await screen.findByRole("menuitem", { name: "Bundled" });
    const submenu = item.closest("[data-slot=dropdown-menu-sub-content]");
    expect(submenu).not.toBeNull();
    expect(submenu).toHaveAttribute("data-side", "inline-end");
    await waitFor(() => expect(item).toHaveAttribute("data-highlighted"));

    await user.keyboard("{ArrowLeft}");
    await waitFor(() =>
      expect(screen.queryByRole("menuitem", { name: "Bundled" })).not.toBeInTheDocument(),
    );
  });
});

describe("select parts", () => {
  it("chooses an option from the keyboard on the dense trigger", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <Select defaultValue="Auto" onValueChange={onValueChange}>
        <SelectTrigger size="sm" aria-label="Text direction">
          <SelectValue />
        </SelectTrigger>
        <SelectPopup>
          <SelectGroup>
            <SelectLabel>Direction</SelectLabel>
            <SelectItem value="Auto">Auto</SelectItem>
            <SelectSeparator />
            <SelectItem value="Vertical">Vertical</SelectItem>
          </SelectGroup>
        </SelectPopup>
      </Select>,
    );

    const trigger = screen.getByRole("combobox", { name: "Text direction" });
    expect(trigger).toHaveAttribute("data-slot", "select-trigger");
    expect(trigger).toHaveAttribute("data-size", "sm");
    expect(trigger).toHaveClass("h-8");
    expect(trigger.querySelector("[data-slot=select-value]")).toHaveTextContent("Auto");
    expect(trigger.querySelector("[data-slot=select-icon]")).not.toBeNull();

    trigger.focus();
    await user.keyboard("{ArrowDown}");
    const list = await screen.findByRole("listbox");
    expect(list.closest("[data-slot=select-content]")).not.toBeNull();
    expect(screen.getByText("Direction")).toHaveAttribute("data-slot", "select-label");
    expect(screen.getByRole("group")).toHaveAttribute("data-slot", "select-group");
    expect(screen.getByRole("option", { name: "Vertical" })).toHaveAttribute(
      "data-slot",
      "select-item",
    );
    expect(list.querySelector("[data-slot=select-separator]")).not.toBeNull();

    await waitFor(() =>
      expect(screen.getByRole("option", { name: "Auto" })).toHaveAttribute("data-highlighted"),
    );
    await user.keyboard("{ArrowDown}");
    await waitFor(() =>
      expect(screen.getByRole("option", { name: "Vertical" })).toHaveAttribute("data-highlighted"),
    );
    await user.keyboard("{Enter}");
    await waitFor(() => expect(onValueChange).toHaveBeenCalled());
    expect(onValueChange.mock.calls[0]?.[0]).toBe("Vertical");
    await waitFor(() => expect(trigger).toHaveTextContent("Vertical"));
  });
});

describe("slider parts", () => {
  it("names its parts and moves with the arrow keys, typed as a number", async () => {
    const user = userEvent.setup();
    const changes: number[] = [];
    render(
      <Slider
        aria-label="Zoom"
        min={10}
        max={800}
        step={5}
        defaultValue={100}
        onValueChange={(value) => changes.push(value / 100)}
      />,
    );

    const root = document.querySelector("[data-slot=slider]");
    expect(root).not.toBeNull();
    expect(root?.querySelector("[data-slot=slider-control]")).not.toBeNull();
    expect(root?.querySelector("[data-slot=slider-track]")).not.toBeNull();
    expect(root?.querySelector("[data-slot=slider-range]")).not.toBeNull();
    expect(root?.querySelectorAll("[data-slot=slider-thumb]")).toHaveLength(1);

    await user.tab();
    const thumb = screen.getByRole("slider", { name: "Zoom" });
    expect(thumb).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    await waitFor(() => expect(changes.at(-1)).toBe(1.05));
    await user.keyboard("{ArrowLeft}{ArrowLeft}");
    await waitFor(() => expect(changes.at(-1)).toBe(0.95));
  });

  it("renders one thumb per value of a range", () => {
    const onValueChange = vi.fn((value: readonly number[]) => value.length);
    render(<Slider aria-label="Range" defaultValue={[20, 80]} onValueChange={onValueChange} />);
    expect(document.querySelectorAll("[data-slot=slider-thumb]")).toHaveLength(2);
    expect(screen.getAllByRole("slider")).toHaveLength(2);
  });
});

describe("alert dialog parts", () => {
  it("confirms with the action and dismisses with the cancel button", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn();
    render(
      <AlertDialog open onOpenChange={onOpenChange}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogMedia>!</AlertDialogMedia>
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
    expect(dialog).toHaveAttribute("data-slot", "alert-dialog-content");
    expect(screen.getByText("!")).toHaveAttribute("data-slot", "alert-dialog-media");
    expect(screen.getByText("This cannot be undone.")).toHaveAttribute(
      "data-slot",
      "alert-dialog-description",
    );
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    const action = screen.getByRole("button", { name: "Delete" });
    expect(action).toHaveAttribute("data-slot", "alert-dialog-action");
    await user.click(action);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalled();

    const cancel = screen.getByRole("button", { name: "Cancel" });
    expect(cancel).toHaveAttribute("data-slot", "alert-dialog-cancel");
    cancel.focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(onOpenChange).toHaveBeenCalled());
    expect(onOpenChange.mock.calls[0]?.[0]).toBe(false);
  });
});

describe("planche surface", () => {
  it("paints semantic tokens without the band and stamps the host attributes", async () => {
    const user = userEvent.setup();
    render(
      <Planche>
        <Popover>
          <PopoverTrigger render={<Button />}>Infos</PopoverTrigger>
          <PopoverPopup>
            <PopoverTitle>Saga</PopoverTitle>
          </PopoverPopup>
        </Popover>
      </Planche>,
    );

    await user.click(screen.getByRole("button", { name: "Infos" }));
    const popup = await screen.findByRole("dialog");
    expect(popup).toHaveAttribute("data-host-layer");
    expect(popup).toHaveClass("bg-popover", "text-popover-foreground", "border-border");
    expect(popup).not.toHaveClass("shadow-[4px_4px_0px_#000]");
    expect(band(popup)).toBeNull();
    expect(screen.getByText("Saga")).not.toHaveClass("font-saiyan");
  });

  it("lets a part's own variant win over the scope", async () => {
    const user = userEvent.setup();
    render(
      <Planche>
        <Popover>
          <PopoverTrigger render={<Button />}>Infos</PopoverTrigger>
          <PopoverPopup variant="toriyama">Saga</PopoverPopup>
        </Popover>
      </Planche>,
    );

    await user.click(screen.getByRole("button", { name: "Infos" }));
    const popup = await screen.findByRole("dialog");
    expect(popup).toHaveClass("bg-[#0e0e14]");
    expect(band(popup)).not.toBeNull();
    // The scope's portal attributes still apply: the host stylesheet must reach every popup.
    expect(popup).toHaveAttribute("data-host-layer");
  });

  it("passes the popup variant down to menu items", async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button />}>Page</DropdownMenuTrigger>
        <DropdownMenuPopup variant="planche">
          <DropdownMenuItem>Rename</DropdownMenuItem>
          <DropdownMenuItem variant="destructive">Delete</DropdownMenuItem>
        </DropdownMenuPopup>
      </DropdownMenu>,
    );

    await user.click(screen.getByRole("button", { name: "Page" }));
    const menu = await screen.findByRole("menu");
    expect(menu).toHaveClass("bg-popover");
    expect(band(menu)).toBeNull();
    const rename = screen.getByRole("menuitem", { name: "Rename" });
    expect(rename).toHaveClass("data-[highlighted]:bg-accent");
    expect(rename).not.toHaveClass("uppercase");
    expect(screen.getByRole("menuitem", { name: "Delete" })).toHaveClass("text-destructive");
  });

  it("shows the planche tooltip as an inverse flat", async () => {
    const user = userEvent.setup();
    render(
      <Planche>
        <TooltipProvider delay={0}>
          <Tooltip>
            <TooltipTrigger render={<Button aria-label="Help" />}>?</TooltipTrigger>
            <TooltipPopup side="bottom">Read the guide</TooltipPopup>
          </Tooltip>
        </TooltipProvider>
      </Planche>,
    );

    await user.tab();
    const tip = await screen.findByText("Read the guide");
    expect(tip).toHaveAttribute("data-host-layer");
    expect(tip).toHaveAttribute("data-side", "bottom");
    expect(tip).toHaveClass("bg-foreground", "text-background");
    expect(tip).not.toHaveClass("uppercase");
  });

  it("paints fields, slider and separator on the scope", () => {
    render(
      <Planche>
        <Input aria-label="Name" />
        <Textarea aria-label="Notes" />
        <Separator />
        <Slider aria-label="Opacity" defaultValue={50} />
      </Planche>,
    );

    expect(screen.getByRole("textbox", { name: "Name" })).toHaveClass(
      "bg-transparent",
      "border-input",
    );
    expect(screen.getByRole("textbox", { name: "Notes" })).toHaveClass("bg-transparent");
    expect(document.querySelector("[data-slot=separator]")).toHaveClass("bg-border", "h-px");
    expect(document.querySelector("[data-slot=slider-track]")).toHaveClass("bg-muted");
    expect(document.querySelector("[data-slot=slider-thumb]")).toHaveClass("bg-background");
  });

  it("paints dialogs on the scope", async () => {
    render(
      <Planche>
        <Dialog open>
          <DialogPopup>
            <DialogHeader>
              <DialogTitle>Rename page</DialogTitle>
              <DialogDescription>Choose a new name.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button>Save</Button>
            </DialogFooter>
          </DialogPopup>
        </Dialog>
      </Planche>,
    );

    const dialog = await screen.findByRole("dialog", { name: "Rename page" });
    expect(dialog).toHaveAttribute("data-host-layer");
    expect(dialog).toHaveClass("bg-popover", "border-border");
    expect(band(dialog)).toBeNull();
    expect(screen.getByText("Rename page")).toHaveAttribute("data-slot", "dialog-title");
    expect(screen.getByText("Rename page")).not.toHaveClass("uppercase");
    expect(screen.getByText("Choose a new name.")).toHaveClass("text-muted-foreground");
    expect(screen.getByRole("button", { name: "Save" }).parentElement).toHaveAttribute(
      "data-slot",
      "dialog-footer",
    );
  });

  it("paints toasts and stamps the viewport", () => {
    render(
      <Planche>
        <ToastProvider>
          <ToastViewport>
            <ToastRoot toast={{ id: "t1", title: "Saved", description: "Page renamed." }}>
              <ToastTitle>Saved</ToastTitle>
              <ToastDescription>Page renamed.</ToastDescription>
            </ToastRoot>
          </ToastViewport>
        </ToastProvider>
      </Planche>,
    );

    const viewport = document.querySelector("[data-slot=toast-viewport]");
    expect(viewport).toHaveAttribute("data-host-layer");
    const toast = document.querySelector("[data-slot=toast]");
    expect(toast).toHaveClass("bg-popover", "border-border");
    expect(screen.getByText("Saved")).toHaveAttribute("data-slot", "toast-title");
    expect(screen.getByText("Saved")).not.toHaveClass("uppercase");
    expect(screen.getByText("Page renamed.")).toHaveClass("text-muted-foreground");
  });
});
