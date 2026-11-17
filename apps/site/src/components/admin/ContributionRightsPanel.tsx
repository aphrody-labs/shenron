"use client";

/**
 * Réglage du droit de contribution — qui peut proposer une correction, et sur
 * quel périmètre (wiki / databooks).
 *
 * Deux blocs identiques, un par périmètre, parce que les deux ne se règlent pas
 * ensemble : le wiki peut rester ouvert à tous les membres pendant que les
 * databooks — dont 1 911 planches sur 11 778 portent une transcription fautive —
 * sont réservés à une équipe de relecture.
 */
import { useEffect, useState } from "react";
import { Chargement, Croix, Enregistrer, Plus } from "@aphrody/shenron-ui/icones";
import { RoleSelect, RoleBadge } from "@/components/admin/RoleSelect";
import { UserSelect } from "@/components/admin/UserSelect";
import { useWikiEditorialText } from "@/lib/wiki-editorial-text";
import {
  CONTRIBUTION_SCOPES,
  DEFAULT_CONTRIBUTION_RIGHTS,
  type ContributionMode,
  type ContributionRights,
  type ContributionScope,
  type ScopeRule,
} from "@/lib/contribution-rights-shared";

const MODES: ContributionMode[] = ["members", "restricted", "admin"];

export function ContributionRightsPanel() {
  const t = useWikiEditorialText();
  const [rights, setRights] = useState<ContributionRights>(DEFAULT_CONTRIBUTION_RIGHTS);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [envoi, setEnvoi] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let vivant = true;
    const controller = new AbortController();
    const headers = new Headers();
    if (loadAttempt > 0) headers.set("Cache-Control", "no-cache");
    fetch("/api/admin/contribution-rights", {
      credentials: "same-origin",
      signal: controller.signal,
      cache: "no-store",
      headers,
    })
      .then((r) => {
        if (!r.ok) throw new Error("rights_unavailable");
        return r.json();
      })
      .then((d) => {
        if (!d?.ok || !d.rights) throw new Error("rights_unavailable");
        if (vivant) {
          setRights(d.rights as ContributionRights);
          setLoadState("ready");
        }
        return undefined;
      })
      .catch(() => {
        if (vivant) setLoadState("error");
      });
    return () => {
      vivant = false;
      controller.abort();
    };
  }, [loadAttempt]);

  const majScope = (scope: ContributionScope, patch: Partial<ScopeRule>) =>
    setRights((r) => ({ ...r, [scope]: { ...r[scope], ...patch } }));

  const enregistrer = async () => {
    if (loadState !== "ready" || envoi) return;
    setEnvoi(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/contribution-rights", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rights }),
      });
      const d = await res.json();
      if (!res.ok || !d?.ok) throw new Error("échec");
      setRights(d.rights as ContributionRights);
      setMessage("rights.saved");
    } catch {
      setMessage("rights.saveFailed");
    } finally {
      setEnvoi(false);
    }
  };

  if (loadState === "loading") {
    return (
      <output className="flex items-center gap-2 text-sm text-os/75">
        <Chargement aria-hidden className="h-4 w-4 animate-spin motion-reduce:animate-none" />{" "}
        {t("rights.loading")}
      </output>
    );
  }
  if (loadState === "error")
    return (
      <div
        role="alert"
        className="space-y-3 rounded-xl border border-dbz-red/40 bg-dbz-card p-4 text-sm text-os"
      >
        <p>{t("rights.loadFailed")}</p>
        <button
          type="button"
          className="btn btn-ghost min-h-11"
          onClick={() => {
            setLoadState("loading");
            setLoadAttempt((attempt) => attempt + 1);
          }}
        >
          {t("rights.retry")}
        </button>
      </div>
    );

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-2">
        {CONTRIBUTION_SCOPES.map((scope) => (
          <BlocScope
            key={scope}
            scope={scope}
            rule={rights[scope]}
            onChange={(patch) => majScope(scope, patch)}
          />
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={enregistrer}
          disabled={envoi || loadState !== "ready"}
          className="btn btn-primary inline-flex min-h-12 items-center gap-2 disabled:opacity-60"
        >
          {envoi ? (
            <Chargement aria-hidden className="h-4 w-4 animate-spin motion-reduce:animate-none" />
          ) : (
            <Enregistrer aria-hidden className="h-4 w-4" />
          )}
          {t("rights.save")}
        </button>
        {message && <output className="text-sm text-os/75">{t(message)}</output>}
      </div>
    </div>
  );
}

function BlocScope({
  scope,
  rule,
  onChange,
}: {
  scope: ContributionScope;
  rule: ScopeRule;
  onChange: (patch: Partial<ScopeRule>) => void;
}) {
  const t = useWikiEditorialText();
  const [roleEnCours, setRoleEnCours] = useState("");
  const [membreEnCours, setMembreEnCours] = useState("");
  const restreint = rule.mode === "restricted";

  const ajouterRole = (id: string) => {
    if (!id || rule.roleIds.includes(id)) return;
    onChange({ roleIds: [...rule.roleIds, id] });
    setRoleEnCours("");
  };
  const ajouterMembre = (id: string) => {
    if (!id || rule.discordIds.includes(id)) return;
    onChange({ discordIds: [...rule.discordIds, id] });
    setMembreEnCours("");
  };

  return (
    <section className="rounded-xl border border-dbz-border bg-dbz-card p-5">
      <h3 className="font-display text-[15px] font-semibold text-os">
        {t(`rights.scopes.${scope}.label`)}
      </h3>
      <p className="mt-1 text-sm leading-relaxed text-os/75">{t(`rights.scopes.${scope}.hint`)}</p>

      <div className="mt-4 space-y-2">
        {MODES.map((m) => (
          <label
            key={m}
            htmlFor={`mode-${scope}-${m}`}
            aria-label={t(`rights.modes.${m}.label`)}
            className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/[0.04]"
          >
            <input
              id={`mode-${scope}-${m}`}
              type="radio"
              name={`mode-${scope}`}
              checked={rule.mode === m}
              onChange={() => onChange({ mode: m })}
              className="mt-1 accent-dbz-orange"
            />
            <span>
              <span className="block text-[14px] font-medium text-os">
                {t(`rights.modes.${m}.label`)}
              </span>
              <span className="block text-sm text-os/75">{t(`rights.modes.${m}.hint`)}</span>
            </span>
          </label>
        ))}
      </div>

      {restreint && (
        <div className="mt-5 space-y-5 border-t border-dbz-border pt-5">
          <div>
            <p className="mb-2 font-scouter text-[11px] uppercase tracking-[0.14em] text-os/75">
              {t("rights.roles")}
            </p>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {rule.roleIds.length === 0 && (
                <span className="text-sm text-os/75">{t("rights.noRoles")}</span>
              )}
              {rule.roleIds.map((id) => (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] py-0.5 pl-1 pr-0.5"
                >
                  <RoleBadge roleId={id} />
                  <button
                    type="button"
                    onClick={() => onChange({ roleIds: rule.roleIds.filter((r) => r !== id) })}
                    aria-label={t("rights.removeRole")}
                    className="grid min-h-11 min-w-11 place-items-center rounded-full text-os/75 hover:bg-white/10 hover:text-os"
                  >
                    <Croix className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <RoleSelect
                value={roleEnCours}
                onChange={setRoleEnCours}
                className="flex-1"
                placeholder={t("rights.selectRole")}
              />
              <button
                type="button"
                onClick={() => ajouterRole(roleEnCours)}
                disabled={!roleEnCours}
                aria-label={t("rights.addRole")}
                className="grid min-h-11 min-w-11 shrink-0 place-items-center rounded-lg border border-dbz-border text-os/85 transition-colors hover:border-dbz-orange/60 hover:text-os disabled:opacity-40"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div>
            <p className="mb-2 font-scouter text-[11px] uppercase tracking-[0.14em] text-os/75">
              {t("rights.members")}
            </p>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {rule.discordIds.length === 0 && (
                <span className="text-sm text-os/75">{t("rights.noMembers")}</span>
              )}
              {rule.discordIds.map((id) => (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-2 py-0.5 font-mono text-[11px] text-os/85"
                >
                  {id}
                  <button
                    type="button"
                    onClick={() =>
                      onChange({ discordIds: rule.discordIds.filter((d) => d !== id) })
                    }
                    aria-label={t("rights.removeMember")}
                    className="grid min-h-11 min-w-11 place-items-center rounded-full text-os/75 hover:bg-white/10 hover:text-os"
                  >
                    <Croix className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <UserSelect
                value={membreEnCours}
                onChange={setMembreEnCours}
                className="flex-1"
                placeholder={t("rights.selectMember")}
              />
              <button
                type="button"
                onClick={() => ajouterMembre(membreEnCours)}
                disabled={!membreEnCours}
                aria-label={t("rights.addMember")}
                className="grid min-h-11 min-w-11 shrink-0 place-items-center rounded-lg border border-dbz-border text-os/85 transition-colors hover:border-dbz-orange/60 hover:text-os disabled:opacity-40"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          {rule.roleIds.length === 0 && rule.discordIds.length === 0 && (
            <p className="rounded-lg border border-dbz-red/30 bg-dbz-red/[0.06] px-3 py-2 text-[12px] text-os/85">
              {t("rights.emptyRestricted")}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
