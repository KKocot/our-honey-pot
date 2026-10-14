// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import {
  createWaxFoundation,
  type IWaxBaseInterface,
  type operation,
} from "@hiveio/wax";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const TAPOS_BLOCK_ID = "04c1c7a566fc0da66aee465714acee7346b48ac2";

const mocks = vi.hoisted(() => ({
  user: { username: "alice", privateKey: "unused" } as {
    username: string;
    privateKey: string;
  } | null,
  chain: null as unknown,
  sign: vi.fn(async () => undefined),
  broadcast: vi.fn(async () => undefined),
}));

vi.mock("../../src/components/auth/auth-store", () => ({
  currentUser: () => mocks.user,
}));
vi.mock("../../src/lib/transaction-signer", () => ({
  sign_transaction: mocks.sign,
}));
vi.mock("../../src/lib/broadcast-chain", () => ({
  get_broadcast_chain: async () => mocks.chain,
}));

import {
  broadcast_comment,
  broadcast_vote,
  build_comment_operation,
  build_vote_operation,
} from "../../src/lib/broadcast";
import {
  build_config_body,
  check_body_size,
  encode_config_json,
  parse_config_body,
} from "../../src/components/admin/hive-broadcast";
import { MAX_BODY_SIZE } from "../../src/components/admin/config-size";
import { get_default_settings } from "../../src/components/admin/types/settings";

let wax: IWaxBaseInterface;

function serialize(...ops: operation[]) {
  const tx = wax.createTransactionWithTaPoS(TAPOS_BLOCK_ID, "+1h");
  for (const op of ops) tx.pushOperation(op);
  tx.validate();
  return { tx, json: tx.toApiJson(), binary: tx.toBinaryForm() };
}

const root_post = {
  author: "alice",
  permlink: "hello-world",
  parent_author: "",
  parent_permlink: "hive-123456",
  title: "Hello",
  body: "Body",
  json_metadata: JSON.stringify({ tags: ["hive-123456"] }),
};

const reply = {
  author: "bob",
  permlink: "re-alice-1",
  parent_author: "alice",
  parent_permlink: "hello-world",
  title: "",
  body: "Nice post",
  json_metadata: "{}",
};

beforeAll(async () => {
  wax = await createWaxFoundation();
});

describe("build_vote_operation", () => {
  it.each([10000, 5000, 1, 0, -1, -10000])("serializes weight %i", (weight) => {
    const op = build_vote_operation("alice", "bob", "post", weight);
    expect(op).toEqual({
      vote_operation: {
        voter: "alice",
        author: "bob",
        permlink: "post",
        weight,
      },
    });
    const { json } = serialize(op);
    expect(json.operations[0]).toEqual({
      type: "vote_operation",
      value: { voter: "alice", author: "bob", permlink: "post", weight },
    });
  });

  it.each([10001, -10001, 50.5, Number.NaN])("rejects weight %s", (weight) => {
    expect(() => build_vote_operation("alice", "bob", "post", weight)).toThrow(
      RangeError,
    );
  });
});

describe("build_comment_operation", () => {
  it("serializes a root post", () => {
    const { json } = serialize(build_comment_operation(root_post));
    expect(json.operations[0]).toEqual({
      type: "comment_operation",
      value: root_post,
    });
  });

  it("serializes a reply", () => {
    const { json } = serialize(build_comment_operation(reply));
    expect(json.operations[0]).toEqual({
      type: "comment_operation",
      value: reply,
    });
  });
});

describe("broadcast_* flow", () => {
  beforeEach(() => {
    mocks.user = { username: "alice", privateKey: "unused" };
    mocks.sign.mockClear();
    mocks.broadcast.mockClear();
    mocks.chain = {
      createTransaction: async () =>
        wax.createTransactionWithTaPoS(TAPOS_BLOCK_ID, "+1h"),
      broadcast: mocks.broadcast,
    };
  });

  it("broadcasts a vote transaction", async () => {
    const result = await broadcast_vote("alice", "bob", "post", -10000);
    expect(result.success).toBe(true);
    expect(result.transaction_id).toMatch(/^[0-9a-f]{40}$/);
    expect(mocks.sign).toHaveBeenCalledOnce();
    expect(mocks.broadcast).toHaveBeenCalledOnce();
  });

  it("returns an error without broadcasting on out-of-range vote weight", async () => {
    const result = await broadcast_vote("alice", "bob", "post", 20000);
    expect(result.success).toBe(false);
    expect(mocks.broadcast).not.toHaveBeenCalled();
  });

  it("broadcasts a reply", async () => {
    const result = await broadcast_comment(
      reply.author,
      reply.permlink,
      reply.parent_author,
      reply.parent_permlink,
      reply.title,
      reply.body,
      reply.json_metadata,
    );
    expect(result.success).toBe(true);
    expect(mocks.broadcast).toHaveBeenCalledOnce();
  });

  it("refuses to broadcast when logged out", async () => {
    mocks.user = null;
    const result = await broadcast_vote("alice", "bob", "post", 100);
    expect(result.success).toBe(false);
    expect(mocks.broadcast).not.toHaveBeenCalled();
  });
});

describe("config body serialization", () => {
  const settings = {
    ...structuredClone(get_default_settings(false)),
    siteName: "Zażółć ``` `x`",
    siteDescription: "line 1\nline 2",
  };

  it("writes compact JSON that round-trips", () => {
    const json = encode_config_json(settings);
    expect(json).not.toContain("\n");
    expect(json).not.toContain("`");
    const body = build_config_body("alice", settings, "2026-10-14T00:00:00Z");
    expect(parse_config_body(body)).toEqual(
      JSON.parse(JSON.stringify(settings)),
    );
  });

  it("is smaller than the pretty encoding", () => {
    const pretty = JSON.stringify(settings, null, 2);
    expect(encode_config_json(settings).length).toBeLessThan(pretty.length);
  });

  it("still reads a pretty body written before compact JSON", () => {
    const pretty = JSON.stringify(settings, null, 2).replaceAll("`", "\\u0060");
    const body = `!hive-blog-appearance\n# Blog Configuration for @alice\n\nLast updated: t\n\n\`\`\`json\n${pretty}\n\`\`\``;
    expect(parse_config_body(body)).toEqual(
      JSON.parse(JSON.stringify(settings)),
    );
  });
});

describe("check_body_size", () => {
  it("accepts a body of exactly the limit", () => {
    expect(() => check_body_size("a".repeat(MAX_BODY_SIZE))).not.toThrow();
  });

  it("rejects one byte over the limit", () => {
    expect(() => check_body_size("a".repeat(MAX_BODY_SIZE + 1))).toThrow(
      /too large/,
    );
  });

  it("counts UTF-8 bytes, not characters", () => {
    const body = "ż".repeat(MAX_BODY_SIZE / 2) + "a";
    expect(body.length).toBeLessThan(MAX_BODY_SIZE);
    expect(() => check_body_size(body)).toThrow(/too large/);
  });
});
