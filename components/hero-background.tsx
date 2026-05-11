import Image from "next/image";

export function HeroBackground({ src, alt = "" }: { src: string; alt?: string }) {
  return (
    <>
      <Image
        src={src}
        alt={alt}
        fill
        priority
        sizes="(max-width: 1280px) 100vw, 1280px"
        style={{ objectFit: "cover", zIndex: 0 }}
      />
      <div className="pub-hero-overlay" />
    </>
  );
}
