// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SIGNER_URL = "https://signer.example.com";
const NODE = "https://api.example.com";
const CHAIN_ID =
  "beeab0de00000000000000000000000000000000000000000000000000000000";

vi.mock("../../src/lib/config", () => ({
  get_hive_signer_url: () => SIGNER_URL,
  get_hive_chain_id: () => CHAIN_ID,
}));
vi.mock("../../src/lib/node-endpoint", () => ({
  get_current_endpoint: () => NODE,
}));

import { sign_comment, sign_vote } from "../../src/lib/signer-relay";

const fetch_mock = vi.fn();

function sent_payload(): Record<string, unknown> {
  const [url, init] = fetch_mock.mock.calls[0] as [string, RequestInit];
  expect(url).toBe(`${SIGNER_URL}/api/signing-request`);
  expect(init.method).toBe("POST");
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

beforeEach(() => {
  fetch_mock.mockReset();
  fetch_mock.mockResolvedValue(
    new Response(JSON.stringify({ error: "stop" }), { status: 500 }),
  );
  vi.stubGlobal("fetch", fetch_mock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("signer-relay operation contract (hive-signer expects [name, params] tuple)", () => {
  it("sign_vote sends a legacy vote tuple with unchanged content", async () => {
    const result = await sign_vote("alice", "bob", "my-post", -2500);

    expect(result.success).toBe(false);
    const payload = sent_payload();
    expect(payload.operation).toEqual([
      "vote",
      { voter: "alice", author: "bob", permlink: "my-post", weight: -2500 },
    ]);
    expect(payload).toMatchObject({
      username: "alice",
      key_type: "Posting",
      tx_type: "vote",
      query_keys: [],
      api_node: NODE,
      chain_id: CHAIN_ID,
    });
  });

  it("sign_comment sends a legacy comment tuple with unchanged content", async () => {
    const json_metadata = JSON.stringify({ tags: ["hive-123"], app: "test" });

    await sign_comment(
      "alice",
      "re-bob-my-post",
      "bob",
      "my-post",
      "",
      "Body **text**",
      json_metadata,
    );

    const payload = sent_payload();
    expect(payload.operation).toEqual([
      "comment",
      {
        author: "alice",
        permlink: "re-bob-my-post",
        parent_author: "bob",
        parent_permlink: "my-post",
        title: "",
        body: "Body **text**",
        json_metadata,
      },
    ]);
    expect(payload).toMatchObject({
      username: "alice",
      key_type: "Posting",
      tx_type: "comment",
    });
  });

  it("never sends wax-style object operations", async () => {
    await sign_vote("alice", "bob", "p", 10000);

    const operation = sent_payload().operation;
    expect(Array.isArray(operation)).toBe(true);
    expect((operation as unknown[]).length).toBe(2);
    expect(typeof (operation as unknown[])[0]).toBe("string");
  });
});
