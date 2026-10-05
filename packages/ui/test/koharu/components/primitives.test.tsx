// SPDX-License-Identifier: MIT OR Apache-2.0
// The editor composes the shared @shenron/ui primitives: these tests pin the hooks its
// stylesheet targets (`data-slot`, `data-koharu-ui-layer`) and the keyboard behaviour.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "bun:test";

import { Button } from "@shenron/ui/button";
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
