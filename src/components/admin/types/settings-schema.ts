// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

// ============================================
// Zod Schema for SettingsData validation
// ============================================
// Validates config loaded from Hive blockchain.
// Structured layouts get the same shape checks as the design file import (layout-shape);
// unknown top-level keys are dropped, since nothing reads fields outside SettingsData.

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
  FONT_IDS,
  DENSITY_IDS,
  PRESET_ID_MAX_LENGTH,
  PRESET_ID_REGEX,
  clamp_style_token,
  is_heading_scale,
  type StyleTokenRangeKey,
  type HeadingScale,
  defaultSettings,
  BRAND_MODES,
  BRAND_SIZES,
  SEO_DESCRIPTION_MAX_CHARS,
  SITE_LOCALES,
  NAV_MAX_LINKS,
  FOOTER_VARIANTS,
  FOOTER_LIMITS,
  GLOBAL_FIELD_KEYS,
  HOME_SECTION_TYPES,
  HOME_MAX_SECTIONS,
  HOME_SECTION_TYPE_MAX,
  HOME_SECTION_ID_REGEX,
  POSTS_SECTION_FALLBACK_ID,
  SECTION_WIDTHS,
  SECTION_SPACINGS,
  SECTION_BGS,
  SECTION_OVERLAYS,
  SECTION_ALIGNS,
  IMAGE_SIDES,
  HERO_VARIANTS,
  HERO_HEIGHTS,
  TEXT_MEDIA_RATIOS,
  IMAGE_SHAPES,
  CTA_BAND_VARIANTS,
  CTA_CONSENT_MODES,
  SECTION_STYLE_DEFAULTS,
  SECTION_TEXT_LIMITS,
  PAGE_FOOTER_PLACEMENTS,
  PAGES_LIMITS,
  RESERVED_PAGE_SLUGS,
  type HomeSection,
  type HomeSettings,
  type PageDef,
  type BrandSettings,
  type SeoSettings,
  type TopbarSettings,
  type NavSettings,
  type FooterColumn,
  type FooterSettings,
  type GlobalFieldKey,
  type SettingsData,
} from "./settings";
import {
  LINK_LABEL_MAX_CHARS,
  LINK_TAG_REGEX,
  PAGE_SLUG_LENGTH,
  PAGE_SLUG_REGEX,
  type Cta,
  type Link,
} from "./navigation";
import {
  ContactUrlSchema,
  ImageRefSchema,
  ImageUrlSchema,
  UrlSchema,
  parse_image_ref,
  safe_image_url,
} from "../../../lib/image-ref";
import { SOCIAL_PLATFORMS, build_social_url } from "./social";
import {
  parse_card_layout,
  parse_custom_colors,
  parse_layout_sections,
  parse_navigation_tabs,
  parse_page_layout,
  type Shaped,
} from "./layout-shape";

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

const font_id_schema = z.enum(FONT_IDS);

function shaped_schema<T>(parse: (raw: unknown) => Shaped<T>) {
  return z.unknown().transform((raw, ctx): T => {
    const parsed = parse(raw);
    if (parsed.ok) return parsed.value;
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid shape" });
    return z.NEVER;
  });
}

function style_token_schema(key: StyleTokenRangeKey) {
  const fallback = defaultSettings[key];
  return z
    .number()
    .finite()
    .transform((value) => clamp_style_token(key, value) ?? fallback)
    .optional()
    .default(fallback);
}

function code_point_length(value: string): number {
  return Array.from(value).length;
}

function text_schema(min: number, max: number) {
  return z
    .string()
    .transform((value) => value.trim())
    .refine(
      (value) => {
        const length = code_point_length(value);
        return length >= min && length <= max;
      },
      { message: `Text must be ${min}-${max} characters` },
    );
}

const link_label_schema = text_schema(1, LINK_LABEL_MAX_CHARS);

