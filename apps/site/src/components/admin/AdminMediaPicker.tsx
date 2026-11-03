"use client";
// SPDX-License-Identifier: Apache-2.0
import { useEffect, useId, useRef, useState } from "react";
import { ArrowLeft, FolderOpen, ImageOff, Loader2, X } from "lucide-react";
import { api } from "@/lib/admin-api";
import { assetUrl } from "@/lib/assets";
import { useAdminImageText } from "@/lib/admin-image-text";
import type { AdminMediaLibraryPage } from "@/lib/admin-media-library";
import styles from "./admin-media-picker.module.css";

type GalleryFile = { path: string; url: string; name: string };
const PAGE_SIZE = 60;

/** One image picker for the existing persistent uploads and the complete paginated CDN archive. */
export function AdminMediaPicker({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (path: string) => void;
}) {
  const text = useAdminImageText();
  const dialog = useRef<HTMLDialogElement>(null);
  const pathId = useId();
  const filterId = useId();
  const [source, setSource] = useState<"uploads" | "cdn">("uploads");
  const [files, setFiles] = useState<GalleryFile[]>([]);
  const [cdn, setCdn] = useState<AdminMediaLibraryPage | null>(null);
  const [directory, setDirectory] = useState("/assets/wiki/");
  const [pathInput, setPathInput] = useState(directory);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [unavailableImages, setUnavailableImages] = useState<Set<string>>(() => new Set());
  const remotePage = source === "cdn" ? page : 1;

  useEffect(() => {
    const previous = document.activeElement;
    const element = dialog.current;
    element?.showModal();
    return () => {
      element?.close();
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      // Retry requests and source changes share the same cancellation boundary.
      void attempt;
      await Promise.resolve();
      if (controller.signal.aborted) return;
      setLoading(true);
      setFailed(false);
      setUnavailableImages(new Set());
      try {
        if (source === "uploads") {
          const data = await api.get<{ files: GalleryFile[] }>("/assets/list?dir=wiki", {
            signal: controller.signal,
          });
          if (!controller.signal.aborted) setFiles(data.files ?? []);
        } else {
          const response = await fetch(
            `/api/admin/media-library?${new URLSearchParams({ path: directory, page: String(remotePage) })}`,
            { signal: controller.signal, cache: "no-store" },
          );
          if (!response.ok) throw new Error("Media library unavailable");
          const data = (await response.json()) as AdminMediaLibraryPage;
          if (!controller.signal.aborted) setCdn(data);
        }
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- Explicit retry must restart the network request even when its directory is unchanged.
  }, [source, directory, remotePage, attempt]);

  const matching = (source === "cdn" ? (cdn?.files ?? []) : files).filter((file) =>
    file.name.toLocaleLowerCase().includes(filter.toLocaleLowerCase()),
  );
  const pageCount =
    source === "cdn" ? (cdn?.totalPages ?? 1) : Math.max(1, Math.ceil(matching.length / PAGE_SIZE));
  const shown =
    source === "cdn" ? matching : matching.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const navigate = (path: string) => {
    setDirectory(path);
    setPathInput(path);
    setPage(1);
    setFilter("");
  };

  return (
    <dialog
      ref={dialog}
      aria-label={text("galleryTitle")}
      className={styles.dialog}
      onCancel={onClose}
    >
      <header className={styles.header}>
        <h2>{text("galleryTitle")}</h2>
        <button type="button" onClick={onClose} aria-label={text("close")}>
          <X aria-hidden="true" size={20} />
        </button>
      </header>
      <fieldset className={styles.tabs} aria-label={text("librarySource")}>
        {(["uploads", "cdn"] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={source === value}
            onClick={() => {
              setSource(value);
              setPage(1);
              setFilter("");
            }}
          >
            {text(value === "uploads" ? "uploadedImages" : "cdnArchive")}
          </button>
        ))}
      </fieldset>
      {source === "cdn" && (
        <form
          className={styles.pathForm}
          onSubmit={(event) => {
            event.preventDefault();
            navigate(pathInput.endsWith("/") ? pathInput : `${pathInput}/`);
          }}
        >
          <label htmlFor={pathId}>{text("cdnDirectory")}</label>
          <div>
            <input
              id={pathId}
              value={pathInput}
              onChange={(event) => setPathInput(event.target.value)}
              spellCheck={false}
            />
            <button type="submit">{text("openDirectory")}</button>
          </div>
          <div className={styles.pathActions}>
            <button type="button" onClick={() => navigate("/")}>
              {text("cdnRoot")}
            </button>
            {cdn?.parent && (
              <button type="button" onClick={() => navigate(cdn.parent!)}>
                <ArrowLeft aria-hidden="true" size={16} />
                {text("parentDirectory")}
              </button>
            )}
          </div>
        </form>
      )}
      <label htmlFor={filterId} className={styles.filterLabel}>
        {text(source === "cdn" ? "filterPage" : "filter")}
      </label>
      <input
        id={filterId}
        className={styles.filter}
        type="search"
        value={filter}
        onChange={(event) => {
          setFilter(event.target.value);
          if (source === "uploads") setPage(1);
        }}
      />
      {source === "uploads" && files.length >= 1000 && (
        <p className={styles.hint}>{text("uploadListLimit")}</p>
      )}
      <div className={styles.content} aria-busy={loading}>
        {loading ? (
          <p className={styles.status}>
            <Loader2
              className="animate-spin motion-reduce:animate-none"
              aria-hidden="true"
              size={20}
            />
            {text("libraryLoading")}
          </p>
        ) : failed ? (
          <div className={styles.status} role="alert">
            <p>{text("galleryFailed")}</p>
            <button type="button" onClick={() => setAttempt((value) => value + 1)}>
              {text("retryLibrary")}
            </button>
          </div>
        ) : (
          <>
            {source === "cdn" && !!cdn?.folders.length && (
              <div className={styles.folders}>
                {cdn.folders.map((folder) => (
                  <button key={folder.path} type="button" onClick={() => navigate(folder.path)}>
                    <FolderOpen aria-hidden="true" size={18} />
                    <span>{folder.name}</span>
                  </button>
                ))}
              </div>
            )}
            {shown.length === 0 ? (
              <p className={styles.status}>{text("none")}</p>
            ) : (
              <div className={styles.grid}>
                {shown.map((file) => (
                  <button
                    key={file.path}
                    type="button"
                    className={styles.imageCard}
                    title={file.name}
                    disabled={unavailableImages.has(file.path)}
                    onClick={() => onPick(source === "cdn" ? file.url : file.path)}
                  >
                    <span className={styles.preview}>
                      {unavailableImages.has(file.path) ? (
                        <span>
                          <ImageOff aria-hidden="true" size={24} />
                          {text("previewUnavailable")}
                        </span>
                      ) : (
                        <img
                          src={source === "cdn" ? file.url : assetUrl(file.path)}
                          alt={file.name}
                          loading="lazy"
                          onError={() =>
                            setUnavailableImages((current) => new Set([...current, file.path]))
                          }
                        />
                      )}
                    </span>
                    <span className={styles.filename}>{file.name}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      <footer className={styles.footer}>
        <output aria-live="polite">
          {!loading && !failed
            ? text("libraryPage", { page, pages: pageCount, count: shown.length })
            : ""}
        </output>
        <nav aria-label={text("libraryPagination")}>
          <button
            type="button"
            disabled={loading || failed || page <= 1}
            onClick={() => setPage((value) => value - 1)}
          >
            {text("libraryPrevious")}
          </button>
          <button
            type="button"
            disabled={loading || failed || page >= pageCount}
            onClick={() => setPage((value) => value + 1)}
          >
            {text("libraryNext")}
          </button>
        </nav>
      </footer>
    </dialog>
  );
}
