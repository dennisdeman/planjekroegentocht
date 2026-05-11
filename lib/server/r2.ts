import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { writeFile, mkdir, unlink } from "node:fs/promises";
import path from "node:path";

// ── R2 (productie) ──────────────────────────────────────────────────

let s3client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3client) {
    const accountId = process.env.R2_ACCOUNT_ID;
    if (!accountId) throw new Error("R2_ACCOUNT_ID is niet geconfigureerd.");
    s3client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
      },
    });
  }
  return s3client;
}

function getBucket(): string {
  const bucket = process.env.R2_BUCKET_NAME;
  if (!bucket) throw new Error("R2_BUCKET_NAME is niet geconfigureerd.");
  return bucket;
}

// ── Lokale opslag (development) ─────────────────────────────────────

const LOCAL_UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

function useLocalStorage(): boolean {
  return !process.env.R2_ACCOUNT_ID;
}

// ── Public API ──────────────────────────────────────────────────────

export async function uploadObject(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
): Promise<void> {
  if (useLocalStorage()) {
    const filePath = path.join(LOCAL_UPLOAD_DIR, key);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, body);
    return;
  }

  const command = new PutObjectCommand({
    Bucket: getBucket(),
    Key: key,
    Body: body,
    ContentType: contentType,
  });
  await getS3Client().send(command);
}

export async function deleteObject(key: string): Promise<void> {
  if (useLocalStorage()) {
    const filePath = path.join(LOCAL_UPLOAD_DIR, key);
    await unlink(filePath).catch(() => {});
    return;
  }

  const command = new DeleteObjectCommand({
    Bucket: getBucket(),
    Key: key,
  });
  await getS3Client().send(command);
}

/** Geeft de publieke URL terug voor een foto-key */
export function getPublicUrl(fileKey: string): string {
  if (useLocalStorage()) {
    return `/uploads/${fileKey}`;
  }
  const base = process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? "";
  return `${base}/${fileKey}`;
}
