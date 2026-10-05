"use client";

import { Slider as SliderPrimitive } from "@base-ui/react/slider";

import { cn } from "../lib/utils";
import { useSurface, type SurfaceVariant } from "./surface";

/** One thumb per value: a number renders one, an array renders a range. */
function thumbCount(value: unknown, defaultValue: unknown): number {
  const current = value ?? defaultValue;
  return Array.isArray(current) ? Math.max(1, current.length) : 1;
}

/**
 * The value type follows the props: `value={12}` types `onValueChange` with a number,
 * `value={[2, 8]}` with the array.
 */
function Slider<Value extends number | readonly number[]>({
  className,
  variant,
  value,
  defaultValue,
  thumbAlignment,
  ...props
}: SliderPrimitive.Root.Props<Value> & {
  variant?: SurfaceVariant;
}) {
  const surface = useSurface();
  const planche = (variant ?? surface.variant) === "planche";
  const thumbs = thumbCount(value, defaultValue);
  // The root names the group; each thumb's range input carries the same name for assistive tech.
  const { "aria-label": ariaLabel, "aria-labelledby": ariaLabelledBy } = props;
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      value={value}
      defaultValue={defaultValue}
      // The planche thumb sits inside the thin track instead of overhanging its ends.
      thumbAlignment={thumbAlignment ?? (planche ? "edge" : undefined)}
      className={cn(
        "relative flex w-full touch-none select-none items-center",
        planche && "data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Control
        data-slot="slider-control"
        className="relative flex w-full items-center"
      >
        <SliderPrimitive.Track
          data-slot="slider-track"
          className={
            planche
              ? "relative h-1 w-full grow overflow-hidden rounded-full bg-muted"
              : "relative h-3 w-full grow overflow-hidden rounded-full border-2 border-black bg-black/60 shadow-inner"
          }
        >
          <SliderPrimitive.Indicator
            data-slot="slider-range"
            className={
              planche
                ? "absolute h-full bg-primary"
                : "absolute h-full bg-gradient-to-r from-dbz-orange via-dbz-yellow to-dbz-ki"
            }
          />
        </SliderPrimitive.Track>
        {Array.from({ length: thumbs }, (_, index) => (
          <SliderPrimitive.Thumb
            key={index}
            index={thumbs > 1 ? index : undefined}
            aria-label={ariaLabel}
            aria-labelledby={ariaLabelledBy}
            data-slot="slider-thumb"
            className={
              planche
                ? "relative block size-4 shrink-0 rounded-full border border-primary bg-background outline-none transition-[box-shadow] after:absolute after:-inset-2 hover:ring-4 hover:ring-ring/20 focus-visible:ring-2 focus-visible:ring-ring active:ring-4 active:ring-ring/30 data-[disabled]:pointer-events-none"
                : "block size-6 rounded-full border-2 border-black bg-gradient-to-br from-amber-400 via-orange-500 to-amber-600 shadow-[2px_2px_0px_#000] outline-none cursor-grab transition-transform hover:scale-110 active:scale-95 active:cursor-grabbing focus-visible:ring-4 focus-visible:ring-dbz-yellow/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#121218]"
            }
          />
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  );
}

export { Slider };
