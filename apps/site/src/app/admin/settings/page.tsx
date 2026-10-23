"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  Coins,
  Hash,
  MessageSquare,
  Power,
  Settings as SettingsIcon,
  Shield,
  ShieldAlert,
  Trash2,
  Trophy,
  Wrench,
  Ticket,
  Film,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { StatusBadge } from "@aphrody/shenron-ui/admin";
import { useTranslations } from "next-intl";
import { useConfirm } from "@/components/admin/admin-ui";
import { EmptyState, ErrorState, errorMessage, SkeletonRows } from "@/components/admin/bot/BotUi";
import { useBotFormat } from "@/components/admin/bot/useBotFormat";
import { api } from "@/lib/admin-api";
import { ChannelSelect } from "@/components/admin/ChannelSelect";
import { RoleSelect } from "@/components/admin/RoleSelect";
import { JsonEditor, looksLikeJson } from "@/components/admin/JsonEditor";

interface SettingDef {
  key: string;
  type: "int" | "float" | "snowflake" | "string" | "bool";
  description: string;
  default?: unknown;
  min?: number;
  max?: number;
  category?: string;
  channelType?: "text" | "voice" | "category" | "any";
  prefix?: boolean;
}

interface CurrentSetting {
  key: string;
  value: string;
}

const CATEGORY_ICON: Record<string, React.ElementType> = {
  xp: Trophy,
  economy: Coins,
  channels: Hash,
  roles: Shield,
  features: Power,
  moderation: ShieldAlert,
  anti_invite: MessageSquare,
  tickets: Ticket,
  gifs: Film,
  advanced: Wrench,
};

const TICKET_KINDS = ["report", "achat", "shop", "abus", "staff"] as const;
const TICKET_KIND_EMOJI: Record<(typeof TICKET_KINDS)[number], string> = {
  report: "🚨",
  achat: "🛒",
  shop: "🏪",
  abus: "⚠️",
  staff: "📝",
};
const TICKET_ACCESS_PREFIX = "tickets.access.";

const CATEGORY_ORDER = [
  "features",
  "channels",
  "roles",
  "xp",
  "economy",
  "moderation",
  "anti_invite",
  "tickets",
  "gifs",
  "advanced",
];

