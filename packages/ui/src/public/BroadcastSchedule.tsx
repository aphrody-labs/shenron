/**
 * BroadcastSchedule — when and where a work airs: TV slots, then streaming
 * platforms grouped by region.
 *
 * The time zone is always printed next to a slot: "Sunday 23:15" without a
 * zone is a different hour for every reader. A region without a platform says
 * so instead of disappearing, and every outbound link announces its new tab.
 *
 * Server component. It only renders what it is given: no listing is inferred.
 */
import { workText, type WorkMessages } from "./work-messages";

export interface BroadcastSlot {
  /** Localised day, e.g. "Dimanche". */
  day: string;
  /** Local time, e.g. "23:15". */
  time: string;
  /** IANA zone or label, e.g. "Asia/Tokyo". */
  timeZone: string;
  channel: string;
  status?: "upcoming" | "ended";
}

export interface BroadcastPlatform {
  name: string;
  url: string;
}

export interface BroadcastRegion {
  /** Localised region label, e.g. "Europe". */
  region: string;
  platforms: readonly BroadcastPlatform[];
}

export interface BroadcastScheduleProps {
  messages: WorkMessages;
  slots?: readonly BroadcastSlot[];
  regions?: readonly BroadcastRegion[];
  className?: string;
}

const NO_SLOTS: readonly BroadcastSlot[] = [];
const NO_REGIONS: readonly BroadcastRegion[] = [];

export function BroadcastSchedule({
  messages,
  slots = NO_SLOTS,
  regions = NO_REGIONS,
  className = "",
}: BroadcastScheduleProps) {
  return (
    <div className={`grid min-w-0 gap-6 ${className}`}>
      {slots.length > 0 && (
        <ul className="grid min-w-0 gap-3">
          {slots.map((slot) => (
            <li
              key={`${slot.channel}-${slot.day}-${slot.time}`}
              className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1 rounded-xl border border-dbz-border bg-dbz-card p-4"
            >
              <span className="text-lg font-semibold text-os">
                {slot.day} <span className="font-mono tabular-nums">{slot.time}</span>
              </span>
              <span className="text-sm text-os/70">{slot.channel}</span>
              <span className="text-xs text-os/60">
                {workText(messages, "timeZone", { zone: slot.timeZone })}
              </span>
              {slot.status && (
                <span
                  className={`ml-auto rounded-full px-2.5 py-0.5 font-mono text-xs uppercase tracking-wider ${
                    slot.status === "upcoming"
                      ? "bg-dbz-orange text-dbz-bg"
                      : "border border-dbz-border text-os/60"
                  }`}
                >
                  {messages[slot.status]}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {regions.map((group) => (
        <section key={group.region} className="min-w-0">
          <h3 className="mb-3 font-mono text-xs uppercase tracking-wider text-dbz-orange">
            {group.region}
          </h3>
          {group.platforms.length === 0 ? (
            <p className="text-sm text-os/60">{messages.noPlatform}</p>
          ) : (
            <ul className="grid min-w-0 grid-cols-[repeat(auto-fill,minmax(min(100%,10rem),1fr))] gap-2">
              {group.platforms.map((platform) => (
                <li key={platform.url} className="min-w-0">
                  <a
                    href={platform.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-h-11 min-w-0 items-center justify-between gap-2 rounded-lg border border-dbz-border bg-dbz-card px-3 py-2 text-sm text-os transition-colors hover:border-dbz-orange focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dbz-yellow"
                  >
                    <span className="truncate">{platform.name}</span>
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      className="size-4 shrink-0 text-os/50"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M7 17L17 7M9 7h8v8" />
                    </svg>
                    <span className="sr-only">{messages.opensInNewTab}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
