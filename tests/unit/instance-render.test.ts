// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { describe, expect, it } from "vitest";
import {
  defaultSettings,
  instance_key,
  type InstanceSizeOverrides,
  type SettingsData,
} from "../../src/components/admin/types/settings";
import { resolve_instance_settings } from "../../src/lib/instance-overrides";
import {
  renderPostCard,
  renderPostsGrid,
} from "../../src/shared/components/post-card/render";
import type {
  PostCardData,
  PostCardSettings,
  PostsGridSettings,
} from "../../src/shared/components/post-card/types";
import { renderCommentCard } from "../../src/shared/components/comment-card/render";
import type { CommentCardData } from "../../src/shared/components/comment-card/types";
import { createCommentCardSettings } from "../../src/shared/components/comment-card/utils";
import { renderAuthorProfileSections } from "../../src/shared/components/author-profile/render";
import {
  createAuthorProfileData,
  createAuthorProfileSettings,
  pickAuthorProfileSizes,
} from "../../src/shared/components/author-profile/utils";
import {
  createHeaderData,
  renderHeader,
} from "../../src/shared/components/header";
import {
  createSiteHeaderData,
  resolveSiteName,
} from "../../src/shared/components/header/utils";
import {
  createNavigationSettings,
  renderOwnerNav,
  type NavigationSettings,
} from "../../src/shared/components/navigation";
import { createOwnerNavConfig } from "../../src/shared/components/navigation/utils";
import {
  createFooterData,
  createFooterSettings,
  renderFooter,
} from "../../src/shared/components/footer";
import {
  createFooterRenderInput,
  hasFooterContent,
} from "../../src/shared/components/footer/utils";
import { format_date, t, type I18nKey } from "../../src/lib/i18n";
import { parse_fragment } from "./helpers/html-assert";

const SECTION = "page-sec-sidebar-left";

const POST: PostCardData = {
  permlink: "my-post",
  author: "alice",
  title: "Title",
  body: "Body",
  thumbnail: "https://images.hive.blog/x.png",
  publishedAt: new Date("2026-01-01T00:00:00Z"),
  votesCount: 1,
  commentsCount: 2,
  payout: 3,
  tags: ["hive"],
};

const COMMENT: CommentCardData = {
  author: "bob",
  permlink: "re-my-post",
  body: "Nice post",
  created: "2026-01-02T00:00:00",
  parentAuthor: "alice",
  parentPermlink: "my-post",
  children: 0,
  votesCount: 0,
  payout: 0,
  url: "/@alice/my-post#@bob/re-my-post",
  avatarUrl: "https://images.hive.blog/u/bob/avatar",
};

function with_overrides(
  element_id: string,
  overrides: InstanceSizeOverrides,
): SettingsData {
  return {
    ...structuredClone(defaultSettings),
    instanceOverrides: { [instance_key(SECTION, element_id)]: overrides },
  };
}

// Same mapping as BlogLogicPostsGrid.astro
function render_posts(settings: SettingsData): string {
  const card_settings: PostCardSettings = {
    thumbnailSizePx: settings.thumbnailSizePx ?? 96,
    cardPaddingPx: settings.cardPaddingPx ?? 24,
    cardBorderRadiusPx: settings.cardBorderRadiusPx ?? 16,
    titleSizePx: settings.titleSizePx ?? 20,
    summaryMaxLength: settings.summaryMaxLength ?? 150,
    maxTags: settings.maxTags ?? 5,
    cardBorder: settings.cardBorder !== false,
    postCardLayout: settings.postCardLayout,
  };
  const grid_settings: PostsGridSettings = {
    layout: "grid",
    columns: settings.gridColumns ?? 2,
    gap_px: settings.cardGapPx ?? 24,
  };
  return renderPostsGrid(
    [renderPostCard(POST, card_settings, true, "/my-post")],
    grid_settings,
  );
}

