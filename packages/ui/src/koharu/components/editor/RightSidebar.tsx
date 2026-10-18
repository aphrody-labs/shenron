"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";

import { AgentPanel } from "./AgentPanel";
import { PipelinePanel } from "./PipelinePanel";
import { ShenronExportPanel } from "../ShenronExportPanel";
import { Inspector } from "./Inspector";
import { rightSidebarPanels, type RightSidebarPanel } from "../../navigation";
import { Button } from "../../../components/button";

export function RightSidebar({
  activePanel,
  onPanelChange,
}: { activePanel?: RightSidebarPanel; onPanelChange?: (panel: RightSidebarPanel) => void } = {}) {
  const { t } = useTranslation();
  const [localPanel, setLocalPanel] = useState<RightSidebarPanel>("properties");
  const panel = activePanel ?? localPanel;
  const setPanel = onPanelChange ?? setLocalPanel;

  return (
    <aside className="flex h-full min-h-0 flex-col bg-[var(--surface-panel)]">
      <div className="flex min-h-11 shrink-0 items-center gap-1 overflow-x-auto border-b border-border/80 px-2.5 lg:h-10 lg:min-h-10">
        {rightSidebarPanels.map(({ id, icon: Icon, label }) => (
          <Button
            key={id}
            variant={panel === id ? "secondary" : "ghost"}
            size="sm"
            className="h-7 flex-1 text-[10px]"
            onClick={() => setPanel(id)}
          >
            <Icon className="size-3" /> {t(label)}
          </Button>
        ))}
      </div>
      <div className={panel === "agent" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
        <AgentPanel />
      </div>
      <div className={panel === "pipeline" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
        <PipelinePanel />
      </div>
      <div className={panel === "properties" ? "min-h-0 flex-1" : "hidden"}>
        <Inspector />
      </div>
      {panel === "shenron" && (
        <div className="flex min-h-0 flex-1 flex-col">
          <ShenronExportPanel />
        </div>
      )}
    </aside>
  );
}
