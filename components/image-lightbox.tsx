"use client";

import { useState } from "react";

interface ImageLightboxProps {
  src: string;
  alt: string;
}

export function ImageLightbox({ src, alt }: ImageLightboxProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <img
        src={src}
        alt={alt}
        onClick={() => setOpen(true)}
        style={{ cursor: "zoom-in" }}
      />
      {open && (
        <div className="lightbox-backdrop" onClick={() => setOpen(false)}>
          <img src={src} alt={alt} className="lightbox-img" />
        </div>
      )}
    </>
  );
}