// Same mapping as CommentCard.astro
function render_comment(settings: SettingsData): string {
  return renderCommentCard(
    COMMENT,
    createCommentCardSettings({
      commentAvatarSizePx: settings.commentAvatarSizePx,
      commentPaddingPx: settings.commentPaddingPx,
      commentCardLayout: settings.commentCardLayout,
    }),
  );
}

// Same mapping as SlotRenderer.astro -> AuthorProfile.astro (sizes of the resolved instance settings)
function render_author(settings: SettingsData): string {
  return renderAuthorProfileSections(
    createAuthorProfileData("alice", null, null, null, null),
    createAuthorProfileSettings(pickAuthorProfileSizes(settings)),
  );
}

function inline_styles(html: string): string[] {
  return Array.from(parse_fragment(html).querySelectorAll("[style]")).map(
    (el) => el.getAttribute("style") ?? "",
  );
}

describe("render* with resolved instance settings", () => {
  it.each([
    [
      "posts",
      { cardGapPx: 7, cardPaddingPx: 9, cardBorderRadiusPx: 3 },
      render_posts,
    ],
    [
      "posts",
      { commentAvatarSizePx: 27, commentPaddingPx: 11 },
      render_comment,
    ],
    [
      "authorProfile",
      { authorAvatarSizePx: 123, authorCoverHeightPx: 177 },
      render_author,
    ],
  ] as const)(
    "%s override %o changes the rendered px values",
    (element_id, overrides, render) => {
      const settings = with_overrides(element_id, overrides);
      const resolved = resolve_instance_settings(settings, SECTION, element_id);

      const global_html = render(settings);
      const instance_html = render(resolved);

      expect(instance_html).not.toBe(global_html);
      expect(inline_styles(instance_html)).not.toEqual(
        inline_styles(global_html),
      );
      for (const value of Object.values(overrides)) {
        expect(instance_html).toContain(`${value}px`);
        expect(global_html).not.toContain(`${value}px`);
      }
    },
  );

  it.each([
    ["posts", render_posts],
    ["posts", render_comment],
    ["authorProfile", render_author],
  ] as const)(
    "%s without overrides renders identical output",
    (element_id, render) => {
      const settings = structuredClone(defaultSettings);
      const resolved = resolve_instance_settings(settings, SECTION, element_id);
      expect(render(resolved)).toBe(render(settings));
    },
  );

  it("override of another instance does not leak into this one", () => {
    const settings = with_overrides("posts", { cardGapPx: 7 });
    const other = resolve_instance_settings(
      settings,
      "page-sec-sidebar-right",
      "posts",
    );
    expect(render_posts(other)).toBe(render_posts(settings));
  });
});

describe("author profile with global author* sizes", () => {
  const AUTHOR_SIZES = {
    authorAvatarSizePx: 91,
    authorCoverHeightPx: 133,
    authorUsernameSizePx: 17,
    authorDisplayNameSizePx: 29,
    authorStatsSizePx: 19,
    authorMetaSizePx: 13,
    authorReputationSizePx: 15,
  } as const;

  it.each(Object.entries(AUTHOR_SIZES))(
    "global %s = %i changes the rendered instance output",
    (key, value) => {
      const settings = structuredClone(defaultSettings);
      const changed: SettingsData = { ...settings, [key]: value };

      const before = render_author(
        resolve_instance_settings(settings, SECTION, "authorProfile"),
      );
      const after = render_author(
        resolve_instance_settings(changed, SECTION, "authorProfile"),
      );

      expect(after).not.toBe(before);
      expect(after).toContain(`${value}px`);
    },
  );

  it("an instance override wins over the global value", () => {
    const settings: SettingsData = {
      ...with_overrides("authorProfile", { authorAvatarSizePx: 123 }),
      authorAvatarSizePx: 91,
    };
    const html = render_author(
      resolve_instance_settings(settings, SECTION, "authorProfile"),
    );
    expect(html).toContain("123px");
    expect(html).not.toContain("91px");
  });

  it("reputation size stays global, even with an override entry for it", () => {
    const settings: SettingsData = {
      ...with_overrides("authorProfile", {
        authorReputationSizePx: 10,
      } as InstanceSizeOverrides),
      authorReputationSizePx: 16,
    };
    const html = render_author(
      resolve_instance_settings(settings, SECTION, "authorProfile"),
    );
    expect(html).toContain('font-size: 16px;">Rep:');
  });
});

