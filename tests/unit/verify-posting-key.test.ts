// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createWaxFoundation, type IWaxBaseInterface } from "@hiveio/wax";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type Role = "owner" | "active" | "posting" | "memo";

const mocks = vi.hoisted(() => ({
  find_accounts: vi.fn(),
  calculate_public_key: vi.fn(),
  chain_error: null as Error | null,
}));

vi.mock("../../src/lib/broadcast-chain", () => ({
  get_broadcast_chain: async () => {
    if (mocks.chain_error) throw mocks.chain_error;
    return {
      calculatePublicKey: mocks.calculate_public_key,
      api: { database_api: { find_accounts: mocks.find_accounts } },
    };
  },
}));

import { verify_posting_key } from "../../src/lib/verify-posting-key";

let wax: IWaxBaseInterface;
const keys = {} as Record<Role, { wif: string; public_key: string }>;

function account_fixture() {
  const auth = (role: Role) => ({
    weight_threshold: 1,
    account_auths: [],
    key_auths: [[keys[role].public_key, 1]],
  });
  return {
    name: "alice",
    owner: auth("owner"),
    active: auth("active"),
    posting: auth("posting"),
    memo_key: keys.memo.public_key,
  };
}

beforeAll(async () => {
  wax = await createWaxFoundation();
  for (const role of ["owner", "active", "posting", "memo"] as const) {
    const data = wax.getPrivateKeyFromPassword("alice", role, "test-password");
    keys[role] = {
      wif: data.wifPrivateKey,
      public_key: data.associatedPublicKey,
    };
  }
});

beforeEach(() => {
  mocks.chain_error = null;
  mocks.calculate_public_key.mockReset();
  mocks.calculate_public_key.mockImplementation((wif: string) =>
    wax.calculatePublicKey(wif),
  );
  mocks.find_accounts.mockReset();
  mocks.find_accounts.mockResolvedValue({ accounts: [account_fixture()] });
});

describe("verify_posting_key", () => {
  it("accepts the posting key and returns normalized credentials", async () => {
    const result = await verify_posting_key(
      "  Alice ",
      `  ${keys.posting.wif}\n`,
    );

    expect(result).toEqual({
      ok: true,
      username: "alice",
      wif: keys.posting.wif,
    });
    expect(mocks.find_accounts).toHaveBeenCalledWith({ accounts: ["alice"] });
  });

  it("matches keys regardless of the address prefix (testnet/mirrornet)", async () => {
    const account = account_fixture();
    account.posting.key_auths = [[`TST${keys.posting.public_key.slice(3)}`, 1]];
    mocks.find_accounts.mockResolvedValue({ accounts: [account] });

    const result = await verify_posting_key("alice", keys.posting.wif);

    expect(result.ok).toBe(true);
  });

  it.each(["owner", "active", "memo"] as const)(
    "rejects the %s key",
    async (role) => {
      const result = await verify_posting_key("alice", keys[role].wif);

      expect(result).toEqual({
        ok: false,
        reason: "wrong_role",
        message: `This is the ${role} key of @alice. Only the posting key is accepted here.`,
      });
    },
  );

  it("rejects a valid key that belongs to no authority of the account", async () => {
    const stranger = wax.getPrivateKeyFromPassword("bob", "posting", "other");

    const result = await verify_posting_key("alice", stranger.wifPrivateKey);

    expect(result).toMatchObject({ ok: false, reason: "not_posting_key" });
  });

  it("rejects a WIF with a bad format without hitting the network", async () => {
    const result = await verify_posting_key("alice", "not-a-wif");

    expect(result).toMatchObject({ ok: false, reason: "invalid_wif" });
    expect(mocks.find_accounts).not.toHaveBeenCalled();
  });

  it("rejects a well-formed but undecodable WIF", async () => {
    const corrupted = `5${"1".repeat(50)}`;

    const result = await verify_posting_key("alice", corrupted);

    expect(result).toEqual({
      ok: false,
      reason: "invalid_wif",
      message: "Invalid private key.",
    });
    expect(mocks.find_accounts).not.toHaveBeenCalled();
  });

  it("reports a missing account", async () => {
    mocks.find_accounts.mockResolvedValue({ accounts: [] });

    const result = await verify_posting_key("ghost", keys.posting.wif);

    expect(result).toEqual({
      ok: false,
      reason: "account_not_found",
      message: "Account @ghost not found.",
    });
  });

  it.each([
    ["", ""],
    ["alice", "   "],
    ["  ", "5abc"],
  ])("rejects empty fields (%j, %j)", async (username, wif) => {
    const result = await verify_posting_key(username, wif);

    expect(result).toMatchObject({ ok: false, reason: "empty" });
  });

  it("rejects an invalid username format", async () => {
    const result = await verify_posting_key("a_b", keys.posting.wif);

    expect(result).toMatchObject({ ok: false, reason: "invalid_username" });
  });

  it("maps a find_accounts failure to a network error", async () => {
    mocks.find_accounts.mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await verify_posting_key("alice", keys.posting.wif);

    expect(result).toMatchObject({ ok: false, reason: "network" });
  });

  it("maps a chain initialization failure to a network error", async () => {
    mocks.chain_error = new Error("node unreachable");

    const result = await verify_posting_key("alice", keys.posting.wif);

    expect(result).toMatchObject({ ok: false, reason: "network" });
  });
});
