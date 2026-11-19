/**
 * Web side of the pixel-parity gallery. One state per page: `?id=button/hover&theme=dark`.
 * Every component comes from packages/ui (Base UI wrappers); hover and focus are driven by real
 * input in capture.ts, never forced here. The origin of the stage is the one in states.json.
 */
import { createRoot } from "react-dom/client";

import { Button } from "../../../packages/ui/src/components/button";
import { Checkbox } from "../../../packages/ui/src/components/checkbox";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "../../../packages/ui/src/components/dialog";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "../../../packages/ui/src/components/select";
import { Input } from "../../../packages/ui/src/components/input";
import { Switch } from "../../../packages/ui/src/components/switch";
import { Tabs, TabsList, TabsPanel, TabsTab } from "../../../packages/ui/src/components/tabs";

const params = new URLSearchParams(location.search);
// Parity captures freeze every transition and animation; the frame-time bench (anim=1) keeps them.
if (params.get("anim") !== "1") {
  const freeze = document.createElement("style");
  freeze.textContent =
    "*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important;scroll-behavior:auto!important}";
  document.head.append(freeze);
}
const id = params.get("id") ?? "button/default";
const theme = params.get("theme") === "light" ? "light" : "dark";
document.documentElement.classList.add(theme);
document.documentElement.style.colorScheme = theme;

const SELECT_ITEMS = [
  { value: "alpha", label: "Alpha" },
  { value: "beta", label: "Beta" },
  { value: "gamma", label: "Gamma" },
];

function SelectDemo({ disabled }: { disabled?: boolean }) {
  return (
    <div style={{ width: 240 }}>
      <Select items={SELECT_ITEMS} defaultValue="alpha" disabled={disabled}>
        <SelectTrigger data-parity="select-trigger">
          <SelectValue />
        </SelectTrigger>
        <SelectPopup data-parity="select-popup">
          {SELECT_ITEMS.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectPopup>
      </Select>
    </div>
  );
}

function TabsDemo({ value }: { value: "alpha" | "beta" }) {
  return (
    <Tabs defaultValue={value}>
      <TabsList>
        <TabsTab value="alpha" data-parity="tab-1">
          Alpha
        </TabsTab>
        <TabsTab value="beta" data-parity="tab-2">
          Beta
        </TabsTab>
        <TabsTab value="gamma" data-parity="tab-3">
          Gamma
        </TabsTab>
      </TabsList>
      <TabsPanel value="alpha">Panel alpha</TabsPanel>
      <TabsPanel value="beta">Panel beta</TabsPanel>
      <TabsPanel value="gamma">Panel gamma</TabsPanel>
    </Tabs>
  );
}

function DialogDemo() {
  return (
    <Dialog open>
      <DialogPopup initialFocus={false}>
        <DialogHeader>
          <DialogTitle>Dialog title</DialogTitle>
          <DialogDescription>Dialog description text.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" data-parity="dialog-cancel">
            Cancel
          </Button>
          <Button data-parity="dialog-confirm">Confirm</Button>
        </DialogFooter>
        {/* The Close button of DialogPopup is tagged by capture.ts through its slot. */}
      </DialogPopup>
    </Dialog>
  );
}

/**
 * Base UI renders the checkbox root as an inline span: `size-5` does nothing outside a flex or grid
 * parent (it collapses to a 2 px bar). The component has no call site in apps/site yet, so the gallery
 * gives it a flex row instead of capturing a collapsed control.
 */
function flex(child: React.ReactNode): React.ReactNode {
  return <div className="flex">{child}</div>;
}

/** One page with the six components and a long list, driven by the scripted interaction of fps.ts. */
function Bench() {
  const rows = Array.from({ length: 400 }, (_, index) => index + 1);
  return (
    <div style={{ display: "flex", gap: 48, width: 1792, height: 952 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 24, width: 560 }}>
        <Button data-parity="button">Button</Button>
        <label className="flex items-center gap-3">
          <Checkbox data-parity="checkbox" aria-label="Checkbox" />
          <span>Checkbox</span>
        </label>
        <label className="flex items-center gap-3">
          <Switch data-parity="switch" aria-label="Switch" />
          <span>Switch</span>
        </label>
        <TabsDemo value="alpha" />
        <SelectDemo />
        <Input data-parity="input" placeholder="Type here" aria-label="Input" />
        <Dialog>
          <DialogTrigger render={<Button data-parity="dialog-trigger" variant="outline" />}>
            Open dialog
          </DialogTrigger>
          <DialogPopup initialFocus={false}>
            <DialogHeader>
              <DialogTitle>Dialog title</DialogTitle>
              <DialogDescription>Dialog description text.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose render={<Button data-parity="dialog-dismiss" />}>Close</DialogClose>
            </DialogFooter>
          </DialogPopup>
        </Dialog>
      </div>
      <div
        data-parity="list"
        style={{ width: 640, height: 900, overflowY: "auto" }}
        className="rounded-xl border-2 border-black/80"
      >
        {rows.map((row) => (
          <div key={row} className="flex items-center gap-3 border-b border-black/40 px-4 py-2">
            <Switch aria-label={`Row ${row}`} defaultChecked={row % 3 === 0} />
            <span>Row {row}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function state(): React.ReactNode {
  if (id === "bench") return <Bench />;
  switch (id) {
    case "button/default":
    case "button/hover":
    case "button/focus-visible":
      return <Button data-parity="button">Button</Button>;
    case "button/disabled":
      return (
        <Button data-parity="button" disabled>
          Button
        </Button>
      );
    case "checkbox/unchecked":
    case "checkbox/hover":
    case "checkbox/focus-visible":
      return flex(<Checkbox data-parity="checkbox" aria-label="Checkbox" />);
    case "checkbox/checked":
      return flex(<Checkbox data-parity="checkbox" aria-label="Checkbox" defaultChecked />);
    case "checkbox/disabled":
      return flex(<Checkbox data-parity="checkbox" aria-label="Checkbox" disabled />);
    case "switch/off":
    case "switch/hover":
    case "switch/focus-visible":
      return <Switch data-parity="switch" aria-label="Switch" />;
    case "switch/on":
      return <Switch data-parity="switch" aria-label="Switch" defaultChecked />;
    case "switch/disabled":
      return <Switch data-parity="switch" aria-label="Switch" disabled />;
    case "tabs/default":
    case "tabs/hover":
    case "tabs/focus-visible":
      return <TabsDemo value="alpha" />;
    case "tabs/second-active":
      return <TabsDemo value="beta" />;
    case "dialog/open":
    case "dialog/close-focus-visible":
      return <DialogDemo />;
    case "select/closed":
    case "select/hover":
    case "select/focus-visible":
      return <SelectDemo />;
    case "select/disabled":
      return <SelectDemo disabled />;
    case "select/open":
      return <SelectDemo />;
    default:
      return <p data-parity="unknown">Unknown state {id}</p>;
  }
}

const stage = document.getElementById("stage");
if (stage) {
  createRoot(stage).render(state());
  document.documentElement.dataset.parityReady = "1";
}
