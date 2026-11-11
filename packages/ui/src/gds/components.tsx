// SPDX-License-Identifier: Apache-2.0
"use client";

import React from "react";
import { GDS_COLORS, GDS_ELEVATION, GDS_SHAPE } from "./tokens";

export interface GdsCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "elevated" | "filled" | "outlined";
  elevation?: keyof typeof GDS_ELEVATION;
  shape?: keyof typeof GDS_SHAPE;
}

export const GdsCard: React.FC<GdsCardProps> = ({
  variant = "filled",
  elevation = "level1",
  shape = "medium",
  style,
  children,
  className = "",
  onClick,
  onKeyDown,
  ...props
}) => {
  const bg =
    variant === "elevated"
      ? GDS_COLORS.surfaceContainerLow
      : variant === "outlined"
        ? GDS_COLORS.surface
        : GDS_COLORS.surfaceContainer;

  const border = variant === "outlined" ? `1px solid ${GDS_COLORS.outline}` : "none";
  const boxShadow = variant === "elevated" ? GDS_ELEVATION[elevation] : "none";
  const borderRadius = GDS_SHAPE[shape];

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (onClick && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      onClick(e as unknown as React.MouseEvent<HTMLDivElement>);
    }
    onKeyDown?.(e);
  };

  if (onClick) {
    return (
      <button
        type="button"
        onClick={(e) => onClick(e as unknown as React.MouseEvent<HTMLDivElement>)}
        onKeyDown={(e) => handleKeyDown(e as unknown as React.KeyboardEvent<HTMLDivElement>)}
        className={`transition-all duration-200 text-left ${className}`}
        style={{
          backgroundColor: bg,
          color: GDS_COLORS.onSurface,
          border,
          boxShadow,
          borderRadius,
          padding: "16px",
          ...style,
        }}
      >
        {children}
      </button>
    );
  }

  return (
    <div
      className={`transition-all duration-200 ${className}`}
      style={{
        backgroundColor: bg,
        color: GDS_COLORS.onSurface,
        border,
        boxShadow,
        borderRadius,
        padding: "16px",
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
};

export interface GdsButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "filled" | "tonal" | "outlined" | "text";
  size?: "small" | "medium" | "large";
}

export const GdsButton: React.FC<GdsButtonProps> = ({
  variant = "filled",
  size = "medium",
  style,
  children,
  className = "",
  ...props
}) => {
  const isFilled = variant === "filled";
  const isTonal = variant === "tonal";
  const isOutlined = variant === "outlined";

  const bg = isFilled
    ? GDS_COLORS.primary
    : isTonal
      ? GDS_COLORS.secondaryContainer
      : "transparent";

  const color = isFilled
    ? GDS_COLORS.onPrimary
    : isTonal
      ? GDS_COLORS.onSecondaryContainer
      : GDS_COLORS.primary;

  const border = isOutlined ? `1px solid ${GDS_COLORS.outline}` : "none";
  const pad = size === "small" ? "6px 12px" : size === "large" ? "12px 24px" : "10px 20px";
  const fontSize = size === "small" ? "12px" : size === "large" ? "16px" : "14px";

  return (
    <button
      className={`inline-flex items-center justify-center font-medium transition-colors cursor-pointer select-none active:scale-[0.98] ${className}`}
      style={{
        backgroundColor: bg,
        color,
        border,
        borderRadius: GDS_SHAPE.full,
        padding: pad,
        fontSize,
        fontFamily: "Google Sans, sans-serif",
        boxShadow: isFilled ? GDS_ELEVATION.level1 : "none",
        ...style,
      }}
      {...props}
    >
      {children}
    </button>
  );
};

export interface GdsChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  onSelectToggle?: () => void;
}

export const GdsChip: React.FC<GdsChipProps> = ({
  selected = false,
  onSelectToggle,
  style,
  children,
  className = "",
  ...props
}) => {
  return (
    <button
      type="button"
      onClick={onSelectToggle}
      className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium cursor-pointer transition-all ${className}`}
      style={{
        backgroundColor: selected ? GDS_COLORS.secondaryContainer : GDS_COLORS.surfaceContainerHigh,
        color: selected ? GDS_COLORS.onSecondaryContainer : GDS_COLORS.onSurfaceVariant,
        border: `1px solid ${selected ? GDS_COLORS.primary : GDS_COLORS.outlineVariant}`,
        borderRadius: GDS_SHAPE.small,
        boxShadow: selected ? GDS_ELEVATION.level1 : "none",
        ...style,
      }}
      {...props}
    >
      {children}
    </button>
  );
};