// SlotRenderer.astro and ElementRenderer.tsx both map settings through these shared utils.
const SITE = { name: "Honey Blog", description: "Posts from Hive blockchain" };
const YEAR = 2026;
const MENU_ID = `site-nav-menu-${SECTION}`;

function with_site(settings: SettingsData): SettingsData {
  return {
    ...settings,
    siteName: SITE.name,
    siteDescription: SITE.description,
  };
}

function footer_html(settings: SettingsData, site_name: string): string {
  const input = createFooterRenderInput(settings, site_name, YEAR);
  return renderFooter(input.data, undefined, input.owner, input.locale);
}

const ssr = {
  header: (settings: SettingsData) =>
    renderHeader(
      createSiteHeaderData({
        siteName: SITE.name,
        siteDescription: SITE.description,
        brand: settings.brand,
        locale: settings.locale,
      }),
    ),
  nav: (settings: SettingsData) =>
    renderOwnerNav(
      createNavigationSettings({
        navigationTabs: settings.navigationTabs,
        activeTab: "posts",
        ...createOwnerNavConfig(settings, SECTION),
      }),
    ),
  footer: (settings: SettingsData) => footer_html(settings, SITE.name),
};

const canvas = {
  header: (settings: SettingsData) =>
    renderHeader(createSiteHeaderData(settings)),
  nav: (settings: SettingsData) => {
    const nav: NavigationSettings = {
      tabs: (settings.navigationTabs || [])
        .filter((tab) => tab.enabled)
        .map((tab) => ({
          id: tab.id,
          label: tab.label,
          enabled: tab.enabled,
          showCount: false,
          tooltip: tab.tooltip,
        })),
      activeTab: "posts",
      postsCount: 0,
      commentsCount: 0,
      ...createOwnerNavConfig(settings, SECTION),
    };
    return renderOwnerNav(nav);
  },
  footer: (settings: SettingsData) =>
    footer_html(settings, resolveSiteName(settings)),
};

function configured_settings(locale: SettingsData["locale"]): SettingsData {
  return {
    ...with_site(structuredClone(defaultSettings)),
    locale,
    brand: {
      mode: "logo+text",
      size: "lg",
      logo: {
        url: "https://images.hive.blog/logo.png",
        alt: "",
        w: 200,
        h: 50,
      },
    },
    nav: {
      links: [
        { label: "About", kind: "page", target: "about" },
        { label: "Docs", kind: "url", target: "https://example.com/docs" },
      ],
      cta: { label: "Subscribe", url: "https://example.com/subscribe" },
    },
    footer: {
      variant: "mast",
      columns: [
        {
          title: "More",
          links: [
            { label: "Blog", kind: "url", target: "https://example.com/" },
          ],
        },
      ],
      copyright: "© Honey",
      legal_links: [],
      show_social: false,
    },
  };
}

