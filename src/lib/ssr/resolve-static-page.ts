// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import {
  RESERVED_PAGE_SLUGS,
  type PageDef,
} from "../../components/admin/types/settings";
import {
  PAGE_SLUG_LENGTH,
  PAGE_SLUG_REGEX,
} from "../../components/admin/types/navigation";
import type { PageLayoutSection } from "../../components/admin/types/layout";

export type StaticPageResolution =
  { status: 200; page: PageDef } | { status: 404 };

function is_public_page_slug(slug: unknown): slug is string {
  return (
    typeof slug === "string" &&
    slug.length >= PAGE_SLUG_LENGTH.min &&
    slug.length <= PAGE_SLUG_LENGTH.max &&
    PAGE_SLUG_REGEX.test(slug) &&
    !RESERVED_PAGE_SLUGS.has(slug)
  );
}

/** Page for `/p/<slug>`; a malformed, reserved or unknown slug is 404 without touching the page list. */
export function resolve_static_page(
  settings: { pages?: readonly PageDef[] | null },
  slug: string | undefined,
): StaticPageResolution {
  if (!is_public_page_slug(slug)) return { status: 404 };
  const pages = Array.isArray(settings.pages) ? settings.pages : [];
  const page = pages.find(
    (candidate) =>
      candidate !== null &&
      typeof candidate === "object" &&
      candidate.slug === slug,
  );
  return page ? { status: 200, page } : { status: 404 };
}

export interface StaticPageChrome {
  header: boolean;
  footer: boolean;
}

/** Header and footer of a static page follow the homepage layout: header from the top slot, footer from the bottom slot. */
export function resolve_static_page_chrome(
  sections: readonly PageLayoutSection[],
): StaticPageChrome {
  const has = (slot: PageLayoutSection["slot"], element: string) =>
    sections.some(
      (section) =>
        section.slot === slot &&
        section.active !== false &&
        section.elements.includes(element),
    );
  return { header: has("top", "header"), footer: has("bottom", "footer") };
}
