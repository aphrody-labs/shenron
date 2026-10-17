/**
 * CharacterCard — a character of a work: portrait, name, voice and a short
 * blurb.
 *
 * Without a portrait the card shows a four-star sphere instead of an empty
 * frame: a missing image must not read as a broken one. The whole card is one
 * link when `href` is set, so a keyboard user meets one stop per character.
 *
 * Server component.
 */
import type { ReactNode } from "react";
import { DragonBallSphere } from "../toriyama/DragonBallSphere";
import type { UiLinkComponent } from "../navigation/link";
import type { WorkMessages } from "./work-messages";

export interface CharacterCardProps {
  name: string;
  messages: WorkMessages;
  /** Japanese name, rendered with `lang="ja"`. */
  nameJa?: string;
  voiceActor?: string;
  blurb?: ReactNode;
  imageSrc?: string;
  href?: string;
  variant?: "compact" | "detailed";
  linkComponent?: UiLinkComponent;
  className?: string;
}

export function CharacterCard({
  name,
  messages,
  nameJa,
  voiceActor,
  blurb,
  imageSrc,
  href,
  variant = "detailed",
  linkComponent: Link = "a",
  className = "",
}: CharacterCardProps) {
  const body = (
    <>
      <div className="relative aspect-[3/4] min-w-0 overflow-hidden bg-dbz-bg">
        {imageSrc ? (
          <img
            src={imageSrc}
            alt={name}
            loading="lazy"
            decoding="async"
            className="size-full object-cover object-top transition-transform duration-200 group-hover:scale-[1.03] motion-reduce:transition-none"
          />
        ) : (
          <div className="flex size-full items-center justify-center">
            <DragonBallSphere stars={4} size={72} decorative />
          </div>
        )}
      </div>
      <div className="min-w-0 p-4">
        <h3 className="truncate text-lg font-semibold text-os">{name}</h3>
        {nameJa && (
          <p lang="ja" className="truncate font-jp text-sm text-os/60">
            {nameJa}
          </p>
        )}
        {voiceActor && (
          <p className="mt-2 text-sm text-os/70">
            <span className="font-mono text-xs uppercase tracking-wider text-dbz-orange">
              {messages.voiceActor}
            </span>{" "}
            {voiceActor}
          </p>
        )}
        {variant === "detailed" && blurb && (
          <div className="mt-3 line-clamp-4 text-sm leading-relaxed text-os/75">{blurb}</div>
        )}
      </div>
    </>
  );
  const frame = `group block min-w-0 overflow-hidden rounded-xl border border-dbz-border bg-dbz-card transition-colors hover:border-dbz-orange ${className}`;
  return href ? (
    <article className="min-w-0">
      <Link
        href={href}
        className={`${frame} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dbz-yellow`}
      >
        {body}
      </Link>
    </article>
  ) : (
    <article className={frame}>{body}</article>
  );
}
