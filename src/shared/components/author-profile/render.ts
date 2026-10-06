// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

/**
 * AuthorProfile render functions - HTML string output
 * Used by both Astro (set:html) and SolidJS (innerHTML)
 */

import type { AuthorProfileData, AuthorProfileSettings } from "./types";
import type {
  CardSection,
  CardSectionChild,
} from "../../../components/home/types";
import {
  formatCompactNumber,
  normalizeUrl,
  getDisplayUrl,
} from "../../formatters";
import {
  escape_html,
  escape_html_attr,
  safe_css_number,
} from "../../formatters/html";
import { hive_image_proxy, hive_avatar_url } from "../../../lib/config";
import {
  locationIcon,
  websiteIcon,
  calendarIcon,
  getSocialIcon,
  platformColors,
} from "../../icons";
import {
  build_social_url,
  is_social_platform,
  platformInfos,
} from "../../../components/admin/types/social";
import {
  get_domain_from_url,
  is_valid_url_for_favicon,
  safe_url,
  css_url_value,
} from "../../utils/url_helpers";

const LINK_ICON_SVG = `<svg class="w-5 h-5" viewBox="0 0 24 24" fill="white" stroke="white"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>`;

/**
 * Render a single profile element as HTML string
 */
export function renderProfileElement(
  elementId: string,
  data: AuthorProfileData,
  settings: AuthorProfileSettings,
): string | null {
  const metaSize = safe_css_number(settings.metaSize, 12);
  const statsSize = safe_css_number(settings.statsSize, 14);

  switch (elementId) {
    case "coverImage": {
      const coverHeight = safe_css_number(settings.coverHeight, 64);
      const cover = data.coverImage
        ? css_url_value(hive_image_proxy(data.coverImage, 640))
        : null;
      if (!cover) {
        return `<div class="bg-gradient-to-r from-primary/30 to-accent/30 rounded-lg w-full" style="height: ${coverHeight}px;"></div>`;
      }
      const style = escape_html_attr(
        `height: ${coverHeight}px; background-image: url('${cover}');`,
      );
      return `<div class="bg-cover bg-center rounded-lg w-full" style="${style}"></div>`;
    }

    // Fallback logo sits behind the image instead of inline onerror (CSP); a broken img with alt="" renders empty
    case "avatar": {
      const avatarSize = safe_css_number(settings.avatarSize, 64);
      const avatarUrl =
        safe_url(data.avatarUrl) ?? hive_avatar_url(data.username);
      return `<span class="relative block rounded-full border-2 border-bg-card ring-2 ring-border flex-shrink-0 overflow-hidden bg-cover bg-center" style="width: ${avatarSize}px; height: ${avatarSize}px; background-image: url('/hive-logo.png');" role="img" aria-label="${escape_html_attr(data.username)}"><img src="${escape_html_attr(avatarUrl)}" alt="" class="block w-full h-full object-cover" /></span>`;
    }

    case "username":
      return `<p class="font-bold text-text" style="font-size: ${safe_css_number(settings.usernameSize, 14)}px;">@${escape_html(data.username)}</p>`;

    case "displayName":
      return `<h2 class="font-bold text-text" style="font-size: ${safe_css_number(settings.displayNameSize, 18)}px;">${escape_html(data.displayName)}</h2>`;

    case "reputation":
      return `<span class="inline-block px-2 py-0.5 text-xs font-medium bg-primary/10 text-primary rounded-full">Rep: ${Math.floor(safe_css_number(data.reputation, 0))}</span>`;

    case "about":
      if (!data.about) return null;
      return `<p class="text-text-muted line-clamp-2" style="font-size: ${safe_css_number(settings.aboutSize, 14)}px;">${escape_html(data.about)}</p>`;

    case "location":
      if (!data.location) return null;
      return `<span class="flex items-center gap-1 text-text-muted" style="font-size: ${metaSize}px;">${locationIcon}${escape_html(data.location)}</span>`;

    case "website": {
      if (!data.website || typeof data.website !== "string") return null;
      const href = safe_url(normalizeUrl(data.website));
      const displayUrl = escape_html(getDisplayUrl(data.website));
      if (!href) {
        return `<span class="flex items-center gap-1 text-text-muted" style="font-size: ${metaSize}px;">${websiteIcon}${displayUrl}</span>`;
      }
      return `<a href="${escape_html_attr(href)}" target="_blank" rel="noopener noreferrer" class="flex items-center gap-1 text-primary hover:underline" style="font-size: ${metaSize}px;">${websiteIcon}${displayUrl}</a>`;
    }

    case "joinDate":
      return `<span class="flex items-center gap-1 text-text-muted" style="font-size: ${metaSize}px;">${calendarIcon}${escape_html(data.joinDate)}</span>`;

    case "followers":
      return `<div class="text-center"><p class="font-bold text-text" style="font-size: ${statsSize}px;">${escape_html(formatCompactNumber(safe_css_number(data.followers, 0)))}</p><p class="text-xs text-text-muted">Followers</p></div>`;

    case "following":
      return `<div class="text-center"><p class="font-bold text-text" style="font-size: ${statsSize}px;">${escape_html(formatCompactNumber(safe_css_number(data.following, 0)))}</p><p class="text-xs text-text-muted">Following</p></div>`;

    case "postCount":
      return `<div class="text-center"><p class="font-bold text-text" style="font-size: ${statsSize}px;">${escape_html(formatCompactNumber(safe_css_number(data.postCount, 0)))}</p><p class="text-xs text-text-muted">Posts</p></div>`;

    case "hivePower":
    case "hpEarned":
      return `<div class="text-center"><p class="font-bold text-text" style="font-size: ${statsSize}px;">${safe_css_number(data.hivePower, 0).toFixed(3)}</p><p class="text-xs text-text-muted">HP</p></div>`;

    case "votingPower": {
      const votingPower = safe_css_number(data.votingPower, 0);
      const vpDisplay = votingPower > 0 ? `${votingPower.toFixed(1)}%` : "--";
      return `<div class="text-center"><p class="font-semibold text-text" style="font-size: ${statsSize}px;">${vpDisplay}</p><p class="text-xs text-text-muted">Voting Power</p></div>`;
    }

    case "hiveBalance":
      return `<div class="text-center"><p class="font-semibold text-text" style="font-size: ${statsSize}px;">${safe_css_number(data.hiveBalance, 0).toFixed(3)}</p><p class="text-xs text-text-muted">HIVE</p></div>`;

    case "hbdBalance":
      return `<div class="text-center"><p class="font-semibold text-text" style="font-size: ${statsSize}px;">${safe_css_number(data.hbdBalance, 0).toFixed(3)}</p><p class="text-xs text-text-muted">HBD</p></div>`;

    default:
      return null;
  }
}

