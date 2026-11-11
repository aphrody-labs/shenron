"use client";

import {
  Brush,
  Eraser,
  Hand,
  Minus,
  MousePointer2,
  Pipette,
  Plus,
  Sparkles,
  Type,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { ColorWell } from "../controls/ColorWell";
import { usePage } from "../../lib/queries";
import {
  isBrushTool,
  maxBrushDiameter,
  MIN_BRUSH_DIAMETER,
  useKoharuStore,
  type CanvasTool,
} from "../../lib/store";
import { Button } from "../../../components/button";
import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
} from "../../internal/components/number-field";
import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from "../../../components/popover";
import { Slider } from "../../../components/slider";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../../../components/tooltip";

const tools = [
  ["select", MousePointer2],
  ["text", Type],
  ["draw", Brush],
  ["eraser", Eraser],
  ["color_picker", Pipette],
  ["remove", Sparkles],
  ["pan", Hand],
] as const satisfies ReadonlyArray<readonly [CanvasTool, typeof MousePointer2]>;

export function ToolBar() {
  const { t } = useTranslation();
  const page = usePage().data;
  const active = useKoharuStore((state) => state.tool);
  const brush = useKoharuStore((state) => state.brush);
  const setTool = useKoharuStore((state) => state.setTool);
  const setBrush = useKoharuStore((state) => state.setBrush);
  const shortcuts = useKoharuStore((state) => state.shortcuts);
  const hasBrush = isBrushTool(active);

  return (
    <aside
      role="toolbar"
      aria-label={t("tools.toolbar") || "Barre d'outils"}
      className="absolute right-3 bottom-3 left-3 z-20 flex min-w-0 flex-row overflow-x-auto rounded-2xl border border-border bg-[var(--surface-floating)] p-1 shadow-[var(--shadow-toolrail)] lg:top-3 lg:right-auto lg:bottom-auto lg:w-11 lg:flex-col lg:overflow-visible [&_button]:min-h-11 [&_button]:min-w-11 lg:[&_button]:min-h-9 lg:[&_button]:min-w-9"
    >
      <div className="flex shrink-0 flex-row items-center py-0.5 lg:flex-col">
        {tools.map(([tool, Icon], index) => (
          <div key={tool} className="contents">
            {index === tools.length - 1 && (
              <span className="mx-1 h-5 w-px bg-border lg:mx-0 lg:my-1 lg:h-px lg:w-5" />
            )}
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={!page}
                    aria-label={t(`tools.${tool}`)}
                    data-active={active === tool}
                    className="relative shrink-0 text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground disabled:opacity-30 data-[active=true]:bg-accent data-[active=true]:text-accent-foreground"
                    onClick={() => setTool(tool)}
                  />
                }
              >
                <Icon className="size-4" />
              </TooltipTrigger>
              <TooltipPopup side="right">
                {t(`tools.${tool}`)}
                <span className="ml-2 opacity-60">{shortcuts[tool].toUpperCase()}</span>
              </TooltipPopup>
            </Tooltip>
          </div>
        ))}
      </div>

      {hasBrush && (
        <div className="ml-1 flex shrink-0 flex-row items-center gap-1 border-l border-border/80 pl-1 lg:ml-0 lg:flex-col lg:border-t lg:border-l-0 lg:py-1.5 lg:pl-0">
          {active === "draw" && (
            <ColorWell value={brush.color} onChange={(color) => setBrush({ ...brush, color })} />
          )}
          <BrushSize
            value={brush.diameter}
            onChange={(diameter) => setBrush({ ...brush, diameter })}
          />
        </div>
      )}
    </aside>
  );
}

function BrushSize({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const { t } = useTranslation();
  const roundedValue = Math.round(value);
  const page = usePage().data;
  const maxSize = maxBrushDiameter(page?.size ?? { width: 2048, height: 2048 });

  return (
    <Popover>
      <Tooltip>
        <PopoverTrigger
          render={
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t("tools.brushSizePixels", { size: roundedValue })}
                  className="size-8 rounded-xl font-sans text-[11px] leading-none font-medium tracking-[-0.02em] text-muted-foreground tabular-nums hover:bg-foreground/[0.06] hover:text-foreground"
                />
              }
            >
              {roundedValue}
            </TooltipTrigger>
          }
        />
        <TooltipPopup side="right">
          {t("tools.brushSizeShort", { size: roundedValue })}
        </TooltipPopup>
      </Tooltip>
      <PopoverPopup
        side="right"
        align="center"
        sideOffset={8}
        className="w-48 gap-2.5 rounded-xl p-2.5"
      >
        <div className="flex items-center justify-between gap-3">
          <PopoverTitle className="text-[11px]">{t("tools.brushSize")}</PopoverTitle>
          <NumberField
            min={MIN_BRUSH_DIAMETER}
            max={maxSize}
            step={1}
            value={roundedValue}
            className="w-20"
            onValueChange={(next) => {
              if (next !== null) onChange(clamp(next, MIN_BRUSH_DIAMETER, maxSize));
            }}
          >
            <NumberFieldGroup className="h-11 lg:h-7">
              <NumberFieldDecrement aria-label={t("tools.decreaseBrushSize")}>
                <Minus />
              </NumberFieldDecrement>
              <NumberFieldInput aria-label={t("tools.brushSizeInput")} />
              <NumberFieldIncrement aria-label={t("tools.increaseBrushSize")}>
                <Plus />
              </NumberFieldIncrement>
            </NumberFieldGroup>
          </NumberField>
        </div>
        <Slider
          aria-label={t("tools.brushSize")}
          min={MIN_BRUSH_DIAMETER}
          max={maxSize}
          step={1}
          value={value}
          className="min-h-11 py-1 lg:min-h-0 [&_[data-slot=slider-thumb]]:size-5 lg:[&_[data-slot=slider-thumb]]:size-2.5"
          onValueChange={onChange}
        />
      </PopoverPopup>
    </Popover>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}
