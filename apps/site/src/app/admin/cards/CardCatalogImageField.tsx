"use client";

import { useState } from "react";
import { ImageField } from "@/components/admin/ImageField";

/** Uploads card artwork and keeps the path in the enclosing server-action form. */
export function CardCatalogImageField({
  name,
  label,
  value,
}: {
  name: string;
  label: string;
  value?: string | null;
}) {
  const [image, setImage] = useState(value ?? "");

  return (
    <div className="space-y-2">
      <span className="text-sm font-medium">{label}</span>
      <ImageField value={image} onChange={setImage} subdir="cards" column={label} />
      <input type="hidden" name={name} value={image} />
    </div>
  );
}
