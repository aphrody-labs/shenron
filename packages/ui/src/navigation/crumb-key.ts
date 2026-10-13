// SPDX-License-Identifier: Apache-2.0
import { isValidElement, type ReactNode } from "react";

function labelKey(label: ReactNode): string {
  if (isValidElement<{ k?: string; children?: ReactNode }>(label)) {
    return String(label.key ?? label.props.k ?? labelKey(label.props.children));
  }
  if (Array.isArray(label)) return label.map(labelKey).join("|");
  return String(label ?? "");
}

/** Dictionary keys identify translated labels without stringifying React elements. */
export function shellCrumbKey(crumb: { href?: string; label: ReactNode }): string {
  return crumb.href ?? labelKey(crumb.label);
}