/** nav/footer/CTA link; `page` targets are format-checked only until pages[] exists. */
export const LinkSchema = z.discriminatedUnion("kind", [
  z.object({
    label: link_label_schema,
    kind: z.literal("url"),
    target: ContactUrlSchema,
  }),
  z.object({
    label: link_label_schema,
    kind: z.literal("tag"),
    target: z.string().regex(LINK_TAG_REGEX),
  }),
  z.object({
    label: link_label_schema,
    kind: z.literal("page"),
    target: z
      .string()
      .min(PAGE_SLUG_LENGTH.min)
      .max(PAGE_SLUG_LENGTH.max)
      .regex(PAGE_SLUG_REGEX),
  }),
]);

export const CtaSchema = z.object({
  label: link_label_schema,
  url: ContactUrlSchema,
});

export const BrandSchema = z.object({
  logo: ImageRefSchema.optional(),
  mode: z.enum(BRAND_MODES).default(defaultSettings.brand.mode),
  size: z.enum(BRAND_SIZES).default(defaultSettings.brand.size),
});

const seo_description_schema = text_schema(0, SEO_DESCRIPTION_MAX_CHARS);

export const SeoSchema = z.object({
  og_image: ImageRefSchema.optional(),
  favicon: ImageUrlSchema.optional(),
  description: seo_description_schema.optional(),
});

export const LocaleSchema = z.enum(SITE_LOCALES);

export const TopbarSchema = z.object({
  show_login: z.boolean().default(defaultSettings.topbar.show_login),
  show_node_switcher: z
    .boolean()
    .default(defaultSettings.topbar.show_node_switcher),
});

export const NavSchema = z.object({
  links: z.array(LinkSchema).max(NAV_MAX_LINKS).default([]),
  cta: CtaSchema.optional(),
});

const footer_title_schema = text_schema(0, FOOTER_LIMITS.column_title_chars);
const footer_copyright_schema = text_schema(0, FOOTER_LIMITS.copyright_chars);
const footer_company_schema = text_schema(0, FOOTER_LIMITS.company_chars);

const FooterColumnSchema = z.object({
  title: footer_title_schema.default(""),
  links: z.array(LinkSchema).max(FOOTER_LIMITS.links_per_column).default([]),
});

export const FooterSchema = z.object({
  variant: z.enum(FOOTER_VARIANTS).default(defaultSettings.footer.variant),
  columns: z.array(FooterColumnSchema).max(FOOTER_LIMITS.columns).default([]),
  copyright: footer_copyright_schema.optional(),
  company: footer_company_schema.optional(),
  privacy: LinkSchema.optional(),
  legal_links: z.array(LinkSchema).max(FOOTER_LIMITS.legal_links).default([]),
  show_social: z.boolean().default(defaultSettings.footer.show_social),
});

const utf8_encoder = new TextEncoder();

function utf8_length(value: string): number {
  return utf8_encoder.encode(value).length;
}

function markdown_schema(max_bytes: number) {
  return z.string().refine((value) => utf8_length(value) <= max_bytes, {
    message: `Markdown must be at most ${max_bytes} bytes (UTF-8)`,
  });
}

function style_enum<T extends readonly [string, ...string[]]>(
  options: T,
  fallback: T[number],
) {
  return z.enum(options).catch(fallback).default(fallback);
}

const decorative_image_schema = z.preprocess(
  (raw) => (is_record(raw) ? { ...raw, decorative: true } : raw),
  ImageRefSchema,
);

const common_style_defaults = SECTION_STYLE_DEFAULTS.common;
const common_style_shape = {
  width: style_enum(SECTION_WIDTHS, common_style_defaults.width),
  spacing: style_enum(SECTION_SPACINGS, common_style_defaults.spacing),
  bg: style_enum(SECTION_BGS, common_style_defaults.bg),
  bg_image: decorative_image_schema.optional(),
  overlay: style_enum(SECTION_OVERLAYS, common_style_defaults.overlay),
};

const section_base_shape = {
  id: z.string().regex(HOME_SECTION_ID_REGEX, {
    message: "Section id must be 8 characters [a-z0-9]",
  }),
  hidden: z.boolean().optional(),
};