/**
 * Check if section contains a full-width element
 */
function hasFullWidthElement(section: CardSection): boolean {
  return (
    section.children?.some(
      (child) => child.type === "element" && child.id === "coverImage",
    ) ?? false
  );
}

/**
 * Render a child (element or nested section)
 */
function renderProfileChild(
  child: CardSectionChild,
  data: AuthorProfileData,
  settings: AuthorProfileSettings,
): string {
  if (child.type === "element") {
    return renderProfileElement(child.id, data, settings) || "";
  }
  return renderProfileSection(child.section, data, settings);
}

/**
 * Render a section with its orientation (recursive)
 */
export function renderProfileSection(
  section: CardSection,
  data: AuthorProfileData,
  settings: AuthorProfileSettings,
): string {
  if (!section.children || section.children.length === 0) return "";

  const childrenHtml = section.children
    .map((child) => renderProfileChild(child, data, settings))
    .filter((html) => html.length > 0)
    .join("");

  if (!childrenHtml) return "";

  const isFullWidth = hasFullWidthElement(section);
  const flexClass = isFullWidth
    ? "w-full"
    : section.orientation === "horizontal"
      ? "flex flex-wrap items-center gap-2"
      : "flex flex-col gap-1";

  return `<div class="${flexClass}">${childrenHtml}</div>`;
}

/**
 * Render all profile sections as HTML string
 * @returns Sanitized HTML string (uses escape_html for all user content)
 */
export function renderAuthorProfileSections(
  data: AuthorProfileData,
  settings: AuthorProfileSettings,
): string {
  return settings.layout.sections
    .map((section) => renderProfileSection(section, data, settings))
    .join("");
}

/**
 * Render social links as HTML string
 * @returns Sanitized HTML string (URLs validated, no user-provided HTML)
 */
export function renderSocialLinks(
  socialLinks: AuthorProfileSettings["socialLinks"],
): string {
  if (!Array.isArray(socialLinks)) return "";
  const validLinks = socialLinks.filter(
    (l) => l && is_social_platform(l.platform) && (l.username || l.url),
  );
  if (validLinks.length === 0) return "";

  const linksHtml = validLinks
    .map((link) => {
      const url = build_social_url(link);
      if (!url) return "";

      const is_custom = link.platform === "custom";
      const raw_value = link.username || link.url;
      const display_value = typeof raw_value === "string" ? raw_value : "";
      const has_favicon = is_custom && is_valid_url_for_favicon(display_value);
      const color = platformColors[link.platform] ?? platformInfos.custom.color;

      let iconHtml: string;
      if (has_favicon) {
        // Favicon covers the fallback icon; if it fails to load (alt=""), the icon underneath stays visible
        const safe_domain = encodeURIComponent(
          get_domain_from_url(display_value),
        );
        iconHtml = `<span class="relative flex items-center justify-center w-7 h-7">${LINK_ICON_SVG}<img src="https://www.google.com/s2/favicons?domain=${escape_html_attr(safe_domain)}&amp;sz=64" alt="" class="absolute inset-0 w-7 h-7 rounded" /></span>`;
      } else if (is_custom) {
        iconHtml = LINK_ICON_SVG;
      } else {
        iconHtml = getSocialIcon(link.platform);
      }

      const url_attr = escape_html_attr(url);
      const dataAttr = is_custom ? ` data-custom-link="${url_attr}"` : "";
      const paddingClass = has_favicon ? "p-1" : "p-2";
      const title = escape_html_attr(platformInfos[link.platform].name);

      return `<a href="${url_attr}" target="_blank" rel="noopener noreferrer" class="${paddingClass} rounded-lg transition-opacity hover:opacity-80 overflow-hidden" style="background: ${color};" title="${title}"${dataAttr}>${iconHtml}</a>`;
    })
    .filter((html) => html.length > 0)
    .join("");

  if (!linksHtml) return "";

  return `<div class="flex flex-wrap gap-2 mt-4 pt-4 border-t border-border justify-center">${linksHtml}</div>`;
}

/**
 * Render complete author profile card as HTML string
 */
export function renderAuthorProfileCard(
  data: AuthorProfileData,
  settings: AuthorProfileSettings,
): string {
  const sectionsHtml = renderAuthorProfileSections(data, settings);
  const socialLinksHtml = renderSocialLinks(settings.socialLinks);

  return `<div class="bg-bg-card rounded-xl shadow-sm border border-border overflow-hidden p-4"><div class="space-y-2">${sectionsHtml}</div>${socialLinksHtml}</div>`;
}
