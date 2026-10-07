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