const text_limits = SECTION_TEXT_LIMITS;
const hero_style = SECTION_STYLE_DEFAULTS.hero;
const text_media_style = SECTION_STYLE_DEFAULTS["text-media"];
const cta_band_style = SECTION_STYLE_DEFAULTS["cta-band"];

const HeroSectionSchema = z.object({
  ...section_base_shape,
  type: z.literal("hero"),
  content: z.object({
    headline: text_schema(1, text_limits.hero_headline_chars),
    subheadline: text_schema(0, text_limits.hero_subheadline_chars).optional(),
    cta: z.array(CtaSchema).max(text_limits.hero_cta).optional(),
    image: ImageRefSchema.optional(),
  }),
  style: z
    .object({
      ...common_style_shape,
      variant: style_enum(HERO_VARIANTS, hero_style.variant),
      height: style_enum(HERO_HEIGHTS, hero_style.height),
      align: style_enum(SECTION_ALIGNS, hero_style.align),
      image_side: style_enum(IMAGE_SIDES, hero_style.image_side),
    })
    .default({}),
});

const TextMediaSectionSchema = z.object({
  ...section_base_shape,
  type: z.literal("text-media"),
  content: z
    .object({
      title: text_schema(0, text_limits.text_media_title_chars).optional(),
      body_md: markdown_schema(text_limits.text_media_body_bytes).optional(),
      image: ImageRefSchema.optional(),
      cta: CtaSchema.optional(),
    })
    .default({}),
  style: z
    .object({
      ...common_style_shape,
      image_side: style_enum(IMAGE_SIDES, text_media_style.image_side),
      ratio: style_enum(TEXT_MEDIA_RATIOS, text_media_style.ratio),
      image_shape: style_enum(IMAGE_SHAPES, text_media_style.image_shape),
    })
    .default({}),
});

const PostsSectionSchema = z.object({
  ...section_base_shape,
  type: z.literal("posts"),
  content: z
    .object({ title: text_schema(0, text_limits.posts_title_chars).optional() })
    .default({}),
  style: z.object(common_style_shape).default({}),
});

const CtaBandSectionSchema = z.object({
  ...section_base_shape,
  type: z.literal("cta-band"),
  content: z.object({
    title: text_schema(1, text_limits.cta_band_title_chars),
    body: text_schema(0, text_limits.cta_band_body_chars).optional(),
    button: z.object({ label: link_label_schema, url: UrlSchema }),
    consent_text: text_schema(0, text_limits.cta_band_consent_chars).optional(),
    consent_mode: z.enum(CTA_CONSENT_MODES).catch("notice").default("notice"),
  }),
  style: z
    .object({
      ...common_style_shape,
      variant: style_enum(CTA_BAND_VARIANTS, cta_band_style.variant),
      align: style_enum(SECTION_ALIGNS, cta_band_style.align),
    })
    .default({}),
});

export const HomeSectionSchema = z.discriminatedUnion("type", [
  HeroSectionSchema,
  TextMediaSectionSchema,
  PostsSectionSchema,
  CtaBandSectionSchema,
]);

export const HomeSchema = z.object({
  sections: z
    .array(HomeSectionSchema)
    .max(HOME_MAX_SECTIONS)
    .superRefine((sections, ctx) => {
      const seen_ids = new Set<string>();
      sections.forEach((section, index) => {
        if (seen_ids.has(section.id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [index, "id"],
            message: `Duplicate section id "${section.id}"`,
          });
        }
        seen_ids.add(section.id);
      });
      for (const type of HOME_SECTION_TYPES) {
        const count = sections.filter(
          (section) => section.type === type,
        ).length;
        if (count > HOME_SECTION_TYPE_MAX[type]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `At most ${HOME_SECTION_TYPE_MAX[type]} "${type}" section(s) allowed`,
          });
        }
        if (type === "posts" && count !== 1) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Home must contain exactly one "posts" section',
          });
        }
      }
    }),
});

