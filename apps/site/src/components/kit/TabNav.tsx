import Link from "next/link";
import { TabNav as PortableTabNav } from "@aphrody/shenron-ui/navigation/TabNav";
import type { ComponentProps } from "react";

export function TabNav(props: Omit<ComponentProps<typeof PortableTabNav>, "linkComponent">) {
  return <PortableTabNav {...props} linkComponent={Link} />;
}
