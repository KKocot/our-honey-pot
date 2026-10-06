// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { describe, expect, it } from "vitest";
import { renderPostCard } from "../../src/shared/components/post-card/render";
import type {
  PostCardData,
  PostCardSettings,
} from "../../src/shared/components/post-card/types";
import {
  renderAuthorProfileCard,
  renderSocialLinks,
} from "../../src/shared/components/author-profile/render";
import type {
  AuthorProfileData,
  AuthorProfileSettings,
} from "../../src/shared/components/author-profile/types";
import {
  renderNavigation,
  renderNavigationButtons,
  renderNavigationItem,
} from "../../src/shared/components/navigation/render";
import {
  expect_no_script_vectors,
  hrefs_of,
  parse_fragment,
} from "./helpers/html-assert";

const BREAKOUT = `"><img src=x onerror=alert(1)>'\`<script>alert(1)</script>`;
const ATTR_BREAKOUT = `x" onmouseover="alert(1)" data-x="`;
const POST_CARD_HANDLERS = { onerror: "this.style.display='none'" };

const ALL_CARD_ELEMENTS = [
  "thumbnail",
  "avatar",
  "title",
  "summary",
  "date",
  "votes",
  "comments",
  "payout",
  "tags",
];

function card_settings(
  overrides: Record<string, unknown> = {},
): PostCardSettings {
  return {
    postCardLayout: {
      sections: [
        {
          id: "s1",
          orientation: "horizontal",
          children: ALL_CARD_ELEMENTS.map((id) => ({ type: "element", id })),
        },
      ],
    },
    thumbnailSizePx: 96,
    titleSizePx: 20,
    summaryMaxLength: 150,
    maxTags: 5,
    cardBorder: true,
    cardHoverEffect: "shadow",
    cardHoverShadow: "md",
    ...overrides,
  } as unknown as PostCardSettings;
}

function card_data(
  overrides: Partial<Record<keyof PostCardData, unknown>> = {},
): PostCardData {
  return {
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
    ...overrides,
  } as unknown as PostCardData;
}

