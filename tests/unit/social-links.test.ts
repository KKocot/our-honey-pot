// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/components/admin/store", () => ({
  settings: {},
  updateSettingsImmediate: vi.fn(),
}));
// lucide-solid builds DOM templates at import time, which solid's server build rejects in node.
vi.mock("lucide-solid", () => ({
  Check: vi.fn(),
  Plus: vi.fn(),
  Trash2: vi.fn(),
}));
vi.mock("../../src/components/admin/hooks", () => ({
  createLocalInput: vi.fn(),
}));
vi.mock(
  "../../src/components/admin/settings/SocialLinksSettings/icons",
  () => ({
    CustomLinkIcon: vi.fn(),
    PlatformIcon: vi.fn(),
  }),
);

import {
  with_edited_username,
  with_stable_ids,
} from "../../src/components/admin/settings/SocialLinksSettings";
import type { SocialLink } from "../../src/components/admin/types/index";
import { build_social_url } from "../../src/components/admin/types/social";

const legacy = (platform: SocialLink["platform"], username: string) =>
  ({ platform, username }) as SocialLink;

describe("with_stable_ids", () => {
  it("returns the same ids for legacy links on every read", () => {
    const links = [legacy("x", "alice"), legacy("youtube", "bob")];
    const first = with_stable_ids(links).map((link) => link.id);
    const second = with_stable_ids(links).map((link) => link.id);
    expect(first).toEqual(second);
    expect(new Set(first).size).toBe(2);
  });

  it("keeps the id after an edit is persisted", () => {
    const [link] = with_stable_ids([legacy("x", "alice")]);
    const persisted = with_stable_ids([{ ...link, username: "carol" }]);
    expect(persisted[0].id).toBe(link.id);
  });

  it("leaves links that already have an id untouched", () => {
    const link: SocialLink = { id: "abc", platform: "x", username: "alice" };
    const [result] = with_stable_ids([link]);
    expect(result).toBe(link);
  });

  it("gives duplicate legacy platforms distinct ids", () => {
    const ids = with_stable_ids([legacy("x", "a"), legacy("x", "a")]).map(
      (link) => link.id,
    );
    expect(ids[0]).not.toBe(ids[1]);
  });
});

describe("with_edited_username", () => {
  it("drops the legacy url when a custom link is cleared", () => {
    const old: SocialLink = {
      id: "a",
      platform: "custom",
      username: "",
      url: "https://old.example.com",
    };
    const edited = with_edited_username(old, "");
    expect(edited).not.toHaveProperty("url");
    expect(build_social_url(edited)).toBe("");
  });

  it("renders the edited value instead of the legacy url", () => {
    const old: SocialLink = {
      id: "b",
      platform: "x",
      username: "",
      url: "https://x.com/alice",
    };
    const edited = with_edited_username(old, "carol");
    expect(edited).toEqual({ id: "b", platform: "x", username: "carol" });
    expect(build_social_url(edited)).toBe("https://x.com/carol");
  });

  it("keeps new-format links rendering the same", () => {
    const link: SocialLink = {
      id: "c",
      platform: "custom",
      username: "example.com",
    };
    const edited = with_edited_username(link, "example.com");
    expect(edited).toEqual(link);
    expect(build_social_url(edited)).toBe("https://example.com/");
  });
});
