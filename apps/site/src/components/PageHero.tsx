import Image from "next/image";
import { PageHero as PortablePageHero } from "@aphrody/shenron-ui/layout/PageHero";
import type { ComponentProps } from "react";
import { canonicalFrameUrl } from "@/lib/episode-frame-banner";

export function PageHero(props: Omit<ComponentProps<typeof PortablePageHero>, "renderImage">) {
  return (
    <PortablePageHero
      {...props}
      image={canonicalFrameUrl(props.image ?? null) ?? undefined}
      renderImage={({ src, alt, className }) => (
        <Image src={src} alt={alt} fill priority sizes="100vw" className={className} />
      )}
    />
  );
}