describe("site-wide fields: SSR and canvas wiring", () => {
  it.each(["en", "pl"] as const)(
    "render identical header, nav and footer HTML (%s)",
    (locale) => {
      const settings = resolve_instance_settings(
        configured_settings(locale),
        SECTION,
        "header",
      );
      for (const part of ["header", "nav", "footer"] as const) {
        const html = ssr[part](settings);
        expect(html.length).toBeGreaterThan(0);
        expect(canvas[part](settings)).toBe(html);
      }
    },
  );

  it("passes brand, nav and footer content into the renders", () => {
    const settings = configured_settings("pl");
    expect(ssr.header(settings)).toContain("<img");
    const nav = ssr.nav(settings);
    expect(nav).toContain('href="/p/about"');
    expect(nav).toContain("data-nav-cta");
    expect(nav).toContain(t("pl", "nav.menu_open"));
    expect(nav).toContain(`id="${MENU_ID}"`);
    expect(ssr.footer(settings)).toContain("© Honey");
  });

  it("default settings keep the pre-existing output", () => {
    const settings = with_site(structuredClone(defaultSettings));
    expect(hasFooterContent(settings.footer)).toBe(false);
    for (const render of [ssr, canvas]) {
      expect(render.header(settings)).toBe(
        renderHeader(createHeaderData(SITE.name, SITE.description)),
      );
      expect(render.nav(settings)).toBe("");
      expect(render.footer(settings)).toBe(
        renderFooter(
          createFooterData({ custom_text: settings.footer_text }),
          createFooterSettings({ class: "" }),
        ),
      );
    }
    expect(ssr.footer(settings)).toContain("Built by");
    expect(ssr.footer(settings)).toContain("Powered by Hive Blockchain");
  });

  it("localizes the attribution labels but keeps its links", () => {
    const en = ssr.footer(configured_settings("en"));
    const pl = ssr.footer(configured_settings("pl"));
    expect(pl).toContain(t("pl", "footer.built_by"));
    expect(pl).toContain(
      t("pl", "footer.powered_by", { platform: "Hive Blockchain" }),
    );
    expect(pl).not.toContain("Powered by");
    const links = (html: string) =>
      Array.from(parse_fragment(html).querySelectorAll("a")).map((a) =>
        a.getAttribute("href"),
      );
    expect(links(pl)).toEqual(links(en));
  });

  it("canvas default site names follow the locale", () => {
    const base = structuredClone(defaultSettings);
    expect(resolveSiteName({ ...base, locale: "en" })).toBe("Hive Blog");
    expect(
      resolveSiteName({ ...base, locale: "en", hiveUsername: "alice" }),
    ).toBe("alice Blog");
    expect(
      resolveSiteName({ ...base, locale: "en" }, { community_title: "" }),
    ).toBe("Hive Community");
    expect(
      resolveSiteName({ ...base, locale: "pl" }, { community_title: "" }),
    ).toBe(t("pl", "site.default_community_name"));
  });

  it("default locale keeps the English UI texts and dates", () => {
    const locale = defaultSettings.locale;
    const expected: ReadonlyArray<readonly [I18nKey, string]> = [
      ["posts.none", "No posts"],
      ["posts.empty", "No posts found"],
      ["posts.load_more", "Load more posts"],
      ["posts.pinned", "Pinned"],
      ["pagination.first", "First page"],
      ["comments.none", "No comments"],
      ["comments.empty", "No comments found"],
      ["comments.load_more", "Load more comments"],
      ["threads.empty", "No threads found"],
      [
        "threads.empty_hint",
        'Create a post titled "My Threads" on your profile and write comments under it.',
      ],
    ];
    for (const [key, text] of expected) expect(t(locale, key)).toBe(text);

    const created = "2026-01-02T12:00:00";
    expect(
      format_date(locale, created, {
        year: "numeric",
        month: "numeric",
        day: "numeric",
      }),
    ).toBe(new Date(created).toLocaleDateString("en-US"));
  });
});

describe("post card date", () => {
  const NUMERIC = {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  } as const;

  it("formats the date with the site locale, same for SSR and canvas", () => {
    const layout = structuredClone(defaultSettings).postCardLayout;
    const base: PostCardSettings = {
      thumbnailSizePx: 96,
      cardPaddingPx: 24,
      cardBorderRadiusPx: 16,
      titleSizePx: 20,
      summaryMaxLength: 150,
      maxTags: 5,
      cardBorder: true,
      postCardLayout: layout,
    };
    for (const locale of ["en", "pl"] as const) {
      const html = renderPostCard(POST, { ...base, locale }, true);
      expect(html).toContain(format_date(locale, POST.publishedAt, NUMERIC));
    }
    expect(renderPostCard(POST, base, true)).toContain(
      POST.publishedAt.toLocaleDateString("en-US"),
    );
  });
});
