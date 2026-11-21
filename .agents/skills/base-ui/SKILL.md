---
name: base-ui
description: Base UI (@base-ui/react) usage in Shenron — unstyled accessible primitives wrapped in packages/ui/src/components and packages/m3-primitives. Use when adding, editing or debugging a component that imports @base-ui/react.
---

# Base UI in Shenron

## Scope (read first)

- `packages/ui/src/components/*` wraps `@base-ui/react` with `cva` + semantic tokens
  (`bg-primary`, `ring`, `destructive`). It serves the admin article editor
  (`app/admin/posts/`) and the Koharu editor, not the public site design system — see the
  header of `packages/ui/src/components/button.tsx`. `packages/m3-primitives/src` holds the other Base UI wrappers.
- Public pages use `components/kit/` and the `.dbz-*` classes / `--color-dbz-*` tokens in
  `src/app/globals.css` (see the `tailwind-v4` skill). Do not spread `<Button>` to public pages.

## Rules

1. Import primitives by subpath: `import { Dialog } from "@base-ui/react/dialog"`.
2. Base UI uses a `render` prop for composition, not Radix `asChild`. Replace any `asChild`
   pattern with `render={<Link href=… />}`.
3. Style via `className` (string or `(state) => string`) and data attributes
   (`data-[open]`, `data-[disabled]`, `data-[highlighted]`, `data-[starting-style]`,
   `data-[ending-style]`) — Base UI exposes state as attributes, not `data-state="open"`.
4. Portal-based parts (Popover, Select, Menu, Dialog, Tooltip) need `*.Portal` + `*.Positioner`
   (or `Backdrop`/`Popup` for dialogs); keep them in client components (`"use client"`).
5. Component scaffolding: use `@aphrody/shenron-m3-tokens` tokens and native M3/Fluent primitives (semantic HTML/CSS). Do not invoke bunx or external npm generators.
6. User-facing rules: `design-system/shenron/MASTER.md` and the `tailwind-v4` skill.

## Current API reference

Fetch before using an unfamiliar part or prop (training data may lag the installed 1.x):

- Index for agents: https://base-ui.com/llms.txt
- Per-component docs: `https://base-ui.com/react/components/<name>` (append `.md` for markdown when available)

Installed version: see `@base-ui/react` in `apps/site/package.json`.
