"use client";

import { PanelsRightBottom, PanelLeft } from "lucide-react";
import { useRef, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import type { RightSidebarPanel } from "../../navigation";
import { Button } from "../../../components/button";
import { Dialog, DialogPopup, DialogTitle, DialogDescription } from "../../../components/dialog";
import { ColorSamplingProvider } from "../controls/ColorSampling";
import { ActivityCenter } from "./ActivityCenter";
import { CanvasWorkspace } from "./CanvasWorkspace";
import { PageRail } from "./PageRail";
import { RightSidebar } from "./RightSidebar";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "../../internal/components/resizable";

const compactQuery = "(max-width: 1023px)";
function subscribeViewport(changed: () => void) {
  const media = window.matchMedia(compactQuery);
  media.addEventListener("change", changed);
  return () => media.removeEventListener("change", changed);
}
const compactViewport = () => window.matchMedia(compactQuery).matches;
const desktopViewport = () => false;

export function Editor() {
  const { t } = useTranslation();
  const compact = useSyncExternalStore(subscribeViewport, compactViewport, desktopViewport);
  const [panel, setPanel] = useState<"pages" | "tools" | null>(null);
  const [activePanel, setActivePanel] = useState<RightSidebarPanel>("properties");
  const panelTrigger = useRef<HTMLButtonElement | null>(null);
  return (
    <ColorSamplingProvider>
      <div data-koharu-ui className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-transparent">
        <ActivityCenter />
        {compact ? (
          <>
            <nav
              aria-label={t("responsive.navigation")}
              className="flex shrink-0 gap-2 border-b border-border/60 p-2"
            >
              <Button
                className="min-h-11 flex-1"
                variant="secondary"
                onClick={(event) => {
                  panelTrigger.current = event.currentTarget;
                  setPanel("pages");
                }}
              >
                <PanelLeft aria-hidden="true" />
                {t("responsive.pages")}
              </Button>
              <Button
                className="min-h-11 flex-1"
                variant="secondary"
                onClick={(event) => {
                  panelTrigger.current = event.currentTarget;
                  setPanel("tools");
                }}
              >
                <PanelsRightBottom aria-hidden="true" />
                {t("responsive.tools")}
              </Button>
            </nav>
            <div className="relative min-h-0 min-w-0 flex-1">
              <CanvasWorkspace />
            </div>
            <Dialog
              open={panel !== null}
              onOpenChange={(open) => {
                if (!open) setPanel(null);
              }}
            >
              <DialogPopup
                finalFocus={panelTrigger}
                closeLabel={t("window.close")}
                className="flex h-[min(86dvh,800px)] min-h-0 min-w-0 flex-col overflow-hidden p-0"
              >
                <div className="shrink-0 border-b border-border px-4 py-4 pr-16">
                  <DialogTitle>
                    {t(panel === "pages" ? "responsive.pages" : "responsive.tools")}
                  </DialogTitle>
                  <DialogDescription className="sr-only">
                    {t("responsive.description")}
                  </DialogDescription>
                </div>
                <div className="min-h-0 min-w-0 flex-1 overflow-auto [&_button]:min-h-11 [&_input]:min-h-11 [&_[role=tab]]:min-h-11">
                  {panel === "pages" ? (
                    <PageRail />
                  ) : panel === "tools" ? (
                    <RightSidebar activePanel={activePanel} onPanelChange={setActivePanel} />
                  ) : null}
                </div>
              </DialogPopup>
            </Dialog>
          </>
        ) : (
          <ResizablePanelGroup id="editor" orientation="horizontal" className="h-full min-h-0">
            <ResizablePanel
              id="pages"
              defaultSize="18%"
              minSize="14%"
              maxSize="22%"
              collapsible
              collapsedSize="4%"
              className="min-h-0 overflow-hidden"
            >
              <PageRail />
            </ResizablePanel>
            <ResizableHandle className="w-0 bg-transparent" />
            <ResizablePanel
              id="canvas"
              defaultSize="58%"
              minSize="50%"
              className="workspace-corner-mask relative z-10 min-h-0 rounded-tl-2xl bg-transparent shadow-[var(--shadow-content)]"
            >
              <CanvasWorkspace />
            </ResizablePanel>
            <ResizableHandle className="w-0 bg-transparent" />
            <ResizablePanel
              id="inspector"
              defaultSize="24%"
              minSize="20%"
              maxSize="27%"
              collapsible
              collapsedSize="4%"
              className="min-h-0 overflow-hidden border-l border-border/40 bg-[var(--surface-panel)]"
            >
              <RightSidebar activePanel={activePanel} onPanelChange={setActivePanel} />
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>
    </ColorSamplingProvider>
  );
}
