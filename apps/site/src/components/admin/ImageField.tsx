/* oxlint-disable jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions, jsx-a11y/prefer-tag-over-role -- legacy UI kept as-is (behavior-preserving lint pass) */
"use client";

import { FolderOpen, ImageOff, Loader2, Upload, X } from "lucide-react";
import { useCallback, useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import { AdminMediaPicker } from "@/components/admin/AdminMediaPicker";
import { assetUrl } from "@/lib/assets";
import { ADMIN_IMAGE_ACCEPT, adminImageUploadError } from "@/lib/admin-image-upload";
import { useAdminImageText } from "@/lib/admin-image-text";
import { ImageCropDialog } from "@/components/admin/ImageCropDialog";

interface Props {
  /** Valeur courante (chemin DB `./assets/...`, `/wiki/...` ou URL http). */
  value: string;
  onChange: (value: string) => void;
  /** Sous-dossier wiki cible pour l'upload (slug). Défaut `uploads`. */
  subdir?: string;
  /** Nom de colonne (pour l'a11y / placeholder). */
  column?: string;
  onUploadStateChange?: (uploading: boolean) => void;
  cropAspect?: "square" | "portrait" | "landscape" | "wide";
}

/**
 * Champ image réutilisable pour les éditeurs `/admin` : glisser-déposer depuis
 * le PC, parcourir, coller (presse-papier), saisie manuelle d'URL/chemin, et
 * sélection dans la galerie des images déjà uploadées. L'upload passe par
 * `POST /api/admin/upload` (admin-gated, relais vers le bot) et stocke le chemin
 * DB renvoyé (`./assets/wiki/<subdir>/<uuid>.<ext>`).
 */
export function ImageField({
  value,
  onChange,
  subdir = "uploads",
  column,
  onUploadStateChange,
  cropAspect = "square",
}: Props) {
  const t = useAdminImageText();
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Garde anti-concurrence (ref → pas de dépendance/closure obsolète dans upload).
  const busyRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const preview = value ? assetUrl(value) : "";

  const upload = useCallback(
    async (file: File) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setUploading(true);
      onUploadStateChange?.(true);
      setError(null);
      try {
        const invalid = await adminImageUploadError(file);
        if (invalid) {
          setError(t(invalid));
          return;
        }
        const fd = new FormData();
        fd.append("file", file, file.name);
        fd.append("subdir", subdir);
        const res = await fetch("/api/admin/upload", {
          method: "POST",
          body: fd,
          credentials: "same-origin",
        });
        const data = (await res.json().catch(() => ({}))) as { path?: string; error?: string };
        if (!res.ok || !data.path) {
          throw new Error(
            t(res.status === 413 ? "tooLarge" : res.status === 415 ? "invalid" : "failed"),
          );
        }
        onChange(data.path);
      } catch (e) {
        setError(e instanceof Error ? e.message : t("failed"));
      } finally {
        setUploading(false);
        busyRef.current = false;
        onUploadStateChange?.(false);
      }
    },
    [onChange, subdir, onUploadStateChange, t],
  );

  const chooseImage = useCallback(
    async (file: File) => {
      const invalid = await adminImageUploadError(file);
      if (invalid) {
        setError(t(invalid));
        return;
      }
      setError(null);
      setPendingFile(file);
    },
    [t],
  );

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragging(false);
      if (busyRef.current) return;
      const file = e.dataTransfer.files?.[0];
      if (file) {
        void chooseImage(file);
        return;
      }
      // Un visuel peut aussi arriver depuis un navigateur, un DAM ou un tableur :
      // dans ce cas le navigateur ne fournit pas de File mais une URL glissée.
      const url = e.dataTransfer
        .getData("text/uri-list")
        .split("\n")
        .find((line) => line && !line.startsWith("#"))
        ?.trim();
      if (url && /^https?:\/\//i.test(url)) {
        onChange(url);
        setError(null);
        return;
      }
      setError(t("dropError"));
    },
    [onChange, chooseImage, t],
  );

  const onPaste = useCallback(
    (e: ClipboardEvent<HTMLDivElement>) => {
      if (busyRef.current) return;
      const file = Array.from(e.clipboardData.files).find((f) => f.type.startsWith("image/"));
      if (file) {
        e.preventDefault();
        void chooseImage(file);
        return;
      }
      const url =
        e.clipboardData.getData("text/uri-list").trim() ||
        e.clipboardData.getData("text/plain").trim();
      if (/^https?:\/\//i.test(url)) {
        e.preventDefault();
        onChange(url);
        setError(null);
      }
    },
    [onChange, chooseImage],
  );

  return (
    <div className="space-y-2">
      {cropAspect === "portrait" && (
        <p className="text-xs leading-5 text-white/55">{t("portraitBaseHint")}</p>
      )}
      {/* Zone glisser-déposer / coller / parcourir */}
      <div
        role="button"
        tabIndex={0}
        aria-label={`${t("choose")}${column ? ` · ${column}` : ""}`}
        aria-disabled={uploading}
        aria-busy={uploading}
        onClick={() => {
          if (!busyRef.current) inputRef.current?.click();
        }}
        onKeyDown={(e) => {
          if (!busyRef.current && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!dragging) setDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          // Ignore les dragleave vers un élément enfant (sinon flicker du surlignage).
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={onDrop}
        onPaste={onPaste}
        className={`relative flex cursor-pointer items-center gap-3 rounded-lg border-2 border-dashed p-3 transition-colors focus:outline-none focus:ring-2 focus:ring-dbz-orange/50 ${
          dragging
            ? "border-dbz-orange bg-dbz-orange/10"
            : "border-dbz-border/70 hover:border-dbz-orange/60 hover:bg-dbz-orange/5"
        }`}
      >
        {/* Aperçu */}
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded border border-dbz-border bg-black/30">
          {uploading ? (
            <Loader2 className="h-5 w-5 animate-spin text-dbz-orange" />
          ) : preview ? (
            // key={preview} → remonte un <img> neuf à chaque changement de source,
            // sinon le display:none posé par onError sur l'ancienne source resterait.
            <img
              key={preview}
              src={preview}
              alt=""
              className="h-full w-full object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <ImageOff className="h-5 w-5 text-white/50" />
          )}
        </div>

        {/* Texte d'invite */}
        <div className="min-w-0 flex-1">
          <p className="text-sm text-white/80">
            {uploading ? t("sending") : dragging ? t("release") : t("prompt")}
          </p>
          <p className="truncate text-[11px] text-white/50">{value || t("formats")}</p>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={ADMIN_IMAGE_ACCEPT}
          disabled={uploading}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void chooseImage(file);
            e.target.value = "";
          }}
        />
      </div>

      {/* Actions secondaires */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-ghost h-7 px-2 text-xs"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          <Upload className="h-3 w-3" />
          {t("browse")}
        </button>
        <button
          type="button"
          className="btn btn-ghost h-7 px-2 text-xs"
          onClick={() => setGalleryOpen(true)}
          disabled={uploading}
        >
          <FolderOpen className="h-3 w-3" />
          {t("gallery")}
        </button>
        {value && (
          <button
            type="button"
            className="btn btn-ghost h-7 px-2 text-xs text-red-400 hover:border-red-500/50 hover:bg-red-500/10"
            onClick={() => {
              onChange("");
              setError(null);
            }}
            disabled={uploading}
          >
            <X className="h-3 w-3" />
            {t("clear")}
          </button>
        )}
      </div>

      {/* Saisie manuelle d'URL / chemin (fallback) */}
      <input
        className="input font-mono text-xs"
        value={value}
        placeholder={t("placeholder")}
        aria-label={`${t("path")}${column ? ` · ${column}` : ""}`}
        disabled={uploading}
        onChange={(e) => onChange(e.target.value)}
      />

      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}

      {galleryOpen && (
        <AdminMediaPicker
          onClose={() => setGalleryOpen(false)}
          onPick={(path) => {
            onChange(path);
            setError(null);
            setGalleryOpen(false);
          }}
        />
      )}

      {pendingFile && (
        <ImageCropDialog
          file={pendingFile}
          defaultAspect={cropAspect}
          onCancel={() => setPendingFile(null)}
          onConfirm={(cropped) => {
            setPendingFile(null);
            void upload(cropped);
          }}
        />
      )}
    </div>
  );
}
