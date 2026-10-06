// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  process.env.HIVE_USERNAME = "alice";
  const chain = {
    api: {
      bridge: {
        get_post: vi.fn(),
        list_community_roles: vi.fn(),
      },
    },
  };
  const tx = { id: "tx-1", pushOperation: vi.fn() };
  return {
    chain,
    tx,
    broadcast: vi.fn(),
    sign: vi.fn(),
  };
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
    readonly kind = "post";
    constructor(readonly data: Record<string, unknown>) {}
  },
  ReplyOperation: class {
    readonly kind = "reply";
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
  ConfigReadError,
  CONFIG_ANCHOR_PERMLINK,
  CONFIG_PERMLINK,
  encode_config_json,
  load_stored_config,
  parse_config_body,
  plan_config_write,
} from "../../src/components/admin/hive-broadcast";
import {
  load_and_prepare_config,
  load_config_with_status,
} from "../../src/lib/config-pipeline";
import { clear_config_account_cache } from "../../src/lib/config-account";
import {
  get_default_settings,
  type SettingsData,
} from "../../src/components/admin/types/settings";

function missing_error(author: string, permlink: string) {
  return Object.assign(new Error("Assert Exception"), {
    name: "WaxAssertionError",
    assertionData: JSON.stringify({
      extension: {
        assertion_expression: `Post ${author}/${permlink} does not exist`,
      },
    }),
  });
}

function settings_with(overrides: Partial<SettingsData>): SettingsData {
  return { ...structuredClone(get_default_settings(false)), ...overrides };
}

const tricky_title = "Title with ``` fence and `tick` and \\` and \\`\\`\\`";

beforeEach(() => {
  vi.clearAllMocks();
  clear_config_account_cache();
});

describe("config body encoding", () => {
  it("round-trips backticks and ``` inside values", () => {
    const settings = settings_with({
      siteName: tricky_title,
      siteDescription: "```json\n{}\n```",
    });
    const body = build_config_body(
      "alice",
      settings,
      "2026-10-06T00:00:00.000Z",
    );
    expect(encode_config_json(settings)).not.toContain("`");
    expect(parse_config_body(body)).toEqual(
      JSON.parse(JSON.stringify(settings)),
    );
  });

  it("reads the legacy \\`\\`\\` escaping", () => {
    const legacy_json = JSON.stringify(
      { siteName: "a ``` b" },
      null,
      2,
    ).replaceAll("```", "\\`\\`\\`");
    const body = `!hive-blog-appearance\n# Blog Configuration for @alice\n\n\`\`\`json\n${legacy_json}\n\`\`\``;
    expect(parse_config_body(body)).toEqual({ siteName: "a ``` b" });
  });

  it("tolerates CRLF line endings from manual edits", () => {
    const body =
      '!hive-blog-appearance\r\n```json\r\n{"siteName":"x"}\r\n```\r\n';
    expect(parse_config_body(body)).toEqual({ siteName: "x" });
  });

  it("rejects malformed JSON, missing block and non-object payloads as parse errors", () => {
    for (const body of [
      "```json\n{bad\n```",
      "no block here",
      "```json\n[1,2]\n```",
    ]) {
      expect(() => parse_config_body(body)).toThrow(ConfigReadError);
    }
  });
});

describe("load_stored_config", () => {
  it("returns found with only explicit fields", async () => {
    const body = build_config_body(
      "alice",
      settings_with({ siteName: tricky_title }),
      "t",
    );
    mocks.chain.api.bridge.get_post.mockResolvedValueOnce({ body });
    const result = await load_stored_config("alice");
    expect(mocks.chain.api.bridge.get_post).toHaveBeenCalledWith({
      author: "alice",
      permlink: CONFIG_PERMLINK,
    });
    expect(result.status).toBe("found");
    if (result.status === "found")
      expect(result.settings.siteName).toBe(tricky_title);
  });

  it("returns missing when the config post does not exist", async () => {
    mocks.chain.api.bridge.get_post.mockRejectedValueOnce(
      missing_error("alice", CONFIG_PERMLINK),
    );
    await expect(load_stored_config("alice")).resolves.toMatchObject({
      status: "missing",
    });
  });

  it("throws on network errors instead of reporting missing (K3)", async () => {
    mocks.chain.api.bridge.get_post.mockRejectedValueOnce(
      new Error("fetch failed"),
    );
    await expect(load_stored_config("alice")).rejects.toMatchObject({
      code: "network",
    });
  });

  it("throws instead of reporting missing when the node returns no body", async () => {
    for (const response of [null, { body: 42 }]) {
      mocks.chain.api.bridge.get_post.mockResolvedValueOnce(response);
      await expect(load_stored_config("alice")).rejects.toMatchObject({
        code: "network",
      });
    }
  });

  it("throws a parse error for a corrupted body", async () => {
    mocks.chain.api.bridge.get_post.mockResolvedValueOnce({
      body: "```json\n{oops\n```",
    });
    await expect(load_stored_config("alice")).rejects.toMatchObject({
      code: "parse",
    });
  });
});

