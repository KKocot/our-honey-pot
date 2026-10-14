// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  process.env.HIVE_USERNAME = "alice";
  const chain = {
    api: { bridge: { get_post: vi.fn(), list_community_roles: vi.fn() } },
  };
  const tx = { id: "tx-1", pushOperation: vi.fn() };
  return { chain, tx, broadcast: vi.fn(), sign: vi.fn() };
});

vi.mock("@hiveio/workerbee/blog-logic", () => ({
  configureEndpoints: vi.fn(),
  getWax: vi.fn(async () => mocks.chain),
  withRetry: vi.fn((fn: (chain: unknown) => Promise<unknown>) =>
    fn(mocks.chain),
  ),
  DataProvider: vi.fn(),
}));
vi.mock("@hiveio/wax", () => ({
  BlogPostOperation: class {
    constructor(readonly data: Record<string, unknown>) {}
  },
  ReplyOperation: class {
    constructor(readonly data: Record<string, unknown>) {}
  },
}));
vi.mock("../../src/lib/broadcast-chain", () => ({
  get_broadcast_chain: vi.fn(async () => ({
    createTransaction: async () => mocks.tx,
    broadcast: mocks.broadcast,
  })),
}));
vi.mock("../../src/lib/transaction-signer", () => ({
  sign_transaction: mocks.sign,
}));

import {
  broadcastConfigToHive,
  build_config_body,
  parse_config_body,
} from "../../src/components/admin/hive-broadcast";
import { load_config_with_status } from "../../src/lib/config-pipeline";
import { extract_explicit_fields } from "../../src/lib/config-fields";
import { clear_config_account_cache } from "../../src/lib/config-account";
import {
  get_default_settings,
  type SettingsData,
} from "../../src/components/admin/types/settings";

const IMAGE = "https://images.hive.blog/DQm/logo.png";

function settings_with(overrides: Partial<SettingsData>): SettingsData {
  return { ...get_default_settings(false), ...overrides };
}

function stored_body(raw: Record<string, unknown>): string {
  return `!hive-blog-appearance\n\`\`\`json\n${JSON.stringify(raw)}\n\`\`\``;
}

function link(label: string, target: string) {
  return { label, kind: "url" as const, target };
}

beforeEach(() => {
  vi.clearAllMocks();
  clear_config_account_cache();
});

describe("reading global fields from chain", () => {
  it("drops unsafe URLs and images instead of failing the config", async () => {
    mocks.chain.api.bridge.get_post.mockResolvedValueOnce({
      body: stored_body({
        siteName: "Blog",
        brand: {
          mode: "logo",
          size: "huge",
          logo: { url: "data:image/png;base64,AAAA", alt: "Blog" },
        },
        seo: {
          og_image: { url: "http://images.hive.blog/a.png", alt: "x" },
          favicon: "blob:https://example.com/1",
          description: "Fine",
        },
        nav: {
          links: [
            link("Bad", "javascript:alert(1)"),
            link("Http", "http://example.com"),
            link("Good", "https://example.com"),
            link("Mail", "mailto:me@example.com"),
          ],
          cta: { label: "Go", url: "data:text/html,x" },
        },
        footer: { variant: "grid", privacy: link("Privacy", "ftp://x") },
      }),
    });

    const result = await load_config_with_status("alice", false);
    expect(result.status).toBe("found");
    const { brand, seo, nav, footer, siteName } = result.settings;
    expect(siteName).toBe("Blog");
    expect(brand).toEqual({ mode: "logo", size: "md" });
    expect(seo).toEqual({ description: "Fine" });
    expect(nav).toEqual({
      links: [
        link("Good", "https://example.com/"),
        link("Mail", "mailto:me@example.com"),
      ],
    });
    expect(footer).toEqual(get_default_settings(false).footer);
  });

  it("falls back to defaults for non-object values", async () => {
    mocks.chain.api.bridge.get_post.mockResolvedValueOnce({
      body: stored_body({ brand: "logo", topbar: [true], locale: "de" }),
    });
    const { settings } = await load_config_with_status("alice", false);
    const defaults = get_default_settings(false);
    expect(settings.brand).toEqual(defaults.brand);
    expect(settings.topbar).toEqual(defaults.topbar);
    expect(settings.locale).toBe("en");
  });

  it("keeps old configs without global fields on today's behaviour", async () => {
    mocks.chain.api.bridge.get_post.mockResolvedValueOnce({
      body: stored_body({ siteName: "Old" }),
    });
    const { settings } = await load_config_with_status("alice", false);
    const defaults = get_default_settings(false);
    for (const key of [
      "brand",
      "seo",
      "locale",
      "topbar",
      "nav",
      "footer",
    ] as const) {
      expect(settings[key]).toEqual(defaults[key]);
    }
    expect(settings.topbar.show_node_switcher).toBe(true);
    expect(settings.topbar.show_login).toBe(true);
  });

  it("never shares nested defaults between loaded blogs", async () => {
    mocks.chain.api.bridge.get_post.mockResolvedValue({
      body: stored_body({}),
    });
    const first = await load_config_with_status("alice", false);
    first.settings.nav.links.push(link("X", "https://x.com/"));
    first.settings.footer.columns.push({ title: "t", links: [] });
    clear_config_account_cache();
    const second = await load_config_with_status("alice", false);
    expect(second.settings.nav.links).toEqual([]);
    expect(second.settings.footer.columns).toEqual([]);
    mocks.chain.api.bridge.get_post.mockReset();
  });

  it("extract_explicit_fields keeps only present global keys (dev override path)", () => {
    const explicit = extract_explicit_fields({
      locale: "pl",
      topbar: { show_login: false },
      nav: "broken",
    });
    expect(explicit).toEqual({
      locale: "pl",
      topbar: { show_login: false, show_node_switcher: true },
    });
  });
});

