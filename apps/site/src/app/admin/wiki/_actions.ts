"use server";

import { db, schema } from "@/lib/db";
// Garde admin unique du site (`lib/session`) : elle joint bien `ba_account` sur
// le provider Discord ET reconnaît la session admin par token (/admin-access).
// La copie locale qui vivait ici ignorait les deux : un admin connecté par token
// voyait /admin/wiki mais toutes ses écritures repartaient vers /signin, et une
// session portant plusieurs comptes liés pouvait résoudre le mauvais compte.
import { getCurrentUser, requireAdmin, revisionActorOf } from "@/lib/session";
import { recordRevisionStrict } from "@/lib/wiki-revisions";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .toLowerCase()
    .replace(/^-+|-+$/g, "");
}

export async function createCategory(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const parentId = String(formData.get("parentId") ?? "") || null;
  const order = Number(formData.get("order") ?? 0);
  if (!name) return;
  const slug = slugify(name);
  const actor = revisionActorOf(await getCurrentUser());
  await db.transaction(async (tx) => {
    if (parentId) {
      const [parent] = await tx
        .select({ id: schema.wikiCategories.id })
        .from(schema.wikiCategories)
        .where(and(eq(schema.wikiCategories.id, parentId), eq(schema.wikiCategories.visible, true)))
        .limit(1);
      if (!parent) throw new Error("Visible parent category not found");
    }
    const [after] = await tx
      .insert(schema.wikiCategories)
      .values({ name, slug, parentId, order })
      .returning();
    await recordRevisionStrict({ table: "WikiCategory", action: "create", after, actor }, tx);
  });
  revalidatePath("/admin/wiki");
  revalidatePath("/wiki");
  revalidatePath("/wiki/[...slug]", "page");
  revalidatePath("/sitemap.xml");
  redirect("/admin/wiki");
}

export async function updateCategory(id: string, formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const parentId = String(formData.get("parentId") ?? "") || null;
  const order = Number(formData.get("order") ?? 0);
  if (!name) return;
  const nextSlug = slugify(name);
  const actor = revisionActorOf(await getCurrentUser());
  let previousSlug = "";
  await db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(schema.wikiCategories)
      .where(eq(schema.wikiCategories.id, id))
      .limit(1);
    if (!before) throw new Error("Wiki category not found");
    if (parentId) {
      if (parentId === id) throw new Error("Wiki category cannot be its own parent");
      const [parent] = await tx
        .select({ id: schema.wikiCategories.id })
        .from(schema.wikiCategories)
        .where(and(eq(schema.wikiCategories.id, parentId), eq(schema.wikiCategories.visible, true)))
        .limit(1);
      if (!parent) throw new Error("Visible parent category not found");
    }
    const [after] = await tx
      .update(schema.wikiCategories)
      .set({ name, slug: nextSlug, parentId, order })
      .where(eq(schema.wikiCategories.id, id))
      .returning();
    if (!after) throw new Error("Wiki category update failed");
    previousSlug = before.slug;
    await recordRevisionStrict(
      { table: "WikiCategory", id, action: "update", before, after, actor },
      tx,
    );
  });
  revalidatePath("/admin/wiki");
  revalidatePath("/wiki");
  revalidatePath("/wiki/[...slug]", "page");
  revalidatePath("/sitemap.xml");
  if (previousSlug) revalidatePath(`/wiki/${previousSlug}`);
  revalidatePath(`/wiki/${nextSlug}`);
  redirect("/admin/wiki");
}

export async function deleteCategory(id: string) {
  await requireAdmin();
  const actor = revisionActorOf(await getCurrentUser());
  let slug = "";
  await db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(schema.wikiCategories)
      .where(eq(schema.wikiCategories.id, id))
      .limit(1);
    if (!before) throw new Error("Wiki category not found");
    if (!before.visible) return;
    const [after] = await tx
      .update(schema.wikiCategories)
      .set({ visible: false })
      .where(eq(schema.wikiCategories.id, id))
      .returning();
    if (!after) throw new Error("Wiki category archive failed");
    slug = before.slug;
    await recordRevisionStrict(
      { table: "WikiCategory", id, action: "visibility", before, after, actor },
      tx,
    );
  });
  revalidatePath("/admin/wiki");
  revalidatePath("/wiki");
  revalidatePath("/wiki/[...slug]", "page");
  revalidatePath("/sitemap.xml");
  if (slug) revalidatePath(`/wiki/${slug}`);
  redirect("/admin/wiki");
}