export default function SettingsPage() {
  const t = useTranslations("adminBot.settings");
  const { confirm, dialog } = useConfirm();
  const qc = useQueryClient();

  const schema = useQuery({
    queryKey: ["settings", "schema"],
    queryFn: () => api.get<{ keys: SettingDef[] }>("/settings/schema"),
    staleTime: 5 * 60_000,
  });

  const current = useQuery({
    queryKey: ["settings", "current"],
    queryFn: () =>
      api.get<{ rows: CurrentSetting[]; total?: number }>("/database/guild_settings?limit=500"),
  });

  const [toast, setToast] = useState<{
    type: "success" | "error";
    msg: string;
  } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  const set = useMutation({
    mutationFn: (data: { key: string; value: string }) => api.post("/services/settings/set", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      setToast({ type: "success", msg: t("saved") });
    },
    onError: (err: Error) => setToast({ type: "error", msg: t("failed", { error: err.message }) }),
  });
  const unset = useMutation({
    mutationFn: (key: string) => api.post("/services/settings/unset", { key }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      setToast({ type: "success", msg: t("reset") });
    },
    onError: (err: Error) => setToast({ type: "error", msg: t("failed", { error: err.message }) }),
  });

  const valueMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of current.data?.rows ?? []) m.set(r.key, r.value);
    return m;
  }, [current.data]);

  const grouped = useMemo(() => {
    const all = schema.data?.keys ?? [];
    const byCat = new Map<string, SettingDef[]>();
    for (const k of all) {
      const cat = k.category ?? "advanced";
      if (!byCat.has(cat)) byCat.set(cat, []);
      byCat.get(cat)!.push(k);
    }
    return CATEGORY_ORDER.filter((c) => byCat.has(c)).map((c) => ({
      category: c,
      keys: byCat.get(c)!,
    }));
  }, [schema.data]);

  const overriddenCount = current.data?.rows?.length ?? 0;
  const xpBoostRoles = useMemo(() => {
    const out: { roleId: string; multiplier: string }[] = [];
    for (const [k, v] of valueMap) {
      if (k.startsWith("xp.boost.role.")) out.push({ roleId: k.slice(14), multiplier: v });
    }
    return out;
  }, [valueMap]);

  const ticketAccessRoles = useMemo(() => {
    const out: Record<string, string[]> = { report: [], achat: [], shop: [], abus: [] };
    for (const [k, v] of valueMap) {
      if (!k.startsWith(TICKET_ACCESS_PREFIX)) continue;
      if (!/^(true|1)$/i.test(v)) continue;
      const rest = k.slice(TICKET_ACCESS_PREFIX.length); // "<kind>.<roleId>"
      const dot = rest.indexOf(".");
      if (dot === -1) continue;
      const kind = rest.slice(0, dot);
      const roleId = rest.slice(dot + 1);
      if (!(kind in out)) continue;
      out[kind]!.push(roleId);
    }
    return out;
  }, [valueMap]);

  const onUnset = async (key: string) => {
    const ok = await confirm({
      title: t("resetConfirmTitle"),
      description: t("resetConfirmBody", { key }),
      confirmLabel: t("resetConfirm"),
      tone: "danger",
    });
    if (ok) unset.mutate(key);
  };

  if (schema.isLoading) return <SkeletonRows count={4} className="h-16" />;
  if (schema.isError)
    return (
      <ErrorState
        message={errorMessage(schema.error)}
        onRetry={() => schema.refetch()}
        retrying={schema.isFetching}
      />
    );
  if (!grouped.length) return <EmptyState title={t("empty")} icon={<SettingsIcon />} />;

  return (
    <div className="space-y-4">
      {dialog}
      <div aria-live="polite" className="fixed right-4 top-4 z-50">
        {toast && (
          <div
            role={toast.type === "error" ? "alert" : "status"}
            className={`rounded-lg border px-4 py-3 text-sm shadow-xl ${
              toast.type === "success"
                ? "border-dbz-green/50 bg-card text-green-300"
                : "border-dbz-red/50 bg-card text-red-300"
            }`}
          >
            {toast.msg}
          </div>
        )}
      </div>
      <p className="max-w-3xl text-sm text-muted-foreground">
        {t("intro")}{" "}
        <span className="text-xs">
          {t("summary", {
            total: schema.data?.keys.filter((k) => !k.prefix).length ?? 0,
            overridden: overriddenCount,
          })}
        </span>
      </p>

      {grouped.map(({ category, keys }) => (
        <CategorySection
          key={category}
          category={category}
          keys={keys}
          valueMap={valueMap}
          onSet={(key, value) => set.mutate({ key, value })}
          onUnset={onUnset}
          xpBoostRoles={category === "xp" ? xpBoostRoles : undefined}
          ticketAccessRoles={category === "tickets" ? ticketAccessRoles : undefined}
          pending={set.isPending || unset.isPending}
        />
      ))}
    </div>
  );
}

const boldChunk = (chunks: React.ReactNode) => <strong>{chunks}</strong>;

