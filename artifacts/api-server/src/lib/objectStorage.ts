import { Readable } from "node:stream";
import { File, Storage } from "@google-cloud/storage";

const SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

export const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${SIDECAR_ENDPOINT}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
  }
}

function parsePath(path: string): { bucketName: string; objectName: string } {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const parts = normalized.split("/");
  if (parts.length < 3 || !parts[1] || !parts.slice(2).join("/")) {
    throw new Error("Invalid object storage path");
  }
  return { bucketName: parts[1], objectName: parts.slice(2).join("/") };
}

export class ObjectStorageService {
  private getPrivateDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR;
    if (!dir) throw new Error("Private object storage is not configured");
    return dir.replace(/\/+$/, "");
  }

  normalizeObjectEntityPath(rawPath: string): string {
    if (rawPath.startsWith("/objects/")) return rawPath;
    if (!rawPath.startsWith("https://storage.googleapis.com/")) return rawPath;
    const url = new URL(rawPath);
    const fullDir = `/${this.getPrivateDir()}/`;
    if (!url.pathname.startsWith(fullDir)) return url.pathname;
    return `/objects/${url.pathname.slice(fullDir.length)}`;
  }

  async getObjectEntityUploadURL(): Promise<string> {
    const objectName = `${this.getPrivateDir()}/uploads/${crypto.randomUUID()}`;
    const { bucketName, objectName: parsedObjectName } = parsePath(objectName);
    const response = await fetch(`${SIDECAR_ENDPOINT}/object-storage/signed-object-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bucket_name: bucketName,
        object_name: parsedObjectName,
        method: "PUT",
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Unable to create upload URL (${response.status})`);
    const body = (await response.json()) as { signed_url?: string };
    if (!body.signed_url) throw new Error("Storage did not return an upload URL");
    return body.signed_url;
  }

  async getObjectEntityFile(objectPath: string): Promise<File> {
    if (!objectPath.startsWith("/objects/")) throw new ObjectNotFoundError();
    const { bucketName, objectName } = parsePath(`${this.getPrivateDir()}/${objectPath.slice("/objects/".length)}`);
    const file = objectStorageClient.bucket(bucketName).file(objectName);
    const [exists] = await file.exists();
    if (!exists) throw new ObjectNotFoundError();
    return file;
  }

  async downloadObject(file: File): Promise<Response> {
    const [metadata] = await file.getMetadata();
    const stream = Readable.toWeb(file.createReadStream()) as ReadableStream;
    const headers: Record<string, string> = {
      "Content-Type": metadata.contentType ?? "application/octet-stream",
      "Cache-Control": "private, max-age=3600",
    };
    if (metadata.size) headers["Content-Length"] = String(metadata.size);
    return new Response(stream, { headers });
  }
}