const page_slug_schema = z
  .string()
  .min(PAGE_SLUG_LENGTH.min)
  .max(PAGE_SLUG_LENGTH.max)
  .regex(PAGE_SLUG_REGEX, {
    message: "Slug may contain only a-z, 0-9 and single hyphens",
  })
  .refine((slug) => !RESERVED_PAGE_SLUGS.has(slug), {
    message: "Slug is reserved",
  });

export const PageDefSchema = z.object({
  slug: page_slug_schema,
  title: text_schema(1, PAGES_LIMITS.title_chars),
  description: text_schema(0, PAGES_LIMITS.description_chars).optional(),
  body_md: markdown_schema(PAGES_LIMITS.body_bytes).default(""),
  in_nav: z.boolean().default(false),
  in_footer: z.enum(PAGE_FOOTER_PLACEMENTS).default("none"),
  footer_column: z
    .number()
    .int()
    .min(0)
    .max(PAGES_LIMITS.footer_columns - 1)
    .default(0),
});

export const PagesSchema = z
  .array(PageDefSchema)
  .max(PAGES_LIMITS.max_pages)
  .superRefine((pages, ctx) => {
    const seen_slugs = new Set<string>();
    pages.forEach((page, index) => {
      if (seen_slugs.has(page.slug)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "slug"],
          message: `Duplicate page slug "${page.slug}"`,
        });
      }
      seen_slugs.add(page.slug);
    });
    const total_bytes = pages.reduce(
      (sum, page) => sum + utf8_length(page.body_md),
      0,
    );
    if (total_bytes > PAGES_LIMITS.total_body_bytes) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Pages content is ${total_bytes} bytes, limit is ${PAGES_LIMITS.total_body_bytes} bytes (UTF-8)`,
      });
    }
  });

/** Fresh `posts` section with default style; callers own the returned object. */
export function create_posts_section(
  id: string = POSTS_SECTION_FALLBACK_ID,
): HomeSection {
  return {
    id,
    type: "posts",
    content: {},
    style: { ...SECTION_STYLE_DEFAULTS.common },
  };
}

const GLOBAL_FIELD_SCHEMAS = {
  brand: BrandSchema,
  seo: SeoSchema,
  locale: LocaleSchema,
  topbar: TopbarSchema,
  nav: NavSchema,
  footer: FooterSchema,
  home: HomeSchema,
  pages: PagesSchema,
} as const satisfies Record<GlobalFieldKey, z.ZodTypeAny>;

function is_record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pick<T>(
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  value: unknown,
): T | undefined {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

// Hostile config arrays are read on every SSR request: only the first `limit * N` raw entries are ever parsed.
const RAW_ENTRIES_SCANNED_PER_KEPT_SLOT = 4;

function raw_scan_window(
  values: ReadonlyArray<unknown>,
  limit: number,
): ReadonlyArray<unknown> {
  return values.slice(0, limit * RAW_ENTRIES_SCANNED_PER_KEPT_SLOT);
}

function pick_list<T>(
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  value: unknown,
  max: number,
): T[] {
  if (!Array.isArray(value)) return [];
  const picked: T[] = [];
  for (const raw_item of raw_scan_window(value, max)) {
    if (picked.length >= max) break;
    const parsed = pick(schema, raw_item);
    if (parsed !== undefined) picked.push(parsed);
  }
  return picked;
}

function parse_brand(raw: unknown): BrandSettings | undefined {
  if (!is_record(raw)) return undefined;
  const brand: BrandSettings = {
    mode: pick(z.enum(BRAND_MODES), raw.mode) ?? defaultSettings.brand.mode,
    size: pick(z.enum(BRAND_SIZES), raw.size) ?? defaultSettings.brand.size,
  };
  const logo = parse_image_ref(raw.logo);
  if (logo) brand.logo = logo;
  return brand;
}

function parse_seo(raw: unknown): SeoSettings | undefined {
  if (!is_record(raw)) return undefined;
  const seo: SeoSettings = {};
  const og_image = parse_image_ref(raw.og_image);
  if (og_image) seo.og_image = og_image;
  const favicon = safe_image_url(raw.favicon);
  if (favicon) seo.favicon = favicon;
  const description = pick(seo_description_schema, raw.description);
  if (description !== undefined) seo.description = description;
  return seo;
}

function parse_topbar(raw: unknown): TopbarSettings | undefined {
  if (!is_record(raw)) return undefined;
  const defaults = defaultSettings.topbar;
  return {
    show_login: pick(z.boolean(), raw.show_login) ?? defaults.show_login,
    show_node_switcher:
      pick(z.boolean(), raw.show_node_switcher) ?? defaults.show_node_switcher,
  };
}

function parse_nav(raw: unknown): NavSettings | undefined {
  if (!is_record(raw)) return undefined;
  const nav: NavSettings = {
    links: pick_list<Link>(LinkSchema, raw.links, NAV_MAX_LINKS),
  };
  const cta = pick<Cta>(CtaSchema, raw.cta);
  if (cta) nav.cta = cta;
  return nav;
}

function parse_footer_column(raw: unknown): FooterColumn | undefined {
  if (!is_record(raw)) return undefined;
  return {
    title: pick(footer_title_schema, raw.title) ?? "",
    links: pick_list<Link>(
      LinkSchema,
      raw.links,
      FOOTER_LIMITS.links_per_column,
    ),
  };
}

function parse_footer(raw: unknown): FooterSettings | undefined {
  if (!is_record(raw)) return undefined;
  const defaults = defaultSettings.footer;
  const columns = Array.isArray(raw.columns)
    ? raw.columns
        .flatMap((item) => parse_footer_column(item) ?? [])
        .slice(0, FOOTER_LIMITS.columns)
    : [];
  const footer: FooterSettings = {
    variant: pick(z.enum(FOOTER_VARIANTS), raw.variant) ?? defaults.variant,
    columns,
    legal_links: pick_list<Link>(
      LinkSchema,
      raw.legal_links,
      FOOTER_LIMITS.legal_links,
    ),
    show_social: pick(z.boolean(), raw.show_social) ?? defaults.show_social,
  };
  const copyright = pick(footer_copyright_schema, raw.copyright);
  if (copyright !== undefined) footer.copyright = copyright;
  const company = pick(footer_company_schema, raw.company);
  if (company !== undefined) footer.company = company;
  const privacy = pick<Link>(LinkSchema, raw.privacy);
  if (privacy) footer.privacy = privacy;
  return footer;
}

const REQUIRED_CONTENT_KEYS: Readonly<Record<string, ReadonlyArray<string>>> = {
  hero: ["headline"],
  "cta-band": ["title", "button"],
};

function drop_invalid_optional_fields(
  section: Record<string, unknown>,
  issues: z.ZodIssue[],
): boolean {
  const type = String(section.type);
  const required = Object.hasOwn(REQUIRED_CONTENT_KEYS, type)
    ? REQUIRED_CONTENT_KEYS[type]
    : [];
  for (const issue of issues) {
    const [group, field] = issue.path;
    if (group === "hidden" && issue.path.length === 1) {
      delete section.hidden;
      continue;
    }
    if ((group !== "content" && group !== "style") || field === undefined) {
      return false;
    }
    if (group === "content" && required.includes(String(field))) return false;
    const fields = section[group];
    if (is_record(fields)) delete fields[String(field)];
  }
  return true;
}

/** One home section from untrusted config: invalid optional fields are dropped, invalid required ones drop the section. */
function parse_home_section(raw: unknown): HomeSection | undefined {
  if (!is_record(raw)) return undefined;
  const section: Record<string, unknown> = {
    ...raw,
    content: is_record(raw.content) ? { ...raw.content } : {},
    style: is_record(raw.style) ? { ...raw.style } : {},
  };
  const content = section.content as Record<string, unknown>;
  if (section.type === "hero" && content.cta !== undefined) {
    content.cta = pick_list<Cta>(CtaSchema, content.cta, text_limits.hero_cta);
  }
  const first_pass = HomeSectionSchema.safeParse(section);
  if (first_pass.success) return first_pass.data;
  if (!drop_invalid_optional_fields(section, first_pass.error.issues)) {
    return undefined;
  }
  return pick(HomeSectionSchema, section);
}

function unused_posts_id(taken_ids: ReadonlySet<string>): string {
  let suffix = 1;
  let id = POSTS_SECTION_FALLBACK_ID;
  while (taken_ids.has(id)) {
    suffix += 1;
    id = `posts${String(suffix).padStart(3, "0")}`;
  }
  return id;
}

/** Keeps valid sections within type and total limits; guarantees exactly one `posts` section. */
function parse_home(raw: unknown): HomeSettings | undefined {
  if (!is_record(raw) || !Array.isArray(raw.sections)) return undefined;
  const sections: HomeSection[] = [];
  const taken_ids = new Set<string>();
  const type_counts = new Map<string, number>();
  for (const raw_section of raw_scan_window(raw.sections, HOME_MAX_SECTIONS)) {
    if (sections.length >= HOME_MAX_SECTIONS) break;
    const section = parse_home_section(raw_section);
    if (!section || taken_ids.has(section.id)) continue;
    const count = type_counts.get(section.type) ?? 0;
    if (count >= HOME_SECTION_TYPE_MAX[section.type]) continue;
    type_counts.set(section.type, count + 1);
    taken_ids.add(section.id);
    sections.push(section);
  }
  if (!type_counts.has("posts")) {
    if (sections.length >= HOME_MAX_SECTIONS) {
      const dropped = sections.pop();
      if (dropped) taken_ids.delete(dropped.id);
    }
    sections.push(create_posts_section(unused_posts_id(taken_ids)));
  }
  return { sections };
}

/** Keeps valid pages with unique slugs while they fit the count and total markdown budget. */
function parse_pages(raw: unknown): PageDef[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const pages: PageDef[] = [];
  const taken_slugs = new Set<string>();
  let total_bytes = 0;
  for (const raw_page of raw_scan_window(raw, PAGES_LIMITS.max_pages)) {
    if (pages.length >= PAGES_LIMITS.max_pages) break;
    const page = pick(PageDefSchema, raw_page);
    if (!page || taken_slugs.has(page.slug)) continue;
    const body_bytes = utf8_length(page.body_md);
    if (total_bytes + body_bytes > PAGES_LIMITS.total_body_bytes) continue;
    total_bytes += body_bytes;
    taken_slugs.add(page.slug);
    pages.push(page);
  }
  return pages;
}

/** Tolerant readers of untrusted config: invalid sub-values fall back to defaults or are dropped, never throw. */
const GLOBAL_FIELD_READERS: {
  [K in GlobalFieldKey]: (raw: unknown) => SettingsData[K] | undefined;
} = {
  brand: parse_brand,
  seo: parse_seo,
  locale: (raw) => pick(LocaleSchema, raw),
  topbar: parse_topbar,
  nav: parse_nav,
  footer: parse_footer,
  home: parse_home,
  pages: parse_pages,
};

function tolerant_reader_schema<K extends GlobalFieldKey>(key: K) {
  return z.unknown().transform((raw, ctx): NonNullable<SettingsData[K]> => {
    const parsed = GLOBAL_FIELD_READERS[key](raw);
    if (parsed !== undefined && parsed !== null) return parsed;
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid value" });
    return z.NEVER;
  });
}

function tolerant_schema<K extends GlobalFieldKey>(key: K) {
  return tolerant_reader_schema(key)
    .optional()
    .default(() => structuredClone(defaultSettings[key]));
}

/** Replaces invalid global fields in place with clones of `defaults`; guards values that bypassed the schema. */
export function sanitize_global_fields(
  settings: SettingsData,
  defaults: SettingsData,
): void {
  for (const key of GLOBAL_FIELD_KEYS) {
    const value =
      GLOBAL_FIELD_READERS[key](settings[key]) ??
      structuredClone(defaults[key]);
    if (value === undefined) {
      delete settings[key];
      continue;
    }
    Object.assign(settings, { [key]: value });
  }
}

function links_with_paths(settings: SettingsData): Array<[string, Link]> {
  const { nav, footer } = settings;
  const entries: Array<[string, Link]> = nav.links.map((link, index) => [
    `nav.links.${index}`,
    link,
  ]);
  footer.columns.forEach((column, column_index) =>
    column.links.forEach((link, index) =>
      entries.push([`footer.columns.${column_index}.links.${index}`, link]),
    ),
  );
  footer.legal_links.forEach((link, index) =>
    entries.push([`footer.legal_links.${index}`, link]),
  );
  if (footer.privacy) entries.push(["footer.privacy", footer.privacy]);
  return entries;
}

function page_target_slugs(links: ReadonlyArray<Link>): Set<string> {
  return new Set(
    links.filter((link) => link.kind === "page").map((link) => link.target),
  );
}

/** Mirrors withPageNavLinks / withPageFooterLinks: pages already linked by the owner are not counted again. */
function page_link_limit_errors(settings: SettingsData): string[] {
  const errors: string[] = [];
  const pages = settings.pages ?? [];
  const { nav, footer } = settings;

  const nav_slugs = page_target_slugs(nav.links);
  const nav_page_count = pages.filter(
    (page) => page.in_nav && !nav_slugs.has(page.slug),
  ).length;
  const nav_total = nav.links.length + nav_page_count;
  if (nav_total > NAV_MAX_LINKS) {
    errors.push(
      `nav.links: Menu has ${nav_total} links (max ${NAV_MAX_LINKS}) including pages shown in menu`,
    );
  }

  const footer_slugs = page_target_slugs(
    links_with_paths(settings)
      .filter(([path]) => path.startsWith("footer."))
      .map(([, link]) => link),
  );
  const footer_pages = pages.filter((page) => !footer_slugs.has(page.slug));

  const legal_total =
    footer.legal_links.length +
    footer_pages.filter((page) => page.in_footer === "legal").length;
  if (legal_total > FOOTER_LIMITS.legal_links) {
    errors.push(
      `footer.legal_links: Footer bottom row has ${legal_total} links (max ${FOOTER_LIMITS.legal_links}) including pages shown there`,
    );
  }

  for (
    let column_index = 0;
    column_index < FOOTER_LIMITS.columns;
    column_index++
  ) {
    const column_total =
      (footer.columns[column_index]?.links.length ?? 0) +
      footer_pages.filter(
        (page) =>
          page.in_footer === "column" && page.footer_column === column_index,
      ).length;
    if (column_total > FOOTER_LIMITS.links_per_column) {
      errors.push(
        `footer.columns.${column_index}.links: Footer column ${column_index + 1} has ${column_total} links (max ${FOOTER_LIMITS.links_per_column}) including pages placed in it`,
      );
    }
  }
  return errors;
}

/** Rules spanning several global fields; run on already validated values. */
function cross_field_errors(settings: SettingsData): string[] {
  const errors: string[] = [];
  const has_cta_band = (settings.home?.sections ?? []).some(
    (section) => section.type === "cta-band",
  );
  if (has_cta_band && !settings.footer.privacy) {
    errors.push(
      "footer.privacy: A privacy policy link is required when the home page has a newsletter (cta-band) section",
    );
  }
  const page_slugs = new Set((settings.pages ?? []).map((page) => page.slug));
  for (const [path, link] of links_with_paths(settings)) {
    if (link.kind === "page" && !page_slugs.has(link.target)) {
      errors.push(`${path}.target: Page "${link.target}" does not exist`);
    }
  }
  errors.push(...page_link_limit_errors(settings));
  return errors;
}

export type SaveValidationResult =
  { ok: true; settings: SettingsData } | { ok: false; errors: string[] };

/**
 * Single gate before a config is written (chain or dev store): global fields must pass the strict schemas.
 * Returns a copy with normalized values (trimmed labels, normalized URLs, unknown nested keys dropped).
 */
export function validate_settings_for_save(
  settings: SettingsData,
): SaveValidationResult {
  const validated: SettingsData = { ...settings };
  const errors: string[] = [];
  for (const key of GLOBAL_FIELD_KEYS) {
    const value = settings[key] ?? defaultSettings[key];
    if (value === undefined) continue;
    const parsed = GLOBAL_FIELD_SCHEMAS[key].safeParse(value);
    if (parsed.success) {
      Object.assign(validated, { [key]: parsed.data });
      continue;
    }
    for (const issue of parsed.error.issues) {
      errors.push(`${[key, ...issue.path].join(".")}: ${issue.message}`);
    }
  }
  if (errors.length === 0) errors.push(...cross_field_errors(validated));
  return errors.length > 0
    ? { ok: false, errors }
    : { ok: true, settings: validated };
}

/** Schema for settings data loaded from blockchain */
export const settings_schema = z.object({
  // Core identity
  hiveUsername: z.string().optional().default(""),
  siteTheme: z.string().optional().default("light"),
  customColors: shaped_schema(parse_custom_colors).optional().default(null),
  siteName: z.string().optional().default(""),
  siteDescription: z.string().optional().default(""),

  layoutSections: shaped_schema(parse_layout_sections).optional().default([]),

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

  // Card layouts: legacy `elements: string[]` sections are migrated to the recursive format
  postCardLayout: shaped_schema(parse_card_layout).optional(),
  commentCardLayout: shaped_schema(parse_card_layout).optional(),
  authorProfileLayout2: shaped_schema(parse_card_layout).optional(),

  // Page layout - legacy slot-based
  pageLayout: shaped_schema(parse_page_layout).optional(),

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

  navigationTabs: shaped_schema(parse_navigation_tabs).optional().default([]),

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

  // Global style tokens: values reach CSS vars, so numbers are clamped to STYLE_TOKEN_RANGES and enums are strict
  fontHeading: font_id_schema.optional().default(defaultSettings.fontHeading),
  fontBody: font_id_schema.optional().default(defaultSettings.fontBody),
  radiusPx: style_token_schema("radiusPx"),
  density: z.enum(DENSITY_IDS).optional().default(defaultSettings.density),
  contentWidthPx: style_token_schema("contentWidthPx"),
  baseFontSizePx: style_token_schema("baseFontSizePx"),
  headingScale: z
    .number()
    .refine((value): value is HeadingScale => is_heading_scale(value))
    .optional()
    .default(defaultSettings.headingScale),
  presetId: z
    .string()
    .max(PRESET_ID_MAX_LENGTH)
    .regex(PRESET_ID_REGEX)
    .nullable()
    .optional()
    .default(null),

  // Site-wide content: tolerant per sub-field, so one bad link does not wipe the whole nav
  brand: tolerant_schema("brand"),
  seo: tolerant_schema("seo"),
  locale: tolerant_schema("locale"),
  topbar: tolerant_schema("topbar"),
  nav: tolerant_schema("nav"),
  footer: tolerant_schema("footer"),
  // No default: a missing field keeps the classic layout (config-pipeline adds the virtual posts section)
  home: tolerant_reader_schema("home").optional(),
  pages: tolerant_reader_schema("pages").optional(),
});

/** Type inferred from the Zod schema (after parsing with defaults applied) */
export type SettingsDataParsed = z.infer<typeof settings_schema>;

/**
 * Granular per-field validation -- unlike safeParse which is all-or-nothing,
 * this validates each top-level key independently. Fields that fail validation
 * and unknown keys are dropped, so merge_with_defaults fills them in later.
 */
export function parse_settings_graceful(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const shape = settings_schema.shape;

  for (const key of Object.keys(raw)) {
    // hasOwn: keys like "constructor" or "__proto__" would otherwise resolve on Object.prototype
    if (!Object.hasOwn(shape, key)) {
      if (import.meta.env.DEV) {
        console.warn(`Config field "${key}" is unknown, dropped`);
      }
      continue;
    }
    const field_schema = shape[key as keyof typeof shape];

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
