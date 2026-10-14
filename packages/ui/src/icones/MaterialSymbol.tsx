import type { SVGProps } from "react";
import subset from "./material-symbol-subset.json";

export type MaterialSymbolName = keyof typeof subset.icons;
/** Small generated SVG subset: no runtime font, catalogue fetch, or ligature flash. */
export function MaterialSymbol({
  name,
  size = 24,
  ...props
}: Omit<SVGProps<SVGSVGElement>, "name"> & { name: MaterialSymbolName; size?: number }) {
  const icon = subset.icons[name];
  return (
    <svg
      width={size}
      height={size}
      viewBox={icon.viewBox}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      {...props}
      dangerouslySetInnerHTML={{ __html: icon.body }}
    />
  );
}
