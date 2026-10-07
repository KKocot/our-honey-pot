// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

// ============================================
// Zod Schema for SettingsData validation
// ============================================
// Validates config loaded from Hive blockchain.
// Intentionally loose on complex nested objects (CardLayout, PageLayout)
// to avoid breaking on future schema changes. Uses passthrough()
// for forward compatibility with new fields.

import { z } from "zod";
import {
  POSTS_PER_PAGE_MIN,
  POSTS_PER_PAGE_MAX,
  MAX_PINNED_POSTS,
  PINNED_POST_ENTRY_REGEX,
  INSTANCE_OVERRIDE_KEY_REGEX,
  MAX_INSTANCE_OVERRIDES,
  instance_override_keys_for,
  is_instance_override_value,
  type InstanceOverrides,
  type InstanceSizeOverrides,
} from "./settings";
import { SOCIAL_PLATFORMS, build_social_url } from "./social";

const social_link_schema = z
  .object({
    id: z.string().max(100),
    platform: z.enum(SOCIAL_PLATFORMS),
    username: z.string().max(2048).optional().default(""),
    url: z.string().max(2048).optional(),
  })
  .refine((link) => build_social_url(link) !== "", {
    message: "Social link must resolve to a safe http(s) URL",
  });

const community_sort_schema = z.enum([
  "trending",
  "hot",
  "created",
  "payout",
  "muted",
]);

function sanitize_instance_entry(
  element_id: string,
  raw_entry: unknown,
): InstanceSizeOverrides {
  const entry: InstanceSizeOverrides = {};
  if (
    typeof raw_entry !== "object" ||
    raw_entry === null ||
    Array.isArray(raw_entry)
  ) {
    return entry;
  }
  const raw_values = raw_entry as Record<string, unknown>;
  for (const key of instance_override_keys_for(element_id)) {
    const value = Object.hasOwn(raw_values, key) ? raw_values[key] : undefined;
    if (is_instance_override_value(key, value)) entry[key] = value;
  }
  return entry;
}

/** Invalid keys, unknown elements and out-of-range values are dropped one by one; empty entries disappear. */
export function sanitize_instance_overrides(
  raw: Record<string, unknown>,
): InstanceOverrides {
  const overrides: InstanceOverrides = {};
  let count = 0;
  for (const [key, raw_entry] of Object.entries(raw)) {
    if (count >= MAX_INSTANCE_OVERRIDES) break;
    if (!INSTANCE_OVERRIDE_KEY_REGEX.test(key)) continue;
    const element_id = key.slice(key.indexOf(":") + 1);
    const entry = sanitize_instance_entry(element_id, raw_entry);
    if (Object.keys(entry).length === 0) continue;
    overrides[key] = entry;
    count += 1;
  }
  return overrides;
}