function CategorySection({
  category,
  keys,
  valueMap,
  onSet,
  onUnset,
  xpBoostRoles,
  ticketAccessRoles,
  pending,
}: {
  category: string;
  keys: SettingDef[];
  valueMap: Map<string, string>;
  onSet: (key: string, value: string) => void;
  onUnset: (key: string) => void;
  xpBoostRoles?: { roleId: string; multiplier: string }[];
  ticketAccessRoles?: Record<string, string[]>;
  pending: boolean;
}) {
  const t = useTranslations("adminBot.settings");
  const label = t.has(`categories.${category}.label`)
    ? t(`categories.${category}.label`)
    : category;
  const desc = t.has(`categories.${category}.desc`) ? t(`categories.${category}.desc`) : "";
  // Cast: the icon union collapses to `never` under the canary React types.
  const Icon = (CATEGORY_ICON[category] ?? SettingsIcon) as React.ComponentType<{
    className?: string;
  }>;
  const [open, setOpen] = useState(category === "features" || category === "channels");
  const overridden = keys.filter((k) => !k.prefix && valueMap.has(k.key)).length;
  const total = keys.filter((k) => !k.prefix).length;

  return (
    <div className="min-w-0 rounded-xl border border-border bg-card">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-muted/30"
      >
        <Icon className="h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-foreground">{label}</h3>
          <p className="text-xs text-muted-foreground">{desc}</p>
          {category === "tickets" && ticketAccessRoles && (
            <TicketAccessEditor
              entries={ticketAccessRoles}
              onSet={(kind, roleId) => onSet(`${TICKET_ACCESS_PREFIX}${kind}.${roleId}`, "1")}
              onUnset={(kind, roleId) => onUnset(`${TICKET_ACCESS_PREFIX}${kind}.${roleId}`)}
              pending={pending}
            />
          )}
        </div>
        <StatusBadge tone={overridden > 0 ? "accent" : "neutral"}>
          {t("overriddenCount", { overridden, total })}
        </StatusBadge>
        <ChevronDown
          aria-hidden
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="border-t border-border p-4">
          <div className="space-y-2">
            {keys
              .filter((k) => !k.prefix)
              .map((k) => (
                <SettingRow
                  key={k.key}
                  def={k}
                  current={valueMap.get(k.key)}
                  onSet={(v) => onSet(k.key, v)}
                  onUnset={() => onUnset(k.key)}
                  pending={pending}
                />
              ))}
          </div>
          {category === "xp" && xpBoostRoles && (
            <XpBoostRoleEditor
              entries={xpBoostRoles}
              onSet={(roleId, mult) => onSet(`xp.boost.role.${roleId}`, mult)}
              onUnset={(roleId) => onUnset(`xp.boost.role.${roleId}`)}
              pending={pending}
            />
          )}
        </div>
      )}
    </div>
  );
}

