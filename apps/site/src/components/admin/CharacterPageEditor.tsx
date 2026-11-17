"use client";

import { useQuery } from "@tanstack/react-query";
import { Couches, Lien, Livre, Plus, ZSword } from "@aphrody/shenron-ui/icones";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo } from "react";
import { useAdminCatalogText } from "@/lib/admin-catalog-text";
import { apiAt } from "@/lib/admin-api";
import { crudBase } from "@/lib/wiki-tables";

interface Option {
  value: string;
  label: string;
}

interface SagaVariant {
  id: number;
  characterId: number;
  sagaId: number;
  slug: string;
  label: string;
  displayName: string | null;
  form: string | null;
  image: string | null;
  summary: string | null;
  visible: boolean;
  sortOrder: number;
}

const characterClient = apiAt(crudBase("db_characters"));
const continuityClient = apiAt(crudBase("db_character_continuities"));
const variantClient = apiAt(crudBase("db_character_variants"));

export function CharacterPageEditor() {
  const t = useAdminCatalogText();
  const router = useRouter();
  const searchParams = useSearchParams();
  const characterOptionsQuery = useQuery({
    queryKey: ["character-editor", "character-options"],
    queryFn: () =>
      characterClient
        .get<{ options: Option[] }>("/db_characters?as=options")
        .then((r) => r.options),
    staleTime: 5 * 60_000,
  });
  const characterOptions = characterOptionsQuery.data ?? [];
  const queryCharacterId = searchParams.get("characterId") ?? "";
  const defaultCharacterId =
    characterOptions.find((option) => option.label.toLocaleLowerCase().includes("goku"))?.value ??
    characterOptions[0]?.value ??
    "";
  const characterId = queryCharacterId || defaultCharacterId;
  const continuityQuery = useQuery({
    queryKey: ["character-editor", "versions", characterId],
    queryFn: () =>
      continuityClient.get<{ ids: string[] }>(
        `/db_character_continuities?as=relations&col=characterId&id=${encodeURIComponent(characterId)}&target=versionCharacterId`,
      ),
    enabled: /^\d+$/.test(characterId),
    staleTime: 60_000,
  });
  const versionIds = continuityQuery.data?.ids ?? [];
  const versionOptions = characterOptions.filter(
    (option) => option.value === characterId || versionIds.includes(option.value),
  );
  const requestedVersionId = searchParams.get("versionId") ?? "";
  const versionId = continuityQuery.isLoading
    ? requestedVersionId || characterId
    : versionOptions.some((option) => option.value === requestedVersionId)
      ? requestedVersionId
      : characterId;
  const variantsQuery = useQuery({
    queryKey: ["character-editor", "sagas", versionId],
    queryFn: () =>
      variantClient.get<{ rows: SagaVariant[]; total: number }>(
        `/db_character_variants?as=byParent&col=characterId&id=${encodeURIComponent(versionId)}`,
      ),
    enabled: /^\d+$/.test(versionId),
    staleTime: 60_000,
  });
  const sagaVariants = useMemo(
    () =>
      (variantsQuery.data?.rows ?? []).toSorted(
        (left, right) => left.sortOrder - right.sortOrder || left.id - right.id,
      ),
    [variantsQuery.data?.rows],
  );
  const requestedVariantId = searchParams.get("variantId") ?? "";
  const selectedVariant = sagaVariants.find((variant) => String(variant.id) === requestedVariantId);
  const step = Math.max(1, Math.min(3, Number(searchParams.get("step") ?? 1) || 1));
  const characterLabel =
    characterOptions.find((option) => option.value === characterId)?.label ?? "";
  const versionLabel =
    versionOptions.find((option) => option.value === versionId)?.label ?? characterLabel;
  const sagaLabel = selectedVariant?.displayName || selectedVariant?.label || "";

  const updateQuery = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }
      router.replace(`/admin/wiki/characters?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  useEffect(() => {
    if (!queryCharacterId && defaultCharacterId) {
      updateQuery({ characterId: defaultCharacterId, versionId: defaultCharacterId, step: "1" });
    }
  }, [defaultCharacterId, queryCharacterId, updateQuery]);

  useEffect(() => {
    if (!continuityQuery.isLoading && requestedVersionId && versionId !== requestedVersionId) {
      updateQuery({ versionId, variantId: null, step: "1" });
    }
  }, [continuityQuery.isLoading, requestedVersionId, updateQuery, versionId]);

  function tableHref(table: string, parentId: string, workflowStep: string, editId?: string) {
    const params = new URLSearchParams({
      workflow: "character",
      characterId,
      versionId,
      variantId: selectedVariant ? String(selectedVariant.id) : "",
      parentId,
      workflowStep,
      characterLabel,
      versionLabel,
      sagaLabel,
      step: "3",
    });
    if (editId) params.set("editId", editId);
    return `/admin/database/${table}?${params.toString()}`;
  }

  const cards = selectedVariant
    ? [
        {
          key: "story",
          icon: Livre,
          href: tableHref("db_character_variants", versionId, "story", String(selectedVariant.id)),
          title: t("characterEditor.sections.story.title"),
          description: t("characterEditor.sections.story.description"),
        },
        {
          key: "relations",
          icon: Couches,
          href: tableHref("db_character_relations", String(selectedVariant.id), "relations"),
          title: t("characterEditor.sections.relations.title"),
          description: t("characterEditor.sections.relations.description"),
        },
        {
          key: "formsAndTechniques",
          icon: Couches,
          href: tableHref("db_character_variants", versionId, "forms", String(selectedVariant.id)),
          title: t("characterEditor.sections.formsAndTechniques.title"),
          description: t("characterEditor.sections.formsAndTechniques.description"),
        },
        {
          key: "techniqueUses",
          icon: Lien,
          href: tableHref(
            "db_character_variant_technique_uses",
            String(selectedVariant.id),
            "techniques",
          ),
          title: t("characterEditor.sections.techniqueUses.title"),
          description: t("characterEditor.sections.techniqueUses.description"),
        },
        {
          key: "battles",
          icon: ZSword,
          href: tableHref("db_character_variant_battles", String(selectedVariant.id), "battles"),
          title: t("characterEditor.sections.battles.title"),
          description: t("characterEditor.sections.battles.description"),
        },
        {
          key: "appearances",
          icon: Plus,
          href: tableHref(
            "db_character_variant_appearances",
            String(selectedVariant.id),
            "appearances",
          ),
          title: t("characterEditor.sections.appearances.title"),
          description: t("characterEditor.sections.appearances.description"),
        },
        {
          key: "additionalInformation",
          icon: Livre,
          href: tableHref(
            "db_character_variants",
            versionId,
            "additionalInformation",
            String(selectedVariant.id),
          ),
          title: t("characterEditor.sections.additionalInformation.title"),
          description: t("characterEditor.sections.additionalInformation.description"),
        },
        {
          key: "voiceActors",
          icon: Couches,
          href: tableHref(
            "db_character_variant_voice_actors",
            String(selectedVariant.id),
            "voiceActors",
          ),
          title: t("characterEditor.sections.voiceActors.title"),
          description: t("characterEditor.sections.voiceActors.description"),
        },
        {
          key: "animationCredits",
          icon: ZSword,
          href: tableHref(
            "db_character_variant_staff_credits",
            String(selectedVariant.id),
            "animationCredits",
          ),
          title: t("characterEditor.sections.animationCredits.title"),
          description: t("characterEditor.sections.animationCredits.description"),
        },
      ]
    : [];

  return (
    <main className="mx-auto w-full max-w-6xl space-y-5">
      <header className="dbz-panel space-y-2 p-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-dbz-blue-light">
          {t("characterEditor.eyebrow")}
        </p>
        <h1 className="font-saiyan text-2xl uppercase text-dbz-orange sm:text-3xl">
          {t("characterEditor.title")}
        </h1>
        <p className="max-w-3xl text-sm leading-6 text-white/70">{t("characterEditor.intro")}</p>
      </header>

      <nav aria-label={t("characterEditor.stepsLabel")} className="grid gap-2 sm:grid-cols-3">
        {[
          t("characterEditor.steps.chooseVersion"),
          t("characterEditor.steps.chooseSaga"),
          t("characterEditor.steps.editContent"),
        ].map((label, index) => {
          const number = index + 1;
          const active = step === number;
          const completed = step > number;
          return (
            <button
              key={label}
              type="button"
              disabled={number > 1 && !versionId}
              onClick={() => updateQuery({ step: String(number) })}
              aria-current={active ? "step" : undefined}
              className={`flex min-h-14 items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dbz-orange ${active ? "border-dbz-orange bg-dbz-orange/10 text-white" : completed ? "border-dbz-blue-light/40 bg-dbz-card text-white/80" : "border-dbz-border bg-dbz-card/50 text-white/60"}`}
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-current font-mono text-sm">
                {number}
              </span>
              <span className="text-xs font-bold uppercase tracking-wider">{label}</span>
            </button>
          );
        })}
      </nav>

      {step === 1 && (
        <section className="dbz-panel space-y-5 p-5" aria-labelledby="character-step-title">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-dbz-blue-light">
              {t("characterEditor.stepCounter", { current: "1", total: "3" })}
            </p>
            <h2 id="character-step-title" className="mt-1 font-saiyan text-xl uppercase text-white">
              {t("characterEditor.steps.chooseVersion")}
            </h2>
            <p className="mt-1 text-sm text-white/60">{t("characterEditor.versionHelp")}</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1.5">
              <span className="wiki-infobox-label">{t("characterEditor.character")}</span>
              <select
                className="input min-h-12"
                value={characterId}
                disabled={characterOptionsQuery.isLoading}
                onChange={(event) =>
                  updateQuery({
                    characterId: event.target.value,
                    versionId: event.target.value,
                    variantId: null,
                    step: "1",
                  })
                }
              >
                <option value="">{t("characterEditor.selectCharacter")}</option>
                {characterOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="wiki-infobox-label">{t("characterEditor.version")}</span>
              <select
                className="input min-h-12"
                value={versionId}
                disabled={continuityQuery.isLoading || versionOptions.length === 0}
                onChange={(event) =>
                  updateQuery({ versionId: event.target.value, variantId: null, step: "1" })
                }
              >
                {versionOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.value === characterId
                      ? `${option.label} · ${t("characterEditor.mainVersion")}`
                      : option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {continuityQuery.isError && (
            <p role="alert" className="text-sm text-red-300">
              {t("characterEditor.loadVersionsError")}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-dbz-border/50 pt-4">
            <a
              href={tableHref("db_character_continuities", characterId, "versions")}
              className="btn btn-ghost min-h-11"
            >
              <Couches className="h-4 w-4" />
              {t("characterEditor.manageVersions")}
            </a>
            <button
              type="button"
              onClick={() => updateQuery({ step: "2" })}
              disabled={!characterId || !versionId}
              className="btn btn-primary min-h-11"
            >
              {t("characterEditor.continue")}
            </button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="dbz-panel space-y-5 p-5" aria-labelledby="saga-step-title">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-dbz-blue-light">
              {t("characterEditor.stepCounter", { current: "2", total: "3" })}
            </p>
            <h2 id="saga-step-title" className="mt-1 font-saiyan text-xl uppercase text-white">
              {t("characterEditor.steps.chooseSaga")}
            </h2>
            <p className="mt-1 text-sm text-white/60">
              {t("characterEditor.selectedVersion", { version: versionLabel })}
            </p>
          </div>

          <label className="block space-y-1.5">
            <span className="wiki-infobox-label">{t("characterEditor.saga")}</span>
            <select
              className="input min-h-12"
              value={selectedVariant ? String(selectedVariant.id) : ""}
              disabled={variantsQuery.isLoading || sagaVariants.length === 0}
              onChange={(event) => updateQuery({ variantId: event.target.value || null })}
            >
              <option value="">{t("characterEditor.selectSaga")}</option>
              {sagaVariants.map((variant) => (
                <option key={variant.id} value={variant.id}>
                  {variant.label}
                  {variant.visible ? "" : ` · ${t("characterEditor.hidden")}`}
                </option>
              ))}
            </select>
          </label>

          {!variantsQuery.isLoading && sagaVariants.length === 0 && (
            <p className="rounded-lg border border-dbz-border bg-dbz-card/60 p-3 text-sm text-white/70">
              {t("characterEditor.noSagas")}
            </p>
          )}
          {variantsQuery.isError && (
            <p role="alert" className="text-sm text-red-300">
              {t("characterEditor.loadSagasError")}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-dbz-border/50 pt-4">
            <a
              href={tableHref("db_sagas", versionId, "sagaCatalog")}
              className="btn btn-ghost min-h-11"
            >
              <Plus className="h-4 w-4" />
              {t("characterEditor.createSaga")}
            </a>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => updateQuery({ step: "1" })}
                className="btn btn-ghost min-h-11"
              >
                {t("characterEditor.back")}
              </button>
              <a
                href={`${tableHref("db_character_variants", versionId, "saga")}&create=1`}
                className="btn btn-ghost min-h-11"
              >
                <Plus className="h-4 w-4" />
                {t("characterEditor.addSagaToVersion")}
              </a>
              <button
                type="button"
                onClick={() => updateQuery({ step: "3" })}
                disabled={!selectedVariant}
                className="btn btn-primary min-h-11"
              >
                {t("characterEditor.continue")}
              </button>
            </div>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="space-y-4" aria-labelledby="content-step-title">
          <div className="dbz-panel flex flex-wrap items-center justify-between gap-4 p-5">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-dbz-blue-light">
                {t("characterEditor.stepCounter", { current: "3", total: "3" })}
              </p>
              <h2 id="content-step-title" className="mt-1 font-saiyan text-xl uppercase text-white">
                {t("characterEditor.steps.editContent")}
              </h2>
              <p className="mt-1 text-sm text-white/70">
                {characterLabel} <span aria-hidden>›</span> {versionLabel}{" "}
                <span aria-hidden>›</span> {sagaLabel}
              </p>
            </div>
            <button
              type="button"
              onClick={() => updateQuery({ step: "2" })}
              className="btn btn-ghost min-h-11"
            >
              {t("characterEditor.changeSaga")}
            </button>
          </div>

          {!selectedVariant ? (
            <div className="dbz-panel space-y-3 p-5">
              <p className="text-sm text-white/70">{t("characterEditor.chooseSagaFirst")}</p>
              <button
                type="button"
                onClick={() => updateQuery({ step: "2" })}
                className="btn btn-primary min-h-11"
              >
                {t("characterEditor.backToSaga")}
              </button>
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {cards.map(({ key, icon: Icon, href, title, description }, index) => (
                  <a
                    key={key}
                    href={href}
                    className="dbz-panel group flex min-h-40 flex-col p-4 transition-colors hover:border-dbz-orange focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dbz-orange"
                  >
                    <span className="mb-4 flex size-9 items-center justify-center rounded-lg border border-dbz-border text-dbz-orange">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="text-sm font-bold text-white group-hover:text-dbz-orange">
                      {title}
                    </span>
                    <span className="mt-1 flex-1 text-xs leading-5 text-white/55">
                      {description}
                    </span>
                    <span className="mt-3 text-[10px] font-bold uppercase tracking-wider text-dbz-blue-light">
                      {t("characterEditor.editSection", { number: String(index + 1) })}
                    </span>
                  </a>
                ))}
              </div>

              <div className="dbz-panel flex flex-wrap items-center justify-between gap-3 p-4">
                <p className="text-xs text-white/60">{t("characterEditor.generalProfileHelp")}</p>
                <a
                  href={`/admin/wiki/studio/db_characters/${encodeURIComponent(versionId)}`}
                  className="btn btn-ghost min-h-11"
                >
                  <Livre className="h-4 w-4" />
                  {t("characterEditor.editGeneralProfile")}
                </a>
              </div>
            </>
          )}
        </section>
      )}
    </main>
  );
}
