const MAX_DIMENSION = 1920;
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const QUALITY_STEPS = [0.8, 0.6, 0.4];

export interface CompressedImage {
  blob: Blob;
  width: number;
  height: number;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Afbeelding kon niet worden geladen."));
    img.src = src;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Canvas conversie mislukt."))),
      "image/jpeg",
      quality
    );
  });
}

export async function compressImage(file: File): Promise<CompressedImage> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);

    let { width, height } = img;
    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
      const scale = MAX_DIMENSION / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas context niet beschikbaar.");
    ctx.drawImage(img, 0, 0, width, height);

    for (const quality of QUALITY_STEPS) {
      const blob = await canvasToBlob(canvas, quality);
      if (blob.size <= MAX_BYTES) {
        return { blob, width, height };
      }
    }

    throw new Error("Afbeelding is te groot, zelfs na compressie.");
  } finally {
    URL.revokeObjectURL(url);
  }
}