/** Schema for settings data loaded from blockchain */
export const settings_schema = z
  .object({
    // Core identity
    hiveUsername: z.string().optional().default(""),
    siteTheme: z.string().optional().default("light"),
    customColors: z.unknown().optional().default(null),
    siteName: z.string().optional().default(""),
    siteDescription: z.string().optional().default(""),

    // Layout sections (complex nested array - validate loosely)
    layoutSections: z.array(z.unknown()).optional().default([]),

    // Posts layout
    postsLayout: z.enum(["list", "grid", "masonry"]).optional().default("list"),
    gridColumns: z.number().optional().default(2),
    cardGapPx: z.number().optional().default(24),
    cardLayout: z
      .enum(["horizontal", "vertical"])
      .optional()
      .default("horizontal"),
    thumbnailPosition: z.enum(["left", "right"]).optional().default("left"),
    thumbnailSizePx: z.number().optional().default(96),
    cardPaddingPx: z.number().optional().default(24),
    cardBorderRadiusPx: z.number().optional().default(16),
    titleSizePx: z.number().optional().default(20),

    // Card visibility toggles
    showThumbnail: z.boolean().optional().default(true),
    showSummary: z.boolean().optional().default(true),
    summaryMaxLength: z.number().optional().default(150),
    showDate: z.boolean().optional().default(true),
    showVotes: z.boolean().optional().default(true),
    showComments: z.boolean().optional().default(true),
    showPayout: z.boolean().optional().default(true),
    showTags: z.boolean().optional().default(true),
    cardBorder: z.boolean().optional().default(true),
    maxTags: z.number().optional().default(5),

    // Header & author
    showHeader: z.boolean().optional().default(true),
    showAuthorProfile: z.boolean().optional().default(true),
    authorAvatarSizePx: z.number().optional().default(64),
    showPostCount: z.boolean().optional().default(true),
    showAuthorRewards: z.boolean().optional().default(true),
    postsPerPage: z
      .number()
      .min(POSTS_PER_PAGE_MIN)
      .max(POSTS_PER_PAGE_MAX)
      .optional()
      .default(20),
    sidebarWidthPx: z.number().optional().default(280),

    // Author Profile extended settings
    authorProfileLayout: z
      .enum(["horizontal", "vertical"])
      .optional()
      .default("horizontal"),
    showAuthorAbout: z.boolean().optional().default(true),
    showAuthorLocation: z.boolean().optional().default(true),
    showAuthorWebsite: z.boolean().optional().default(true),
    showAuthorJoinDate: z.boolean().optional().default(true),
    showAuthorReputation: z.boolean().optional().default(true),
    showAuthorFollowers: z.boolean().optional().default(true),
    showAuthorFollowing: z.boolean().optional().default(true),
    showAuthorVotingPower: z.boolean().optional().default(false),
    showAuthorHiveBalance: z.boolean().optional().default(false),
    showAuthorHbdBalance: z.boolean().optional().default(false),
    showAuthorCoverImage: z.boolean().optional().default(true),
    authorCoverHeightPx: z.number().optional().default(64),
    authorUsernameSizePx: z.number().optional().default(14),
    authorDisplayNameSizePx: z.number().optional().default(18),
    authorAboutSizePx: z.number().optional().default(14),
    authorStatsSizePx: z.number().optional().default(14),
    authorMetaSizePx: z.number().optional().default(12),
    authorReputationSizePx: z.number().optional().default(12),

    // Comments Tab settings
    showCommentsTab: z.boolean().optional().default(true),

    // Comment Card settings
    commentShowAuthor: z.boolean().optional().default(true),
    commentShowAvatar: z.boolean().optional().default(true),
    commentAvatarSizePx: z.number().optional().default(40),
    commentShowReplyContext: z.boolean().optional().default(true),
    commentShowTimestamp: z.boolean().optional().default(true),
    commentShowRepliesCount: z.boolean().optional().default(true),
    commentShowVotes: z.boolean().optional().default(true),
    commentShowPayout: z.boolean().optional().default(true),
    commentShowViewLink: z.boolean().optional().default(true),
    commentMaxLength: z.number().optional().default(0),
    commentPaddingPx: z.number().optional().default(16),

    // Card layouts (complex recursive structures - validate loosely)
    postCardLayout: z.unknown().optional(),
    commentCardLayout: z.unknown().optional(),
    authorProfileLayout2: z.unknown().optional(),

    // Page layout - legacy (complex nested structure - validate loosely)
    pageLayout: z.unknown().optional(),

    // Page layout - container-based (v3)
    pageLayoutConfig: z
      .object({
        template: z.enum([
          "no-sidebar",
          "sidebar-left",
          "sidebar-right",
          "both-sidebars",
        ]),
        containers: (() => {
          const containerElementSchema = z.object({
            id: z.enum([
              "header",
              "authorProfile",
              "communityProfile",
              "communitySidebar",
              "footer",
            ]),
            active: z.boolean(),
          });
          return z.object({
            top: z.object({ elements: z.array(containerElementSchema) }),
            sidebarLeft: z.object({
              elements: z.array(containerElementSchema),
            }),
            sidebarRight: z.object({
              elements: z.array(containerElementSchema),
            }),
            bottom: z.object({ elements: z.array(containerElementSchema) }),
          });
        })(),
      })
      .optional(),

    // Sorting settings
    postsSortOrder: z.enum(["blog", "posts"]).optional().default("blog"),
    includeReblogs: z.boolean().optional().default(false),

    // Card Hover Animation settings
    cardHoverEffect: z
      .enum(["none", "shadow", "lift", "scale", "glow"])
      .optional()
      .default("shadow"),
    cardTransitionDuration: z.number().optional().default(200),
    cardHoverScale: z.number().optional().default(1.02),
    cardHoverShadow: z
      .enum(["sm", "md", "lg", "xl", "2xl"])
      .optional()
      .default("md"),
    cardHoverBrightness: z.number().optional().default(1.0),

    // Scroll Animation settings
    scrollAnimationEnabled: z.boolean().optional().default(true),
    scrollAnimationType: z
      .enum(["none", "fade", "slide-up", "slide-left", "zoom", "flip"])
      .optional()
      .default("fade"),
    scrollAnimationDuration: z.number().optional().default(400),
    scrollAnimationDelay: z.number().optional().default(100),

    // Navigation Tabs (array of objects - validate loosely)
    navigationTabs: z.array(z.unknown()).optional().default([]),

    // Social media links: invalid entries are dropped individually, not the whole list
    socialLinks: z
      .array(z.unknown())
      .transform((items) =>
        items.flatMap((item) => {
          const parsed = social_link_schema.safeParse(item);
          return parsed.success ? [parsed.data] : [];
        }),
      )
      .optional()
      .default([]),

    // Pinned posts (user blog mode only)
    pinnedPostPermlinks: z
      .array(z.string().regex(PINNED_POST_ENTRY_REGEX))
      .max(MAX_PINNED_POSTS)
      .optional()
      .default([]),

    // Footer settings
    footer_text: z.string().max(500).optional(),

    // Community-specific display settings
    community_default_sort: community_sort_schema.optional(),
    community_show_rules: z.boolean().optional(),
    community_show_leadership: z.boolean().optional(),
    community_show_subscribers: z.boolean().optional(),
    community_show_description: z.boolean().optional(),
    community_avatar_size_px: z.number().min(32).max(96).optional(),
    community_title_size_px: z.number().min(14).max(28).optional(),
    community_about_size_px: z.number().min(12).max(18).optional(),
    community_visible_sorts: z.array(community_sort_schema).optional(),

    // Per-instance size overrides: values reach inline styles, so only whitelisted in-range integers survive
    instanceOverrides: z
      .record(z.string(), z.unknown())
      .transform(sanitize_instance_overrides)
      .optional(),
  })
  .passthrough();

/** Type inferred from the Zod schema (after parsing with defaults applied) */
export type SettingsDataParsed = z.infer<typeof settings_schema>;

/**
 * Granular per-field validation -- unlike safeParse which is all-or-nothing,
 * this validates each top-level key independently. Fields that fail validation
 * are silently dropped so merge_with_defaults can fill them in later.
 */
export function parse_settings_graceful(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const shape = settings_schema.shape;

  for (const key of Object.keys(raw)) {
    const field_schema = shape[key as keyof typeof shape];

    if (!field_schema) {
      // Unknown field (passthrough) -- keep as-is for forward compatibility
      result[key] = raw[key];
      continue;
    }

    const parsed = field_schema.safeParse(raw[key]);

    if (parsed.success) {
      result[key] = parsed.data;
    } else if (import.meta.env.DEV) {
      console.warn(
        `Config field "${key}" failed validation, will use default:`,
        parsed.error.issues,
      );
    }
  }

  return result;
}
