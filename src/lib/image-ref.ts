// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

// Config read from chain is untrusted (anyone can broadcast it bypassing /admin), so the same
// gate runs on save and on read. No raw CSS interpolation (ADR 6ac78ae263221e857a3bc274).
import { z } from "zod";
import { css_url_value, safe_url } from "../shared/utils/url_helpers";
import { get_hive_images_endpoint, hive_image_proxy } from "./config";

export const URL_MAX_BYTES = 256;
export const ALT_MAX_CHARS = 125;
export const IMAGE_DIMENSION_RANGE = { min: 1, max: 8000 } as const;

export const STATIC_IMAGE_HOSTS: readonly string[] = [
  "images.hive.blog",
  "images.ecency.com",
  "files.peakd.com",
  "steemitimages.com",
];

export interface ImageRef {
  url: string;
  alt: string;
  w?: number;
  h?: number;
  decorative?: boolean;
}

const encoder = new TextEncoder();

function byte_length(value: string): number {
  return encoder.encode(value).length;
}

function code_point_length(value: string): number {
  return Array.from(value).length;
}

function parse_https(raw: unknown): URL | null {
  if (typeof raw !== "string" || byte_length(raw) > URL_MAX_BYTES) return null;
  const normalized = safe_url(raw);
  if (!normalized || byte_length(normalized) > URL_MAX_BYTES) return null;
  const parsed = new URL(normalized);
  if (parsed.protocol !== "https:") return null;
  if (parsed.username || parsed.password) return null;
  return parsed;
}

function configured_images_host(): string | null {
  try {
    const parsed = new URL(get_hive_images_endpoint());
    if (parsed.protocol !== "https:" || parsed.port) return null;
    return parsed.hostname;
  } catch {
    return null;
  }
}

/** Hosts allowed as image sources: configured Hive images endpoint plus known Hive CDNs. */
export function get_allowed_image_hosts(): string[] {
  const configured = configured_images_host();
  const hosts = [...STATIC_IMAGE_HOSTS];
  if (configured && !hosts.includes(configured)) hosts.push(configured);
  return hosts;
}

/** Normalized https image URL from an allowlisted host, or null. */
export function safe_image_url(raw: unknown): string | null {
  const parsed = parse_https(raw);
  if (!parsed || parsed.port) return null;
  if (!get_allowed_image_hosts().includes(parsed.hostname)) return null;
  return parsed.href;
}

const MAILTO_PATTERN = /^mailto:[^\s<>"'`\\()]+@[^\s<>"'`\\()]+$/i;
const TEL_PATTERN = /^tel:\+?[0-9][0-9 ().-]{2,31}$/i;

/** Normalized link target: https always; mailto:/tel: only with allow_contact (nav/footer/cta). */
export function safe_link_url(
  raw: unknown,
  options: { allow_contact?: boolean } = {},
): string | null {
  if (typeof raw !== "string" || byte_length(raw) > URL_MAX_BYTES) return null;
  const value = raw.trim();
  if (/[\u0000-\u001F\u007F]/.test(value)) return null;
  if (
    options.allow_contact &&
    (MAILTO_PATTERN.test(value) || TEL_PATTERN.test(value))
  ) {
    return value;
  }
  return parse_https(value)?.href ?? null;
}

function url_schema(check: (raw: unknown) => string | null, message: string) {
  return z.string().transform((value, ctx) => {
    const safe = check(value);
    if (safe === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });
      return z.NEVER;
    }
    return safe;
  });
}

export const UrlSchema = url_schema(
  safe_link_url,
  "URL must be https, max 256 bytes",
);

export const ContactUrlSchema = url_schema(
  (raw) => safe_link_url(raw, { allow_contact: true }),
  "URL must be https, mailto: or tel:, max 256 bytes",
);

export const ImageUrlSchema = url_schema(
  safe_image_url,
  "Image URL must be https from an allowed image host, max 256 bytes",
);

const DimensionSchema = z
  .number()
  .int()
  .min(IMAGE_DIMENSION_RANGE.min)
  .max(IMAGE_DIMENSION_RANGE.max);

const AltSchema = z
  .string()
  .transform((value) => value.trim())
  .refine((value) => code_point_length(value) <= ALT_MAX_CHARS, {
    message: `Alt max ${ALT_MAX_CHARS} characters`,
  });

export const ImageRefSchema = z
  .object({
    url: ImageUrlSchema,
    alt: AltSchema,
    w: DimensionSchema.optional(),
    h: DimensionSchema.optional(),
    decorative: z.boolean().optional(),
  })
  .refine((ref) => ref.decorative === true || ref.alt.length > 0, {
    message: "Alt is required unless the image is decorative",
    path: ["alt"],
  });

function pick_dimension(value: unknown): number | undefined {
  return DimensionSchema.safeParse(value).success
    ? (value as number)
    : undefined;
}

/** Tolerant read of an untrusted ImageRef: invalid url/alt -> undefined, invalid w/h/decorative dropped. */
export function parse_image_ref(raw: unknown): ImageRef | undefined {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw))
    return undefined;
  const source = raw as Record<string, unknown>;

  const url = safe_image_url(source.url);
  if (!url) return undefined;

  const decorative = source.decorative === true ? true : undefined;
  const alt_result = AltSchema.safeParse(source.alt ?? "");
  const alt = alt_result.success ? alt_result.data : "";
  if (!decorative && (!alt_result.success || alt.length === 0))
    return undefined;

  const ref: ImageRef = { url, alt };
  const w = pick_dimension(source.w);
  const h = pick_dimension(source.h);
  if (w !== undefined) ref.w = w;
  if (h !== undefined) ref.h = h;
  if (decorative) ref.decorative = true;
  return ref;
}

/** Tolerant read of an untrusted link target; invalid -> undefined. */
export function parse_link_url(
  raw: unknown,
  options: { allow_contact?: boolean } = {},
): string | undefined {
  return safe_link_url(raw, options) ?? undefined;
}

/**
 * Safe `background-image` value for an untrusted ImageRef or URL, or undefined.
 * With `width` the image goes through the Hive image proxy.
 */
export function image_background_value(
  raw: unknown,
  options: { width?: number; height?: number } = {},
): string | undefined {
  const source =
    typeof raw === "string" ? raw : (raw as { url?: unknown } | null)?.url;
  const url = safe_image_url(source);
  if (!url) return undefined;
  const target =
    options.width !== undefined
      ? hive_image_proxy(url, options.width, options.height ?? 0)
      : url;
  const encoded = css_url_value(target);
  return encoded ? `url("${encoded}")` : undefined;
}
