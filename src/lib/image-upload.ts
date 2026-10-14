// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

// Upload from /admin to images.hive.blog. Signing: HB-Auth and WIF only; Keychain users paste a URL.
import { is_valid_hive_username } from "../components/auth/constants";
import { get_hive_images_endpoint } from "./config";
import { is_dev_mode } from "./dev-mode";
import { safe_image_url } from "./image-ref";
import {
  ImageProcessingError,
  type ImageProcessingErrorCode,
  type ProcessedImage,
  process_image_for_upload,
} from "./image-processing";
import {
  ImageSigningUnsupportedError,
  sign_image_upload,
} from "./transaction-signer";

export const UPLOAD_TIMEOUT_MS = 60_000;

const SIGNATURE_PATTERN = /^[0-9a-f]{130}$/i;

// Error names returned by images.hive.blog; "qouta_exceeded" is the server's own spelling.
const HOSTER_ERROR_CODES = {
  invalid_signature: "invalid_signature",
  payload_too_large: "payload_too_large",
  file_missing: "file_missing",
  no_such_account: "no_such_account",
  blacklisted: "blacklisted",
  qouta_exceeded: "quota_exceeded",
  deplorable: "deplorable",
  invalid_image: "invalid_image",
} as const;

type HosterErrorCode =
  (typeof HOSTER_ERROR_CODES)[keyof typeof HOSTER_ERROR_CODES];

export type ImageUploadErrorCode =
  | ImageProcessingErrorCode
  | HosterErrorCode
  | "invalid_username"
  | "invalid_endpoint"
  | "signing_unsupported"
  | "signing_failed"
  | "timeout"
  | "aborted"
  | "network"
  | "http_error"
  | "invalid_response";

export class ImageUploadError extends Error {
  readonly code: ImageUploadErrorCode;

  constructor(code: ImageUploadErrorCode, message?: string, cause?: unknown) {
    super(message ?? code, cause === undefined ? undefined : { cause });
    this.name = "ImageUploadError";
    this.code = code;
  }
}

export interface ImageUploadContext {
  username: string;
  /** Session key value: raw WIF or a managed marker (HB-Auth / Keychain / dev). */
  private_key: string;
  signal?: AbortSignal;
  timeout_ms?: number;
}

export interface UploadedImage {
  url: string;
  w: number;
  h: number;
}

function upload_endpoint(): string {
  let parsed: URL;
  try {
    parsed = new URL(get_hive_images_endpoint());
  } catch {
    throw new ImageUploadError("invalid_endpoint");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new ImageUploadError("invalid_endpoint");
  }
  return `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}`;
}

async function prepare(file: File): Promise<ProcessedImage> {
  try {
    return await process_image_for_upload(file);
  } catch (error) {
    if (error instanceof ImageProcessingError) {
      throw new ImageUploadError(error.code, error.message, error);
    }
    throw new ImageUploadError("decode_failed", undefined, error);
  }
}

async function sign(
  image: ProcessedImage,
  ctx: ImageUploadContext,
): Promise<string> {
  let signature: string;
  try {
    signature = await sign_image_upload(
      image.bytes,
      ctx.username,
      ctx.private_key,
    );
  } catch (error) {
    if (error instanceof ImageSigningUnsupportedError) {
      throw new ImageUploadError("signing_unsupported", error.message, error);
    }
    throw new ImageUploadError(
      "signing_failed",
      error instanceof Error ? error.message : undefined,
      error,
    );
  }
  if (!SIGNATURE_PATTERN.test(signature)) {
    throw new ImageUploadError("signing_failed", "Malformed signature");
  }
  return signature;
}

function to_blob(image: ProcessedImage): Blob {
  const copy = new Uint8Array(image.bytes.length);
  copy.set(image.bytes);
  return new Blob([copy], { type: image.mime });
}

async function read_json(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function hoster_error(body: unknown, status: number): ImageUploadError {
  const name =
    typeof body === "object" && body !== null
      ? (body as { error?: { name?: unknown } }).error?.name
      : undefined;
  if (typeof name === "string" && Object.hasOwn(HOSTER_ERROR_CODES, name)) {
    return new ImageUploadError(
      HOSTER_ERROR_CODES[name as keyof typeof HOSTER_ERROR_CODES],
    );
  }
  return new ImageUploadError("http_error", `HTTP ${status}`);
}

async function post_image(
  url: string,
  image: ProcessedImage,
  ctx: ImageUploadContext,
): Promise<unknown> {
  const controller = new AbortController();
  let timed_out = false;
  const timer = setTimeout(() => {
    timed_out = true;
    controller.abort();
  }, ctx.timeout_ms ?? UPLOAD_TIMEOUT_MS);
  const forward_abort = () => controller.abort();
  if (ctx.signal?.aborted) controller.abort();
  ctx.signal?.addEventListener("abort", forward_abort, { once: true });

  // No custom headers: keeps the request "simple" so images.hive.blog CORS needs no preflight.
  const form = new FormData();
  form.append("file", to_blob(image), image.name);

  try {
    const response = await fetch(url, {
      method: "POST",
      body: form,
      signal: controller.signal,
    });
    const body = await read_json(response);
    if (!response.ok) throw hoster_error(body, response.status);
    return body;
  } catch (error) {
    if (error instanceof ImageUploadError) throw error;
    if (timed_out) throw new ImageUploadError("timeout", undefined, error);
    if (controller.signal.aborted) {
      throw new ImageUploadError("aborted", undefined, error);
    }
    throw new ImageUploadError("network", undefined, error);
  } finally {
    clearTimeout(timer);
    ctx.signal?.removeEventListener("abort", forward_abort);
  }
}

/**
 * Validates, signs and uploads an image; returns an allowlisted https URL with dimensions.
 * Dev mode returns a local blob: URL without network or signing (never valid as ImageRef).
 * @throws ImageUploadError with a typed `code`
 */
export async function upload_image(
  file: File,
  ctx: ImageUploadContext,
): Promise<UploadedImage> {
  const image = await prepare(file);

  if (import.meta.env.DEV && is_dev_mode()) {
    return {
      url: URL.createObjectURL(to_blob(image)),
      w: image.width,
      h: image.height,
    };
  }

  if (!is_valid_hive_username(ctx.username)) {
    throw new ImageUploadError("invalid_username");
  }
  const endpoint = upload_endpoint();
  const signature = await sign(image, ctx);
  const body = await post_image(
    `${endpoint}/${ctx.username}/${signature}`,
    image,
    ctx,
  );

  const raw_url =
    typeof body === "object" && body !== null
      ? (body as { url?: unknown }).url
      : undefined;
  const url = safe_image_url(raw_url);
  if (!url) throw new ImageUploadError("invalid_response");
  return { url, w: image.width, h: image.height };
}
