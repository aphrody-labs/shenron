"use client";

/**
 * Confirmation des actions destructives de l'administration.
 *
 * Remplace les `window.confirm()` (bloquants, non stylés, muets dans la
 * webview Tauri selon la plateforme) et les cinq modales `ConfirmDialog`
 * recopiées page par page. Trois formes, une seule apparence :
 * - `ConfirmDialog` : contrôlée, pour un composant qui tient déjà l'état ;
 * - `useConfirm()` : `await confirm({…})` à la place de `window.confirm` ;
 * - `ConfirmButton` : bouton autonome, utilisable depuis une page serveur
 *   (action serveur en `onConfirm`, ou soumission d'un `<form>` par `formId`).
 *
 * Sur mobile la boîte remonte du bas de l'écran (pouce), au centre ailleurs.
 * Le focus initial va sur « Annuler » : Entrée ne détruit rien par mégarde.
 */
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { AlertTriangle } from "lucide-react";
import { useCallback, useState, useTransition, type ReactNode } from "react";

export interface ConfirmLabels {
  confirm: string;
  cancel: string;
  pending: string;
}

export const CONFIRM_LABELS_FR: ConfirmLabels = {
  confirm: "Confirmer",
  cancel: "Annuler",
  pending: "En cours…",
};

export type ConfirmTone = "danger" | "default";

export interface ConfirmOptions {
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: ReactNode;
  cancelLabel?: ReactNode;
  tone?: ConfirmTone;
}

const ACTION =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50 md:min-h-9";

export function ConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  pending = false,
  labels: partialLabels,
  title,
  description,
  confirmLabel,
  cancelLabel,
  tone = "danger",
}: ConfirmOptions & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  pending?: boolean;
  labels?: Partial<ConfirmLabels>;
}) {
  const labels = { ...CONFIRM_LABELS_FR, ...partialLabels };
  const danger = tone === "danger";
  return (
    <AlertDialog.Root open={open} onOpenChange={(next) => onOpenChange(next)}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-[90] bg-dbz-bg/80 transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <AlertDialog.Viewport className="fixed inset-0 z-[90] flex items-end justify-center p-3 sm:items-center sm:p-6">
          <AlertDialog.Popup
            data-admin-confirm=""
            className={`w-full max-w-md rounded-xl border bg-dbz-card p-5 text-os outline-none transition-[opacity,translate] duration-150 data-[ending-style]:translate-y-2 data-[ending-style]:opacity-0 data-[starting-style]:translate-y-2 data-[starting-style]:opacity-0 sm:p-6 ${danger ? "border-etoile-rouge/70" : "border-os/15"}`}
          >
            <div className="flex items-start gap-3">
              {danger && (
                <AlertTriangle aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-red-300" />
              )}
              <div className="min-w-0">
                <AlertDialog.Title className="text-base font-semibold leading-snug text-os">
                  {title}
                </AlertDialog.Title>
                {description && (
                  <AlertDialog.Description className="mt-1.5 text-sm leading-relaxed text-os/65">
                    {description}
                  </AlertDialog.Description>
                )}
              </div>
            </div>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <AlertDialog.Close
                className={`${ACTION} border border-os/15 text-os/85 hover:border-os/30 hover:text-os focus-visible:outline-kinto-lumiere`}
              >
                {cancelLabel ?? labels.cancel}
              </AlertDialog.Close>
              <button
                type="button"
                onClick={onConfirm}
                disabled={pending}
                aria-busy={pending || undefined}
                className={`${ACTION} ${
                  danger
                    ? "bg-etoile-rouge text-os hover:brightness-110 focus-visible:outline-kinto-lumiere"
                    : "bg-dbz-orange text-encre hover:bg-dbz-orange-dark focus-visible:outline-kinto-lumiere"
                }`}
              >
                {pending ? labels.pending : (confirmLabel ?? labels.confirm)}
              </button>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Viewport>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

/**
 * `const { confirm, dialog } = useConfirm();` puis
 * `if (!(await confirm({ title: "Supprimer ?" }))) return;` — et `{dialog}` rendu
 * une fois dans le composant.
 */
export function useConfirm(labels?: Partial<ConfirmLabels>): {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  dialog: ReactNode;
} {
  const [request, setRequest] = useState<
    (ConfirmOptions & { resolve: (value: boolean) => void }) | null
  >(null);
  const [open, setOpen] = useState(false);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setRequest({ ...options, resolve });
        setOpen(true);
      }),
    [],
  );

  const settle = (value: boolean) => {
    request?.resolve(value);
    setOpen(false);
  };

  const dialog = request ? (
    <ConfirmDialog
      {...request}
      labels={labels}
      open={open}
      onOpenChange={(next) => {
        if (!next) settle(false);
      }}
      onConfirm={() => settle(true)}
    />
  ) : null;

  return { confirm, dialog };
}

/**
 * Bouton qui demande confirmation avant d'agir. `onConfirm` peut être une
 * action serveur passée par une page serveur ; `formId` soumet à la place le
 * formulaire désigné (avec ses champs, cases de sélection comprises).
 */
export function ConfirmButton({
  children,
  className = "",
  disabled,
  formId,
  onConfirm,
  labels,
  "aria-label": ariaLabel,
  title: buttonTitle,
  confirm,
}: {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  formId?: string;
  onConfirm?: () => void | Promise<void>;
  labels?: Partial<ConfirmLabels>;
  "aria-label"?: string;
  title?: string;
  confirm: ConfirmOptions;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const run = () => {
    if (formId) {
      const form = document.getElementById(formId);
      if (form instanceof HTMLFormElement) form.requestSubmit();
      setOpen(false);
      return;
    }
    startTransition(async () => {
      await onConfirm?.();
      setOpen(false);
    });
  };

  return (
    <>
      <button
        type="button"
        disabled={disabled || pending}
        aria-label={ariaLabel}
        title={buttonTitle}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className={className}
      >
        {children}
      </button>
      <ConfirmDialog
        {...confirm}
        labels={labels}
        open={open}
        pending={pending}
        onOpenChange={(next) => {
          if (!pending) setOpen(next);
        }}
        onConfirm={run}
      />
    </>
  );
}
