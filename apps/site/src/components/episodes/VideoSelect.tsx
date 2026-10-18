"use client";

import { Children, isValidElement, useEffect, useState, type ReactNode } from "react";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectPopup,
  SelectItem,
} from "@aphrody/shenron-ui/select";
import styles from "./VideoSelect.module.css";

/** Shared accessible primitives, with the public media surface rather than admin styling. */
export function VideoSelect({
  value,
  onChange,
  children,
  "aria-label": label,
  cinema = false,
}: {
  value: number;
  onChange: (event: { target: { value: string } }) => void;
  children: ReactNode;
  "aria-label": string;
  cinema?: boolean;
}) {
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const update = () => setPortalContainer(document.fullscreenElement as HTMLElement | null);
    update();
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);
  const items = Children.toArray(children)
    .filter(isValidElement)
    .map((child) => {
      const props = child.props as { value: number; children: ReactNode };
      return { value: props.value, label: props.children };
    });
  return (
    <Select
      value={value}
      onValueChange={(next: number | null) => {
        if (next !== null) onChange({ target: { value: String(next) } });
      }}
      items={items}
    >
      <SelectTrigger
        variant="planche"
        className={`${styles.trigger} ${cinema ? styles.cinema : ""}`}
        aria-label={label}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectPopup
        portalContainer={portalContainer}
        variant="planche"
        className={`${styles.popup} ${cinema ? styles.cinema : ""}`}
        alignItemWithTrigger={false}
      >
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value} className={styles.item}>
            {item.label}
          </SelectItem>
        ))}
      </SelectPopup>
    </Select>
  );
}