describe("renderPostCard — attribute breaking", () => {
  it.each([
    ["quote breakout", `https://images.hive.blog/x.png"onerror="alert(1)`],
    [
      "tag breakout",
      `https://images.hive.blog/x.png"><script>alert(1)</script>`,
    ],
    ["javascript:", "javascript:alert(1)"],
    ["data:", "data:image/svg+xml,<svg onload=alert(1)>"],
    ["protocol-relative", "//evil.com/x.png"],
    ["non-string", { toString: (): string => "javascript:alert(1)" }],
  ])("thumbnail: %s", (_name, thumbnail) => {
    const html = renderPostCard(card_data({ thumbnail }), card_settings());
    expect_no_script_vectors(html, POST_CARD_HANDLERS);
    for (const img of Array.from(
      parse_fragment(html).querySelectorAll("img"),
    )) {
      expect(img.getAttribute("src") ?? "").toMatch(/^https:\/\//);
    }
  });

  it("vertical thumbnail with quote breakout", () => {
    const html = renderPostCard(
      card_data({ thumbnail: `https://a.example/x.png' onload='alert(1)` }),
      card_settings(),
      true,
    );
    expect_no_script_vectors(html, POST_CARD_HANDLERS);
  });

  it("text fields and tags are escaped", () => {
    const html = renderPostCard(
      card_data({
        title: BREAKOUT,
        body: BREAKOUT,
        author: BREAKOUT,
        tags: [BREAKOUT, ATTR_BREAKOUT],
      }),
      card_settings(),
    );
    expect_no_script_vectors(html, POST_CARD_HANDLERS);
    expect(parse_fragment(html).querySelector("h3")?.textContent).toBe(
      BREAKOUT,
    );
  });

  it("settings cannot inject attributes (data-shadow, style, numbers)", () => {
    const html = renderPostCard(
      card_data(),
      card_settings({
        cardHoverShadow: ATTR_BREAKOUT,
        cardHoverEffect: ATTR_BREAKOUT,
        thumbnailSizePx: `1px" onmouseover="alert(1)`,
        cardPaddingPx: `1px" onmouseover="alert(1)`,
      }),
    );
    expect_no_script_vectors(html, POST_CARD_HANDLERS);
  });

  it("data-shadow is restricted to known shadows (S16)", () => {
    const html = renderPostCard(
      card_data(),
      card_settings({ cardHoverShadow: `md" onfocus="alert(1)` }),
    );
    const article = parse_fragment(html).querySelector("article");
    expect(["sm", "md", "lg", "xl", "2xl"]).toContain(
      article?.getAttribute("data-shadow"),
    );
  });

  it.each([
    ["javascript:alert(1)"],
    ["//evil.com"],
    ["/\\evil.com"],
    ["data:text/html,x"],
  ])("card link href %s falls back to permlink", (link) => {
    const html = renderPostCard(card_data(), card_settings(), false, link);
    expect(hrefs_of(html)).toEqual(["/my-post"]);
  });

  it("permlink is URL-encoded in fallback href", () => {
    const html = renderPostCard(
      card_data({ permlink: `x" onclick="alert(1)` }),
      card_settings(),
    );
    expect_no_script_vectors(html, POST_CARD_HANDLERS);
    expect(hrefs_of(html)[0]).toMatch(/^\/[^"<>\s]+$/);
  });
});

const PROFILE_ELEMENTS = [
  "coverImage",
  "avatar",
  "username",
  "displayName",
  "reputation",
  "about",
  "location",
  "website",
  "joinDate",
  "followers",
  "following",
  "postCount",
  "hivePower",
  "votingPower",
  "hiveBalance",
  "hbdBalance",
];

function profile_settings(socialLinks: unknown = []): AuthorProfileSettings {
  return {
    layout: {
      sections: [
        {
          id: "p1",
          orientation: "vertical",
          children: PROFILE_ELEMENTS.map((id) => ({ type: "element", id })),
        },
      ],
    },
    socialLinks,
  } as unknown as AuthorProfileSettings;
}

function profile_data(
  overrides: Partial<Record<keyof AuthorProfileData, unknown>> = {},
): AuthorProfileData {
  return {
    username: "alice",
    displayName: "Alice",
    about: "About",
    location: "Earth",
    website: "https://alice.example",
    joinDate: "2020",
    avatarUrl: "https://images.hive.blog/u/alice/avatar",
    coverImage: "https://images.hive.blog/cover.png",
    reputation: 50,
    followers: 1,
    following: 1,
    postCount: 1,
    hivePower: 1,
    votingPower: 1,
    hiveBalance: 1,
    hbdBalance: 1,
    ...overrides,
  } as unknown as AuthorProfileData;
}

describe("renderAuthorProfileCard — profile fields", () => {
  it("text fields are escaped", () => {
    const html = renderAuthorProfileCard(
      profile_data({
        username: BREAKOUT,
        displayName: BREAKOUT,
        about: BREAKOUT,
        location: BREAKOUT,
        joinDate: BREAKOUT,
        website: BREAKOUT,
      }),
      profile_settings(),
    );
    expect_no_script_vectors(html);
    expect(parse_fragment(html).querySelector("h2")?.textContent).toBe(
      BREAKOUT,
    );
  });

  it.each([
    ["javascript:", "javascript:alert(1)"],
    ["quote breakout", `https://a.example/"onclick="alert(1)`],
    ["data:", "data:text/html,<script>alert(1)</script>"],
  ])("website %s", (_name, website) => {
    const html = renderAuthorProfileCard(
      profile_data({ website }),
      profile_settings(),
    );
    expect_no_script_vectors(html);
    for (const href of hrefs_of(html)) expect(href).toMatch(/^https?:\/\//);
  });

  it.each([
    ["quote breakout", `https://a.example/x.png"onerror="alert(1)`],
    ["javascript:", "javascript:alert(1)"],
    ["data:", "data:image/svg+xml,<svg onload=alert(1)>"],
  ])("avatar %s", (_name, avatarUrl) => {
    const html = renderAuthorProfileCard(
      profile_data({ avatarUrl }),
      profile_settings(),
    );
    expect_no_script_vectors(html);
    for (const img of Array.from(
      parse_fragment(html).querySelectorAll("img"),
    )) {
      expect(img.getAttribute("src") ?? "").toMatch(/^https:\/\//);
    }
  });

  it.each([
    [
      "css url() breakout",
      `https://a.example/x.png'); background: url('javascript:alert(1)`,
    ],
    ["attribute breakout", `https://a.example/x.png" onmouseover="alert(1)`],
    ["javascript:", "javascript:alert(1)"],
  ])("cover image %s", (_name, coverImage) => {
    const html = renderAuthorProfileCard(
      profile_data({ coverImage }),
      profile_settings(),
    );
    expect_no_script_vectors(html);
    for (const el of Array.from(
      parse_fragment(html).querySelectorAll("[style]"),
    )) {
      const style = el.getAttribute("style") ?? "";
      expect((style.match(/url\(/g) ?? []).length).toBeLessThanOrEqual(1);
    }
  });
});

describe("renderSocialLinks", () => {
  it.each([
    [
      "custom javascript:",
      { id: "1", platform: "custom", username: "javascript:alert(1)" },
    ],
    [
      "custom data:",
      { id: "1", platform: "custom", username: "data:text/html,x" },
    ],
    [
      "legacy url javascript:",
      {
        id: "1",
        platform: "twitter",
        username: "",
        url: "javascript:alert(1)",
      },
    ],
    [
      "custom quote breakout",
      {
        id: "1",
        platform: "custom",
        username: `https://a.example/"onclick="alert(1)`,
      },
    ],
    ["handle breakout", { id: "1", platform: "twitter", username: BREAKOUT }],
    [
      "unknown platform",
      { id: "1", platform: `x" onclick="alert(1)`, username: "a" },
    ],
    [
      "non-string username",
      {
        id: "1",
        platform: "custom",
        username: { toString: (): string => "javascript:alert(1)" },
      },
    ],
  ])("%s", (_name, link) => {
    const html = renderSocialLinks([
      link,
    ] as unknown as AuthorProfileSettings["socialLinks"]);
    expect_no_script_vectors(html);
    for (const href of hrefs_of(html)) expect(href).toMatch(/^https:\/\//);
    for (const el of Array.from(
      parse_fragment(html).querySelectorAll("[data-custom-link]"),
    )) {
      expect(el.getAttribute("data-custom-link")).toMatch(/^https:\/\//);
    }
  });

  it("non-array socialLinks renders nothing", () => {
    expect(
      renderSocialLinks("x" as unknown as AuthorProfileSettings["socialLinks"]),
    ).toBe("");
  });

  it("socialLinks inside the full card are validated", () => {
    const html = renderAuthorProfileCard(
      profile_data(),
      profile_settings([
        { id: "1", platform: "custom", username: "javascript:alert(1)" },
      ]),
    );
    expect_no_script_vectors(html);
  });
});

describe("navigation renderers", () => {
  it.each([
    ["javascript:alert(1)"],
    [" javascript:alert(1)"],
    ["data:text/html,x"],
    ["//evil.com"],
    ["/\\evil.com"],
  ])("item href %s is replaced", (href) => {
    const html = renderNavigationItem(
      { id: "x", label: "X", href, disabled: false },
      false,
    );
    expect(hrefs_of(html)).toEqual(["#"]);
  });

  it("safe relative href is kept", () => {
    const html = renderNavigationItem(
      { id: "x", label: "X", href: "/?tab=x", disabled: false },
      false,
    );
    expect(hrefs_of(html)).toEqual(["/?tab=x"]);
  });

  it("tab id, label and tooltip are escaped", () => {
    const tabs = [
      {
        id: ATTR_BREAKOUT,
        label: BREAKOUT,
        enabled: true,
        showCount: false,
        tooltip: ATTR_BREAKOUT,
      },
    ];
    const settings = { tabs, activeTab: "", postsCount: 0, commentsCount: 0 };
    for (const html of [
      renderNavigation(settings),
      renderNavigationButtons(settings),
    ]) {
      expect_no_script_vectors(html);
      const tab = parse_fragment(html).querySelector("[data-tab]");
      expect(tab?.getAttribute("data-tab")).toBe(ATTR_BREAKOUT);
    }
    const disabled = renderNavigationItem(
      {
        id: ATTR_BREAKOUT,
        label: BREAKOUT,
        href: "/",
        disabled: true,
        tooltip: ATTR_BREAKOUT,
      },
      false,
    );
    expect_no_script_vectors(disabled);
  });
});
