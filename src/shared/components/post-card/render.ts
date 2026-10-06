// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

/**
 * PostCard render functions - HTML string output
 * Used by both Astro (set:html) and SolidJS (innerHTML)
 * Uses sections-based layout system
 */

import type {
  PostCardData,
  PostCardSettings,
  CardSection,
  CardSectionChild,
  CardLayout,
  PostsGridSettings,
} from "./types";
import { getPostSummary, formatPayout } from "./utils";
import {
  escape_html,
  escape_html_attr,
  safe_css_number,
} from "../../formatters/html";
import { safe_url } from "../../utils/url_helpers";
import { hive_avatar_url } from "../../../lib/config";

const HOVER_EFFECTS = ["none", "shadow", "lift", "scale", "glow"] as const;
const HOVER_SHADOWS = ["sm", "md", "lg", "xl", "2xl"] as const;

function pick<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function permlink_href(permlink: string): string {
  return `/${encodeURIComponent(permlink)}`;
}

/**
 * Collect all element IDs from a section (recursively)
 */
function collectElementIds(section: CardSection): string[] {
  const ids: string[] = [];
  for (const child of section.children) {
    if (child.type === "element") {
      ids.push(child.id);
    } else {
      ids.push(...collectElementIds(child.section));
    }
  }
  return ids;
}

/**
 * Check if element is present in any section of the layout
 */
function isElementInLayout(layout: CardLayout, elementId: string): boolean {
  for (const section of layout.sections) {
    if (collectElementIds(section).includes(elementId)) {
      return true;
    }
  }
  return false;
}

/**
 * Render a single element as HTML string
 */
function renderElement(
  elementId: string,
  data: PostCardData,
  settings: PostCardSettings,
  isVertical: boolean,
): string {
  switch (elementId) {
    case "thumbnail": {
      const thumbnail = safe_url(data.thumbnail);
      if (!thumbnail) return "";
      const src = escape_html_attr(thumbnail);
      if (isVertical) {
        return `<div class="rounded-lg overflow-hidden flex-shrink-0 bg-cover bg-center w-full h-40"><img src="${src}" alt="" class="w-full h-full object-cover" data-fallback="hide" /></div>`;
      }
      const size = safe_css_number(settings.thumbnailSizePx, 96);
      return `<img src="${src}" alt="" style="width: ${size}px; height: ${size}px; object-fit: cover; border-radius: 8px; flex-shrink: 0;" data-fallback="hide" />`;
    }

    // No link: the whole card is already an <a> and the app has no profile route (F8)
    case "avatar": {
      if (!data.author) return "";
      const author = escape_html(data.author);
      const avatarUrl = escape_html_attr(
        hive_avatar_url(data.author, "small"),
      );
      if (isVertical) {
        return `<span class="flex items-center gap-2"><img src="${avatarUrl}" alt="" class="rounded-full flex-shrink-0" style="width: 24px; height: 24px;" data-fallback="hide" /><span class="text-xs text-text-muted truncate">@${author}</span></span>`;
      }
      return `<span class="flex-shrink-0"><img src="${avatarUrl}" alt="" class="rounded-full" style="width: 40px; height: 40px;" data-fallback="hide" /></span>`;
    }

    case "title":
      return `<h3 class="font-semibold text-text line-clamp-2" style="font-size: ${safe_css_number(settings.titleSizePx, 20)}px;">${escape_html(data.title)}</h3>`;

    case "summary":
      return `<p class="text-text-muted text-sm line-clamp-3">${escape_html(getPostSummary(data.body, settings.summaryMaxLength))}</p>`;

    case "date":
      return `<span class="text-xs text-text-muted">${escape_html(data.publishedAt.toLocaleDateString())}</span>`;

    case "votes":
      return `<span class="flex items-center gap-1 text-xs text-text-muted"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" /></svg>${safe_css_number(data.votesCount, 0)}</span>`;

    case "comments":
      return `<span class="flex items-center gap-1 text-xs text-text-muted"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>${safe_css_number(data.commentsCount, 0)}</span>`;

    case "payout":
      return `<span class="text-xs text-success font-medium">${formatPayout(safe_css_number(data.payout, 0))}</span>`;

    case "tags": {
      if (data.tags.length === 0) return "";
      const tagsHtml = data.tags
        .slice(0, safe_css_number(settings.maxTags, 5))
        .map(
          (tag) =>
            `<span class="px-2 py-0.5 text-xs bg-bg-secondary text-text-muted rounded">#${escape_html(tag)}</span>`,
        )
        .join("");
      return `<div class="flex flex-wrap gap-1">${tagsHtml}</div>`;
    }

    default:
      return "";
  }
}

/**
 * Render a section child (element or nested section)
 */
function renderChild(
  child: CardSectionChild,
  data: PostCardData,
  settings: PostCardSettings,
  isVertical: boolean,
): string {
  if (child.type === "element") {
    return renderElement(child.id, data, settings, isVertical);
  }
  // Nested sections get flex-1 min-w-0 to fill available space
  return renderSection(child.section, data, settings, isVertical, true);
}

/**
 * Render a section with children
 */
