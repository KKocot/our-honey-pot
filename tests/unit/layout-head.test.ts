// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { describe, expect, it } from "vitest";
import { hive_image_proxy } from "../../src/lib/config";
import {
  FAVICON_PROXY_SIZE_PX,
  OG_IMAGE_PROXY_WIDTH_PX,
  resolve_head_meta,
  resolve_sidebar_width_px,
  type HeadMetaInput,
} from "../../src/lib/head-meta";

const FALLBACK_FAVICON = { href: "/favicon.svg", type: "image/svg+xml" };
const IMG = "https://images.hive.blog/DQm/og.jpg";

function input(overrides: Partial<HeadMetaInput> = {}): HeadMetaInput {
  return {
    settings: null,
    default_description: "alice Community",
    fallback_favicon: FALLBACK_FAVICON,
    ...overrides,
  };
}

describe("resolve_head_meta: defaults", () => {
  it("keeps today's behaviour without settings", () => {
    expect(resolve_head_meta(input())).toEqual({
      lang: "en",
      description: "alice Community",
      favicon: FALLBACK_FAVICON,
      og_image: null,
      show_login: true,
      show_node_switcher: true,
    });
  });

  it("keeps today's behaviour with empty global fields", () => {
    const meta = resolve_head_meta(
      input({ settings: { seo: {}, topbar: {} } }),
    );
    expect(meta.lang).toBe("en");
    expect(meta.favicon).toEqual(FALLBACK_FAVICON);
    expect(meta.show_login).toBe(true);
    expect(meta.show_node_switcher).toBe(true);
  });
});

describe("resolve_head_meta: locale", () => {
  it("uses settings.locale", () => {
    expect(resolve_head_meta(input({ settings: { locale: "pl" } })).lang).toBe(
      "pl",
    );
  });

  it.each(["de", "", "PL", '"><script>'])(
    "falls back to en for %j",
    (locale) => {
      expect(resolve_head_meta(input({ settings: { locale } })).lang).toBe(
        "en",
      );
    },
  );
});

describe("resolve_head_meta: description", () => {
  it("uses seo.description when set", () => {
    const meta = resolve_head_meta(
      input({ settings: { seo: { description: "My blog about bees" } } }),
    );
    expect(meta.description).toBe("My blog about bees");
  });

  it("explicit page description wins over seo.description", () => {
    const meta = resolve_head_meta(
      input({
        description: "Post summary",
        settings: { seo: { description: "Site" } },
      }),
    );
    expect(meta.description).toBe("Post summary");
  });

  it("ignores blank seo.description", () => {
    const meta = resolve_head_meta(
      input({ settings: { seo: { description: "   " } } }),
    );
    expect(meta.description).toBe("alice Community");
  });
});

describe("resolve_head_meta: favicon", () => {
  it("proxies seo.favicon and drops the guessed type", () => {
    const meta = resolve_head_meta(
      input({ settings: { seo: { favicon: IMG } } }),
    );
    expect(meta.favicon).toEqual({
      href: hive_image_proxy(IMG, FAVICON_PROXY_SIZE_PX, FAVICON_PROXY_SIZE_PX),
      type: null,
    });
    expect(meta.favicon.href).not.toBe(IMG);
  });

  it("falls back when the proxy rejects the URL", () => {
    const meta = resolve_head_meta(
      input({ settings: { seo: { favicon: "javascript:alert(1)" } } }),
    );
    expect(meta.favicon).toEqual(FALLBACK_FAVICON);
  });
});

describe("resolve_head_meta: og image", () => {
  it("uses seo.og_image through the proxy with alt", () => {
    const meta = resolve_head_meta(
      input({ settings: { seo: { og_image: { url: IMG, alt: "Bees" } } } }),
    );
    expect(meta.og_image).toEqual({
      url: hive_image_proxy(IMG, OG_IMAGE_PROXY_WIDTH_PX),
      alt: "Bees",
    });
  });

  it("omits alt for a decorative image", () => {
    const meta = resolve_head_meta(
      input({
        settings: {
          seo: { og_image: { url: IMG, alt: "", decorative: true } },
        },
      }),
    );
    expect(meta.og_image?.alt).toBeNull();
  });

  it("page image wins over seo.og_image", () => {
    const page = "https://images.ecency.com/post.png";
    const meta = resolve_head_meta(
      input({
        og_image: page,
        settings: { seo: { og_image: { url: IMG, alt: "Bees" } } },
      }),
    );
    expect(meta.og_image).toEqual({
      url: hive_image_proxy(page, OG_IMAGE_PROXY_WIDTH_PX),
      alt: null,
    });
  });

  it("returns null for an unusable URL", () => {
    const meta = resolve_head_meta(
      input({
        og_image: "data:image/png;base64,AAAA",
        settings: { seo: { og_image: { url: "ftp://x/y.png", alt: "x" } } },
      }),
    );
    expect(meta.og_image).toBeNull();
  });
});

describe("resolve_head_meta: topbar", () => {
  it("hides login and node switcher only on explicit false", () => {
    const meta = resolve_head_meta(
      input({
        settings: { topbar: { show_login: false, show_node_switcher: false } },
      }),
    );
    expect(meta.show_login).toBe(false);
    expect(meta.show_node_switcher).toBe(false);
  });

  it("keeps each flag independent", () => {
    const meta = resolve_head_meta(
      input({ settings: { topbar: { show_login: false } } }),
    );
    expect(meta.show_login).toBe(false);
    expect(meta.show_node_switcher).toBe(true);
  });
});

describe("resolve_sidebar_width_px", () => {
  it.each([
    [280, 280],
    [320.4, 320],
    [100, 200],
    [9000, 400],
    [Number.NaN, 280],
    [Number.POSITIVE_INFINITY, 280],
    ["300", 280],
    [undefined, 280],
  ])("%j -> %d", (raw, expected) => {
    expect(resolve_sidebar_width_px(raw)).toBe(expected);
  });
});
