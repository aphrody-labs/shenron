import Link from "next/link";
import { Chip as PortableChip } from "@aphrody/shenron-ui/public/Chip";
import type { ComponentProps } from "react";

export { ChipRow } from "@aphrody/shenron-ui/public/Chip";

export function Chip(props: Omit<ComponentProps<typeof PortableChip>, "linkComponent">) {
  return <PortableChip {...props} linkComponent={Link} />;
}