export async function createPage(formData: FormData) {
  await requireAdmin();
  const title = String(formData.get("title") ?? "").trim();
  const categoryId = String(formData.get("categoryId") ?? "");
  const body = String(formData.get("body") ?? "");
  const order = Number(formData.get("order") ?? 0);
  if (!title || !categoryId) return;
  const slug = slugify(title);
  const actor = revisionActorOf(await getCurrentUser());
  await db.transaction(async (tx) => {
    const [category] = await tx
      .select({ id: schema.wikiCategories.id })
      .from(schema.wikiCategories)
      .where(and(eq(schema.wikiCategories.id, categoryId), eq(schema.wikiCategories.visible, true)))
      .limit(1);
    if (!category) throw new Error("Wiki category not found");
    const [after] = await tx
      .insert(schema.wikiPages)
      .values({ title, slug, categoryId, body, order, updatedAt: new Date() })
      .returning();
    await recordRevisionStrict({ table: "WikiPage", action: "create", after, actor }, tx);
  });
  revalidatePath("/admin/wiki");
  revalidatePath("/wiki");
  revalidatePath("/wiki/[...slug]", "page");
  revalidatePath("/sitemap.xml");
  redirect("/admin/wiki");
}

export async function updatePage(id: string, formData: FormData) {
  await requireAdmin();
  const title = String(formData.get("title") ?? "").trim();
  const categoryId = String(formData.get("categoryId") ?? "");
  const body = String(formData.get("body") ?? "");
  const order = Number(formData.get("order") ?? 0);
  if (!title || !categoryId) return;
  const slug = slugify(title);
  const actor = revisionActorOf(await getCurrentUser());
  let previousSlug = "";
  await db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(schema.wikiPages)
      .where(eq(schema.wikiPages.id, id))
      .limit(1);
    if (!before) throw new Error("Wiki page not found");
    const [category] = await tx
      .select({ id: schema.wikiCategories.id })
      .from(schema.wikiCategories)
      .where(and(eq(schema.wikiCategories.id, categoryId), eq(schema.wikiCategories.visible, true)))
      .limit(1);
    if (!category) throw new Error("Wiki category not found");
    const [after] = await tx
      .update(schema.wikiPages)
      .set({ title, slug, categoryId, body, order, updatedAt: new Date() })
      .where(eq(schema.wikiPages.id, id))
      .returning();
    if (!after) throw new Error("Wiki page update failed");
    previousSlug = before.slug;
    await recordRevisionStrict(
      { table: "WikiPage", id, action: "update", before, after, actor },
      tx,
    );
  });
  revalidatePath("/admin/wiki");
  revalidatePath("/wiki");
  revalidatePath("/wiki/[...slug]", "page");
  revalidatePath("/sitemap.xml");
  if (previousSlug) revalidatePath(`/wiki/${previousSlug}`);
  revalidatePath(`/wiki/${slug}`);
  redirect("/admin/wiki");
}

export async function deletePage(id: string) {
  await requireAdmin();
  const actor = revisionActorOf(await getCurrentUser());
  let slug = "";
  await db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(schema.wikiPages)
      .where(eq(schema.wikiPages.id, id))
      .limit(1);
    if (!before) throw new Error("Wiki page not found");
    if (!before.visible) return;
    const [after] = await tx
      .update(schema.wikiPages)
      .set({ visible: false, updatedAt: new Date() })
      .where(eq(schema.wikiPages.id, id))
      .returning();
    if (!after) throw new Error("Wiki page archive failed");
    slug = before.slug;
    await recordRevisionStrict(
      { table: "WikiPage", id, action: "visibility", before, after, actor },
      tx,
    );
  });
  revalidatePath("/admin/wiki");
  revalidatePath("/wiki");
  revalidatePath("/wiki/[...slug]", "page");
  revalidatePath("/sitemap.xml");
  if (slug) revalidatePath(`/wiki/${slug}`);
  redirect("/admin/wiki");
}

/**
 * Upload une image vers le bot (`POST /api/assets/upload`). Next gère le
 * multipart nativement (le proxy /api/bot-admin lit `req.text()` et corromprait
 * les bytes binaires → on passe par cette server action). Le token admin reste
 * server-only. Retourne le **chemin DB relatif** (`./assets/wiki/...`) à insérer
 * dans le markdown : `WikiMarkdown` le résout en URL via `assetUrl()` au rendu,
 * donc l'image survit à un changement de domaine (pas d'hôte bot figé dans le
 * contenu).
 */
