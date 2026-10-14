"use client";

import { createContext, useContext } from "react";

/** One local preference pauses decorative home media without touching episode playback. */
export const HomeMotion = createContext(true);
export function useHomeMotion(): boolean {
  return useContext(HomeMotion);
}