function SettingRow({
  def,
  current,
  onSet,
  onUnset,
  pending,
}: {
  def: SettingDef;
  current: string | undefined;
  onSet: (value: string) => void;
  onUnset: () => void;
  pending: boolean;
}) {
  const t = useTranslations("adminBot.settings");
  const [draft, setDraft] = useState<string>(current ?? "");
  const [editing, setEditing] = useState(false);

  const isOverridden = current !== undefined;

  return (
    <div className="rounded-lg border border-border bg-background/40 p-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <code className="text-sm font-medium">{def.key}</code>
            {isOverridden && <StatusBadge tone="warning">{t("overridden")}</StatusBadge>}
            {!isOverridden && def.default !== undefined && (
              <span className="text-xs text-muted-foreground">
                {t("default", { value: String(def.default) })}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{def.description}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!editing && (
            <SettingValuePreview def={def} value={current ?? def.default?.toString() ?? ""} />
          )}
          <button
            type="button"
            onClick={() => {
              setDraft(current ?? "");
              setEditing(!editing);
            }}
            className="btn btn-ghost px-2"
          >
            {editing ? t("close") : isOverridden ? t("edit") : t("define")}
          </button>
          {isOverridden && (
            <button
              type="button"
              onClick={onUnset}
              className="btn btn-ghost px-2 text-red-400"
              title={t("resetTitle")}
              aria-label={t("resetTitle")}
            >
              <Trash2 aria-hidden className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
      {editing && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <SettingValueInput def={def} value={draft} onChange={setDraft} />
          <button
            type="button"
            onClick={() => {
              if (draft === "") return;
              onSet(draft);
              setEditing(false);
            }}
            disabled={pending || !draft}
            className="btn btn-primary"
          >
            {t("save")}
          </button>
        </div>
      )}
    </div>
  );
}

function SettingValueInput({
  def,
  value,
  onChange,
}: {
  def: SettingDef;
  value: string;
  onChange: (v: string) => void;
}) {
  const t = useTranslations("adminBot.settings");
  if (def.type === "snowflake" && def.key.startsWith("channel.")) {
    const types =
      def.channelType === "voice"
        ? [2, 13]
        : def.channelType === "category"
          ? [4]
          : def.channelType === "any"
            ? [0, 2, 4, 5, 13, 15]
            : [0, 5, 15];
    return <ChannelSelect value={value} onChange={onChange} types={types} className="flex-1" />;
  }
  if (def.type === "snowflake" && def.key.startsWith("role.")) {
    return <RoleSelect value={value} onChange={onChange} className="flex-1" />;
  }
  if (def.type === "snowflake") {
    return (
      <input
        className="input flex-1 font-mono text-xs"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t("snowflakePlaceholder")}
        aria-label={def.key}
      />
    );
  }
  if (def.type === "bool") {
    return (
      <select className="input flex-1" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{t("choose")}</option>
        <option value="true">{t("enabled")}</option>
        <option value="false">{t("disabled")}</option>
      </select>
    );
  }
  if (def.type === "int" || def.type === "float") {
    return (
      <input
        className="input flex-1"
        type="number"
        step={def.type === "float" ? "0.01" : "1"}
        min={def.min}
        max={def.max}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  // JSON editor pour les keys connues + auto-detect (valeur courante = JSON)
  const isJsonKey = def.key === "moderation.hierarchy" || looksLikeJson(value);
  if (def.type === "string" && isJsonKey) {
    return <JsonEditor value={value} onChange={onChange} rows={6} />;
  }
  return (
    <input className="input flex-1" value={value} onChange={(e) => onChange(e.target.value)} />
  );
}

function GifPreview({ url }: { url: string }) {
  const t = useTranslations("adminBot.settings");
  if (!/^https:\/\//i.test(url))
    return <span className="text-xs italic text-muted-foreground">{t("httpsRequired")}</span>;
  return (
    <div className="flex items-center gap-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        className="h-10 w-16 rounded border border-zinc-800 object-cover"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = "none";
        }}
      />
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="text-xs text-muted-foreground hover:text-primary"
        title={url}
        aria-label={t("openGif")}
      >
        <ExternalLink aria-hidden className="h-3 w-3" />
      </a>
    </div>
  );
}

function SettingValuePreview({ def, value }: { def: SettingDef; value: string }) {
  const t = useTranslations("adminBot.settings");
  const fmt = useBotFormat();
  if (!value) return <span className="text-xs italic text-muted-foreground">{t("notSet")}</span>;
  if (def.key.startsWith("gif.")) {
    return <GifPreview url={value} />;
  }
  if (def.type === "snowflake" && def.key.startsWith("channel.")) {
    return <ChannelInline channelId={value} />;
  }
  if (def.type === "snowflake" && def.key.startsWith("role.")) {
    return <RoleInline roleId={value} />;
  }
  if (def.type === "bool") {
    const on = value === "true" || value === "1";
    return <StatusBadge tone={on ? "success" : "danger"}>{on ? t("on") : t("off")}</StatusBadge>;
  }
  if (def.type === "int" || def.type === "float") {
    return (
      <code className="rounded bg-muted px-2 py-1 text-xs font-mono">
        {fmt.number(Number(value))}
      </code>
    );
  }
  return <code className="rounded bg-muted px-2 py-1 text-xs font-mono">{value}</code>;
}

function ChannelInline({ channelId }: { channelId: string }) {
  const { data } = useQuery({
    queryKey: ["discord", "channels"],
    queryFn: () =>
      api.get<{ channels: { id: string; name: string; type: number }[] }>("/discord/channels"),
    staleTime: 30_000,
  });
  const c = data?.channels.find((x) => x.id === channelId);
  return <code className="rounded bg-muted px-2 py-1 text-xs">{c ? `#${c.name}` : channelId}</code>;
}

function RoleInline({ roleId }: { roleId: string }) {
  const { data } = useQuery({
    queryKey: ["discord", "roles"],
    queryFn: () =>
      api.get<{ roles: { id: string; name: string; color: number }[] }>("/discord/roles"),
    staleTime: 30_000,
  });
  const r = data?.roles.find((x) => x.id === roleId);
  return (
    <code
      className="rounded bg-muted px-2 py-1 text-xs"
      style={
        r && r.color !== 0 ? { color: `#${r.color.toString(16).padStart(6, "0")}` } : undefined
      }
    >
      {r ? `@${r.name}` : roleId}
    </code>
  );
}

function XpBoostRoleEditor({
  entries,
  onSet,
  onUnset,
  pending,
}: {
  entries: { roleId: string; multiplier: string }[];
  onSet: (roleId: string, mult: string) => void;
  onUnset: (roleId: string) => void;
  pending: boolean;
}) {
  const t = useTranslations("adminBot.settings");
  const [roleId, setRoleId] = useState("");
  const [mult, setMult] = useState("1.5");
  return (
    <div className="mt-4 rounded-lg border border-border bg-background/40 p-3">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t("xpBoost.title", { count: entries.length })}
      </h4>
      <p className="mb-3 text-xs text-muted-foreground">
        {t.rich("xpBoost.hint", { strong: boldChunk })}
      </p>
      <div className="space-y-2">
        {entries.map((e) => (
          <div key={e.roleId} className="flex items-center gap-2">
            <RoleInline roleId={e.roleId} />
            <span className="text-xs text-muted-foreground">×</span>
            <code className="rounded bg-muted px-2 py-1 text-xs">{e.multiplier}</code>
            <button
              type="button"
              onClick={() => onUnset(e.roleId)}
              className="btn btn-ghost px-2 text-red-400"
              aria-label={t("remove")}
              title={t("remove")}
            >
              <Trash2 aria-hidden className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <RoleSelect value={roleId} onChange={setRoleId} />
        <input
          className="input"
          type="number"
          step="0.1"
          min="0.1"
          value={mult}
          onChange={(e) => setMult(e.target.value)}
          placeholder="1.5"
          aria-label={t("xpBoost.multiplier")}
        />
        <button
          type="button"
          onClick={() => {
            if (!roleId || !mult) return;
            onSet(roleId, mult);
            setRoleId("");
            setMult("1.5");
          }}
          disabled={pending || !roleId || !mult}
          className="btn btn-primary"
        >
          {t("xpBoost.add")}
        </button>
      </div>
    </div>
  );
}

function TicketAccessEditor({
  entries,
  onSet,
  onUnset,
  pending,
}: {
  entries: Record<string, string[]>;
  onSet: (kind: string, roleId: string) => void;
  onUnset: (kind: string, roleId: string) => void;
  pending: boolean;
}) {
  const t = useTranslations("adminBot.settings");
  const [kind, setKind] = useState<(typeof TICKET_KINDS)[number]>("report");
  const [roleId, setRoleId] = useState("");
  const current = entries[kind] ?? [];

  const sync = useMutation({
    mutationFn: () =>
      api.post<{ ok: boolean; updated: number; skipped: number }>("/tickets/sync-access"),
  });

  return (
    <div className="mt-4 rounded-lg border border-border bg-background/40 p-3">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t("tickets.title")}
      </h4>
      <p className="mb-3 text-xs text-muted-foreground">
        {t.rich("tickets.hint", { strong: boldChunk })}
      </p>
      <div className="mb-3 flex flex-wrap gap-2">
        {TICKET_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={`btn ${kind === k ? "btn-primary" : "btn-ghost"}`}
          >
            {TICKET_KIND_EMOJI[k]} {t(`tickets.kinds.${k}`)}
            <span className="ml-1 text-xs opacity-70">({(entries[k] ?? []).length})</span>
          </button>
        ))}
      </div>
      <div className="space-y-2">
        {current.length === 0 && (
          <p className="text-xs italic text-muted-foreground">
            {t("tickets.none", { kind: t(`tickets.kinds.${kind}`) })}
          </p>
        )}
        {current.map((rid) => (
          <div key={rid} className="flex items-center gap-2">
            <RoleInline roleId={rid} />
            <button
              type="button"
              onClick={() => onUnset(kind, rid)}
              className="btn btn-ghost px-2 text-red-400"
              aria-label={t("remove")}
              title={t("remove")}
            >
              <Trash2 aria-hidden className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <RoleSelect value={roleId} onChange={setRoleId} className="flex-1" />
        <button
          type="button"
          onClick={() => {
            if (!roleId || current.includes(roleId)) return;
            onSet(kind, roleId);
            setRoleId("");
          }}
          disabled={pending || !roleId || current.includes(roleId)}
          className="btn btn-primary"
        >
          {t("add")}
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <button
          type="button"
          onClick={() => sync.mutate()}
          disabled={sync.isPending}
          className="btn btn-ghost"
        >
          <RefreshCw aria-hidden className={`h-3 w-3 ${sync.isPending ? "animate-spin" : ""}`} />
          {t("tickets.syncOpen")}
        </button>
        {sync.data && (
          <span role="status" className="text-xs text-muted-foreground">
            {t("tickets.synced", { updated: sync.data.updated })}
            {sync.data.skipped > 0
              ? ` · ${t("tickets.skipped", { skipped: sync.data.skipped })}`
              : ""}
          </span>
        )}
        {sync.isError && (
          <span role="alert" className="text-xs text-red-400">
            {sync.error instanceof Error ? sync.error.message : t("syncFailed")}
          </span>
        )}
      </div>
    </div>
  );
}
