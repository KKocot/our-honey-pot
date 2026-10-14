// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import {
  SITE_LOCALES,
  type SeoSettings,
  type SiteLocale,
  type TopbarSettings,
} from "../components/admin/types/settings";
import { hive_image_proxy, LAYOUT_CONSTANTS } from "./config";

export const FAVICON_PROXY_SIZE_PX = 64;
export const OG_IMAGE_PROXY_WIDTH_PX = 1200;

export interface HeadMetaSettings {
  seo?: SeoSettings;
  locale?: string;
  topbar?: Partial<TopbarSettings>;
}

export interface HeadMetaInput {
  settings?: HeadMetaSettings | null;
  /** Description passed explicitly by the page; wins over seo.description. */
  description?: string;
  default_description: string;
  /** Page-specific OG image URL; wins over seo.og_image. */
  og_image?: string;
  fallback_favicon: { href: string; type: string };
}

export interface HeadMeta {
  lang: SiteLocale;
  description: string;
  favicon: { href: string; type: string | null };
  og_image: { url: string; alt: string | null } | null;
  show_login: boolean;
  show_node_switcher: boolean;
}

function resolve_locale(raw: unknown): SiteLocale {
  return (SITE_LOCALES as readonly unknown[]).includes(raw)
    ? (raw as SiteLocale)
    : "en";
}

function non_empty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function resolve_og_image(
  page_image: string | undefined,
  seo: SeoSettings | undefined,
): HeadMeta["og_image"] {
  const page_url = page_image
    ? hive_image_proxy(page_image, OG_IMAGE_PROXY_WIDTH_PX)
    : "";
  if (page_url) return { url: page_url, alt: null };

  const ref = seo?.og_image;
  if (!ref) return null;
  const url = hive_image_proxy(ref.url, OG_IMAGE_PROXY_WIDTH_PX);
  if (!url) return null;
  return { url, alt: non_empty(ref.alt) ?? null };
}

/** Head meta and public topbar visibility; URLs in `settings` are already validated on config read. */
export function resolve_head_meta(input: HeadMetaInput): HeadMeta {
  const settings = input.settings ?? {};
  const seo = settings.seo;

  const favicon_proxy = seo?.favicon
    ? hive_image_proxy(
        seo.favicon,
        FAVICON_PROXY_SIZE_PX,
        FAVICON_PROXY_SIZE_PX,
      )
    : "";

  return {
    lang: resolve_locale(settings.locale),
    description:
      non_empty(input.description) ??
      non_empty(seo?.description) ??
      input.default_description,
    // Proxied favicon format is unknown, so the browser sniffs it instead of trusting a guessed type
    favicon: favicon_proxy
      ? { href: favicon_proxy, type: null }
      : input.fallback_favicon,
    og_image: resolve_og_image(input.og_image, seo),
    show_login: settings.topbar?.show_login !== false,
    show_node_switcher: settings.topbar?.show_node_switcher !== false,
  };
}

/** Sidebar width from config, clamped to the editor range; invalid -> default. */
export function resolve_sidebar_width_px(raw: unknown): number {
  const { min, max, default: fallback } = LAYOUT_CONSTANTS.SIDEBAR_WIDTH_PX;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return fallback;
  return Math.min(max, Math.max(min, Math.round(raw)));
}
