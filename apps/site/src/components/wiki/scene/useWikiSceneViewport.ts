"use client";
// SPDX-License-Identifier: Apache-2.0
import { useEffect, type RefObject } from "react";
import { sceneViewportMetrics } from "./scene-viewport";

/** The portal consumes the actual shell geometry; it never changes the shell or guesses its height. */
export function useWikiSceneViewport(worldRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const world = worldRef.current;
    if (!world) return;
    const header = document.querySelector<HTMLElement>("[data-shell-header]");
    const mobileNav = document.querySelector<HTMLElement>("[data-shell-mobile-nav]");
    const chrome = [...world.querySelectorAll<HTMLElement>("[data-scene-chrome]")];
    const artwork = world.querySelector<HTMLElement>("[data-scene-viewport]");
    let frame: number | undefined;
    let closed = false;
    const measure = () => {
      if (closed) return;
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const rect = world.getBoundingClientRect();
      const navRect = mobileNav?.getBoundingClientRect();
      const navStyle = mobileNav ? getComputedStyle(mobileNav) : undefined;
      const overlaps =
        navRect &&
        navRect.width > 0 &&
        navRect.height > 0 &&
        navRect.right > rect.left &&
        navRect.left < rect.right;
      const bottomOcclusion =
        overlaps &&
        navStyle?.position === "fixed" &&
        navStyle.display !== "none" &&
        navStyle.visibility !== "hidden" &&
        navRect.top < viewportHeight &&
        navRect.bottom > 0
          ? viewportHeight - Math.max(0, navRect.top)
          : 0;
      const metrics = sceneViewportMetrics({
        viewportHeight,
        documentTop: rect.top + window.scrollY,
        bottomOcclusion,
      });
      const chromeHeight = chrome.reduce(
        (height, element) => height + element.getBoundingClientRect().height,
        0,
      );
      const minimumArtwork = artwork
        ? Number.parseFloat(getComputedStyle(artwork).minBlockSize) || 0
        : 0;
      const heightValue = `${metrics.available}px`;
      if (world.style.getPropertyValue("--wiki-scene-block-size") !== heightValue)
        world.style.setProperty("--wiki-scene-block-size", heightValue);
      world.style.setProperty("--wiki-scene-shell-offset", `${metrics.offset}px`);
      world.dataset.sceneCompact = String(metrics.available < chromeHeight + minimumArtwork);
      world.dataset.shellMeasured = "true";
      world.dataset.sceneReservedBottom = String(metrics.bottom);
    };
    const schedule = () => {
      if (closed || frame !== undefined) return;
      frame = requestAnimationFrame(() => {
        frame = undefined;
        measure();
      });
    };
    const observer =
      typeof ResizeObserver === "function" ? new ResizeObserver(schedule) : undefined;
    for (const element of [world, world.parentElement, header, mobileNav, ...chrome])
      if (element) observer?.observe(element);
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    measure();
    return () => {
      closed = true;
      observer?.disconnect();
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, [worldRef]);
}