describe("config pipeline status", () => {
  it("reports error with defaults and load_and_prepare_config rethrows", async () => {
    mocks.chain.api.bridge.get_post.mockRejectedValue(
      new Error("socket hang up"),
    );
    const result = await load_config_with_status("alice", false);
    expect(result.status).toBe("error");
    await expect(load_and_prepare_config("alice", false)).rejects.toThrow(
      "socket hang up",
    );
    mocks.chain.api.bridge.get_post.mockReset();
  });

  it("does not mutate or share nested objects with module defaults", async () => {
    const before_user = structuredClone(get_default_settings(false));
    const before_community = structuredClone(get_default_settings(true));

    mocks.chain.api.bridge.get_post.mockResolvedValueOnce({
      body: build_config_body(
        "alice",
        settings_with({ siteName: "Mine", layoutSections: [] }),
        "t",
      ),
    });
    const found = await load_and_prepare_config("alice", false);
    mocks.chain.api.bridge.get_post.mockRejectedValueOnce(
      missing_error("alice", CONFIG_PERMLINK),
    );
    const missing = await load_and_prepare_config("alice", false);

    for (const result of [found, missing]) {
      result.layoutSections.push({} as never);
      result.postCardLayout.sections.length = 0;
      result.pageLayout.sections.length = 0;
      (result.customColors as Record<string, unknown> | null) = null;
    }

    expect(get_default_settings(false)).toEqual(before_user);
    expect(get_default_settings(true)).toEqual(before_community);
  });
});

describe("config write", () => {
  const settings = settings_with({ siteName: "Blog" });

  it("first save creates the anchor and the reply", () => {
    const plan = plan_config_write(
      "alice",
      settings,
      { config_exists: false, anchor_exists: false },
      "t",
    );
    expect(plan.is_update).toBe(false);
    expect(plan.anchor).toMatchObject({
      parent_author: "",
      author: "alice",
      permlink: CONFIG_ANCHOR_PERMLINK,
    });
    expect(plan.reply).toMatchObject({
      parent_author: "alice",
      parent_permlink: CONFIG_ANCHOR_PERMLINK,
      author: "alice",
      permlink: CONFIG_PERMLINK,
    });
  });

  it("later saves edit only the reply", () => {
    const plan = plan_config_write(
      "alice",
      settings,
      { config_exists: true, anchor_exists: true },
      "t",
    );
    expect(plan.anchor).toBeNull();
    expect(plan.is_update).toBe(true);
    expect(plan.reply.permlink).toBe(CONFIG_PERMLINK);
  });

  it("broadcasts anchor + reply in one transaction on the first save", async () => {
    mocks.chain.api.bridge.get_post
      .mockRejectedValueOnce(missing_error("alice", CONFIG_PERMLINK))
      .mockRejectedValueOnce(missing_error("alice", CONFIG_ANCHOR_PERMLINK));
    const result = await broadcastConfigToHive(settings, "alice", "key");
    expect(result).toMatchObject({
      success: true,
      permlink: CONFIG_PERMLINK,
      isUpdate: false,
    });
    const kinds = mocks.tx.pushOperation.mock.calls.map(
      ([op]) => (op as { kind: string }).kind,
    );
    expect(kinds).toEqual(["post", "reply"]);
    expect(mocks.broadcast).toHaveBeenCalledTimes(1);
  });

  it("broadcasts only the reply when the config exists", async () => {
    mocks.chain.api.bridge.get_post.mockResolvedValueOnce({
      body: build_config_body("alice", settings, "t"),
    });
    const result = await broadcastConfigToHive(settings, "alice", "key");
    expect(result).toMatchObject({ success: true, isUpdate: true });
    expect(mocks.tx.pushOperation).toHaveBeenCalledTimes(1);
  });

  it("refuses to save from an account other than the config account", async () => {
    const result = await broadcastConfigToHive(settings, "mallory", "key");
    expect(result.success).toBe(false);
    expect(mocks.broadcast).not.toHaveBeenCalled();
  });

  it("aborts the save when the existence check fails on the network", async () => {
    mocks.chain.api.bridge.get_post.mockRejectedValueOnce(new Error("timeout"));
    const result = await broadcastConfigToHive(settings, "alice", "key");
    expect(result.success).toBe(false);
    expect(mocks.broadcast).not.toHaveBeenCalled();
  });
});
