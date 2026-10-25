"use client";

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

export function Editor() {
  return (
    <ColorSamplingProvider>
      <div data-koharu-ui className="relative min-h-0 flex-1 bg-transparent">
        <ActivityCenter />
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
            <RightSidebar />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </ColorSamplingProvider>
  );
}
