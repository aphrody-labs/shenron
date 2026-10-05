/**
 * Formulaires d'administration : une colonne sur mobile, deux à partir de `md`.
 *
 * Remplace les `Field`, `LabeledInput`, `TextInput` et `grid-cols-2` sans point
 * de rupture recopiés d'un écran à l'autre (ceux-là coinçaient deux champs de
 * 150 px côte à côte sur un téléphone). Un champ large (`span="full"`) occupe
 * les deux colonnes ; les actions finissent toujours en bas à droite, la
 * principale sous le pouce sur mobile.
 * Server component : les champs eux-mêmes restent ceux de l'appelant.
 */
import type { ReactNode } from "react";

export function FormGrid({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-x-6 ${className}`}>
      {children}
    </div>
  );
}

export function FormField({
  label,
  htmlFor,
  hint,
  error,
  required = false,
  span = "auto",
  children,
  className = "",
}: {
  label: ReactNode;
  /** `id` du contrôle : relie l'étiquette, l'aide et l'erreur. */
  htmlFor?: string;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  span?: "auto" | "full";
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`min-w-0 ${span === "full" ? "md:col-span-2" : ""} ${className}`}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-os/85">
        {label}
        {required && (
          <span aria-hidden className="ml-0.5 text-dbz-orange">
            *
          </span>
        )}
      </label>
      {children}
      {hint && (
        <p id={htmlFor ? `${htmlFor}-hint` : undefined} className="mt-1.5 text-xs text-os/45">
          {hint}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-1.5 text-xs text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}

export function FormActions({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:items-center sm:justify-end md:col-span-2 [&>*]:min-h-11 md:[&>*]:min-h-9 ${className}`}
    >
      {children}
    </div>
  );
}
