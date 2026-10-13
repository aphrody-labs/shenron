// SPDX-License-Identifier: Apache-2.0
import type { SVGProps } from "react";

/** Google's Material Symbols Rounded install_desktop, 24 px optical size.
 * Source: https://fonts.gstatic.com/s/i/short-term/release/materialsymbolsrounded/install_desktop/default/24px.svg
 */
export function InstallDesktopIcon({
  size = 24,
  ...props
}: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 -960 960 960"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d="M320-160v-40H160q-33 0-56.5-23.5T80-280v-480q0-33 23.5-56.5T160-840h280q17 0 28.5 11.5T480-800q0 17-11.5 28.5T440-760H160v480h640v-80q0-17 11.5-28.5T840-400q17 0 28.5 11.5T880-360v80q0 33-23.5 56.5T800-200H640v40q0 17-11.5 28.5T600-120H360q-17 0-28.5-11.5T320-160Zm320-393v-247q0-17 11.5-28.5T680-840q17 0 28.5 11.5T720-800v247l76-75q11-11 27.5-11.5T852-628q11 11 11 28t-11 28L708-428q-12 12-28 12t-28-12L508-572q-11-11-11.5-27.5T508-628q11-11 28-11t28 11l76 75Z" />
    </svg>
  );
}

/** Google's Material Symbols Outlined translate, 24 px optical size.
 * Source: https://raw.githubusercontent.com/google/material-design-icons/master/symbols/web/translate/materialsymbolsoutlined/translate_24px.svg
 */
export function TranslateIcon({
  size = 24,
  ...props
}: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 -960 960 960"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d="m476-80 182-480h84L924-80h-84l-43-122H603L560-80h-84ZM160-200l-56-56 202-202q-35-35-63.5-80T190-640h84q20 39 40 68t48 58q33-33 68.5-92.5T484-720H40v-80h280v-80h80v80h280v80H564q-21 72-63 148t-83 116l96 98-30 82-122-125-202 201Zm468-72h144l-72-204-72 204Z" />
    </svg>
  );
}