describe("saving global fields", () => {
  function good_settings(): SettingsData {
    return settings_with({
      brand: {
        mode: "logo+text",
        size: "lg",
        logo: { url: IMAGE, alt: "Blog" },
      },
      nav: { links: [link("  About  ", "https://example.com/about")] },
    });
  }

  it("broadcasts normalized global fields", async () => {
    mocks.chain.api.bridge.get_post.mockResolvedValueOnce({
      body: build_config_body("alice", good_settings(), "t"),
    });
    const result = await broadcastConfigToHive(good_settings(), "alice", "k");
    expect(result.success).toBe(true);
    const [[reply]] = mocks.tx.pushOperation.mock.calls as [
      [{ data: { body: string } }],
    ];
    const saved = parse_config_body(reply.data.body);
    expect(saved.nav).toEqual({
      links: [link("About", "https://example.com/about")],
    });
    expect(saved.brand).toEqual(good_settings().brand);
  });

  it.each([
    [
      "data: logo",
      {
        brand: {
          mode: "logo",
          size: "md",
          logo: { url: "data:image/png;base64,AA", alt: "B" },
        },
      },
    ],
    [
      "blob: og image",
      { seo: { og_image: { url: "blob:https://example.com/1", alt: "B" } } },
    ],
    ["http: favicon", { seo: { favicon: "http://images.hive.blog/f.png" } }],
    ["foreign image host", { seo: { favicon: "https://evil.example/f.png" } }],
    [
      "logo without alt",
      { brand: { mode: "logo", size: "md", logo: { url: IMAGE, alt: "" } } },
    ],
  ])("rejects %s before anything is broadcast", async (_name, patch) => {
    const settings = settings_with(patch as Partial<SettingsData>);
    const result = await broadcastConfigToHive(settings, "alice", "k");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/invalid values/);
    expect(mocks.chain.api.bridge.get_post).not.toHaveBeenCalled();
    expect(mocks.tx.pushOperation).not.toHaveBeenCalled();
    expect(mocks.broadcast).not.toHaveBeenCalled();
  });

  it("rejects nav over the link limit", async () => {
    const links = Array.from({ length: 7 }, (_, i) =>
      link(`L${i}`, `https://example.com/${i}`),
    );
    const result = await broadcastConfigToHive(
      settings_with({ nav: { links } }),
      "alice",
      "k",
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain("nav.links");
    expect(mocks.broadcast).not.toHaveBeenCalled();
  });
});