function renderSection(
  section: CardSection,
  data: PostCardData,
  settings: PostCardSettings,
  isVertical: boolean,
  isNested: boolean = false,
): string {
  if (!section.children || section.children.length === 0) return "";

  const childrenHtml = section.children
    .map((child) => renderChild(child, data, settings, isVertical))
    .filter((html) => html.length > 0)
    .join("");

  if (childrenHtml.length === 0) return "";

  // Horizontal sections: no wrap, align items start for better layout
  // Nested sections: add flex-1 min-w-0 to fill available space
  const flexClass =
    section.orientation === "horizontal"
      ? "flex items-start gap-4"
      : "flex flex-col gap-1";
  const nestedClass = isNested ? " flex-1 min-w-0" : "";

  return `<div class="${flexClass}${nestedClass}">${childrenHtml}</div>`;
}

/**
 * Render post card content as HTML string (without article wrapper)
 * Uses sections-based layout
 * @returns Sanitized HTML string (uses escape_html for all user content)
 */
export function renderPostCardContent(
  data: PostCardData,
  settings: PostCardSettings,
  isVertical: boolean = false,
  _linkHref?: string,
): string {
  const layout = settings.postCardLayout;
  if (!layout || !layout.sections || layout.sections.length === 0) {
    return ""; // No layout defined
  }

  return layout.sections
    .map((section) => renderSection(section, data, settings, isVertical))
    .filter((html) => html.length > 0)
    .join("");
}

/**
 * Render complete post card as HTML string (with article wrapper)
 * For static rendering in Astro - uses CSS classes for hover effects
 * Entire card is wrapped in anchor for full clickability
 * @returns Sanitized HTML string (uses escape_html for all user content)
 */
export function renderPostCard(
  data: PostCardData,
  settings: PostCardSettings,
  isVertical: boolean = false,
  linkHref?: string,
  extraStyle?: string,
): string {
  const href = escape_html_attr(
    safe_url(linkHref, { allow_relative: true }) ??
      permlink_href(data.permlink),
  );
  const borderStyle = settings.cardBorder
    ? "border: 1px solid var(--color-border);"
    : "";

  const hoverEffect = pick(settings.cardHoverEffect, HOVER_EFFECTS, "none");
  const hoverClass = hoverEffect !== "none" ? `hover-${hoverEffect}` : "";
  const hoverShadow = settings.cardHoverShadow
    ? pick(settings.cardHoverShadow, HOVER_SHADOWS, "md")
    : null;
  const shadowAttr =
    (hoverEffect === "shadow" || hoverEffect === "lift") && hoverShadow
      ? `data-shadow="${escape_html_attr(hoverShadow)}"`
      : "";

  const cssVars: string[] = [];
  const transition = safe_css_number(settings.cardTransitionDuration, 0);
  if (transition) {
    cssVars.push(`--card-transition: ${transition}ms`);
  }
  const hoverScale = safe_css_number(settings.cardHoverScale, 0);
  if (hoverScale && (hoverEffect === "scale" || hoverEffect === "lift")) {
    cssVars.push(`--card-hover-scale: ${hoverScale}`);
  }
  const hoverBrightness = safe_css_number(settings.cardHoverBrightness, 0);
  if (hoverBrightness && hoverEffect === "glow") {
    cssVars.push(`--card-hover-brightness: ${hoverBrightness}`);
  }

  const padding = safe_css_number(settings.cardPaddingPx, 24);
  const radius = safe_css_number(settings.cardBorderRadiusPx, 16);
  const cardStyle = escape_html_attr(
    `padding: ${padding}px; border-radius: ${radius}px; ${borderStyle} ${cssVars.join("; ")}${cssVars.length ? ";" : ""} ${extraStyle || ""}`,
  );

  const contentHtml = renderPostCardContent(data, settings, isVertical);

  return `<a href="${href}" class="post-card-link block no-underline"><article class="post-card bg-bg-card rounded-xl overflow-hidden cursor-pointer ${hoverClass}" ${shadowAttr} style="${cardStyle}">${contentHtml}</article></a>`;
}

/**
 * Wrap pre-rendered card HTML strings in appropriate layout container
 */
export function renderPostsGrid(
  cards_html: string[],
  settings: PostsGridSettings,
): string {
  if (cards_html.length === 0) return "";

  const gap = safe_css_number(settings.gap_px, 24);
  const columns = safe_css_number(settings.columns, 2);

  if (settings.layout === "list") {
    return `<div style="display: flex; flex-direction: column; gap: ${gap}px;">${cards_html.join("")}</div>`;
  }

  if (settings.layout === "masonry") {
    const wrapped = cards_html
      .map(
        (html) =>
          `<div style="break-inside: avoid; margin-bottom: ${gap}px;">${html}</div>`,
      )
      .join("");
    return `<div style="column-count: ${columns}; column-gap: ${gap}px;">${wrapped}</div>`;
  }

  // grid (default)
  return `<div style="display: grid; grid-template-columns: repeat(${columns}, 1fr); gap: ${gap}px;">${cards_html.join("")}</div>`;
}

// Export helper for checking element visibility
export { isElementInLayout, collectElementIds };
