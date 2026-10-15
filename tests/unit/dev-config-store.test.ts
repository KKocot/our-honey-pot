// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import type { APIContext } from "astro";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ load_stored_config: vi.fn() }));

vi.mock("../../src/components/admin/hive-broadcast", () => ({
  load_stored_config: mocks.load_stored_config,
}));

import {
  DEV_CONFIG_MAX_BLOGS,
  DEV_CONFIG_MAX_BYTES,
  delete_dev_config,
  dev_config_hash,
  get_dev_config,
  plan_dev_config_sync,
  release_dev_config_on_server,
  release_failure_message,
  server_only_notice,
  fetch_dev_config_info,
  set_dev_config,
  type DevConfigEntry,
} from "../../src/lib/dev-config-store";
import { load_config_with_status } from "../../src/lib/config-pipeline";
import { DELETE, GET, POST, prerender } from "../../src/pages/dev_mode/config";

function entry(
  overrides: Partial<DevConfigEntry["settings"]> = {},
): DevConfigEntry {
  return {
    account: "alice",
    saved_at: "2026-10-09T10:00:00.000Z",
    settings: { siteName: "Local blog", ...overrides },
  };
}

function call(
  handler: typeof GET,
  init: {
    url: string;
    method?: string;
    body?: string;
    headers?: Record<string, string>;
  },
): Promise<Response> {
  const request = new Request(init.url, {
    method: init.method ?? "GET",
    body: init.body,
    headers: init.headers,
  });
  return Promise.resolve(handler({ request } as APIContext));
}

const ORIGIN = "http://localhost:4327";
const ENDPOINT = `${ORIGIN}/dev_mode/config`;

function json_post(body: unknown, headers: Record<string, string> = {}) {
  return call(POST, {
    url: ENDPOINT,
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", ...headers },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.__ohp_dev_config_store?.clear();
});

describe("dev config store", () => {
  it("returns a clone, so mutating the result does not change the store", () => {
    expect(set_dev_config("alice", entry(), ORIGIN).ok).toBe(true);
    const first = get_dev_config("alice");
    if (!first) throw new Error("expected an entry");
    first.config.settings.siteName = "mutated";
    expect(get_dev_config("alice")?.config.settings.siteName).toBe(
      "Local blog",
    );
  });

  it("does not keep a reference to the stored input", () => {
    const input = entry();
    set_dev_config("alice", input, ORIGIN);
    input.settings.siteName = "mutated";
    expect(get_dev_config("alice")?.config.settings.siteName).toBe(
      "Local blog",
    );
  });

  it("keeps blogs isolated and normalizes the blog name", () => {
    set_dev_config("Alice ", entry({ siteName: "A" }), ORIGIN);
    set_dev_config(
      "bob",
      { ...entry({ siteName: "B" }), account: "bob" },
      ORIGIN,
    );
    expect(get_dev_config("alice")?.config.settings.siteName).toBe("A");
    expect(get_dev_config("bob")?.config.settings.siteName).toBe("B");
    expect(delete_dev_config("alice", "http://127.0.0.1:4327")).toBe("foreign");
    expect(delete_dev_config("alice", ORIGIN)).toBe("deleted");
    expect(get_dev_config("alice")).toBeNull();
    expect(get_dev_config("bob")).not.toBeNull();
  });

  it("drops malformed fields like the chain read and keeps the valid ones", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = set_dev_config(
      "alice",
      {
        ...entry({ siteName: "Valid" }),
        settings: {
          siteName: "Valid",
          customColors: "not a palette",
          headingScale: { evil: true },
          unknownKey: 1,
        },
      },
      ORIGIN,
    );
    expect(result.ok).toBe(true);
    expect(get_dev_config("alice")?.config.settings).toEqual({
      siteName: "Valid",
    });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it(`keeps at most ${DEV_CONFIG_MAX_BLOGS} blogs and drops the oldest`, () => {
    const blogs = Array.from(
      { length: DEV_CONFIG_MAX_BLOGS + 1 },
      (_, index) => `blog${index}`,
    );
    for (const blog of blogs) {
      expect(set_dev_config(blog, entry(), ORIGIN).ok).toBe(true);
    }
    expect(globalThis.__ohp_dev_config_store?.size).toBe(DEV_CONFIG_MAX_BLOGS);
    expect(get_dev_config(blogs[0])).toBeNull();
    expect(get_dev_config(blogs[DEV_CONFIG_MAX_BLOGS])).not.toBeNull();
  });

  it("refreshes the age of a re-stored blog", () => {
    for (let index = 0; index < DEV_CONFIG_MAX_BLOGS; index++) {
      set_dev_config(`blog${index}`, entry(), ORIGIN);
    }
    set_dev_config("blog0", entry({ siteName: "again" }), ORIGIN);
    set_dev_config("alice", entry(), ORIGIN);
    expect(get_dev_config("blog0")).not.toBeNull();
    expect(get_dev_config("blog1")).toBeNull();
  });

  it("rejects a config over 64 KiB", () => {
    const result = set_dev_config(
      "alice",
      entry({ siteDescription: "x".repeat(DEV_CONFIG_MAX_BYTES) }),
      ORIGIN,
    );
    expect(result).toEqual({ ok: false, reason: "size" });
    expect(get_dev_config("alice")).toBeNull();
  });

  it("rejects an invalid blog name and a malformed config", () => {
    expect(set_dev_config("../etc", entry(), ORIGIN)).toEqual({
      ok: false,
      reason: "blog",
    });
    expect(
      set_dev_config(
        "alice",
        {
          account: "alice",
          saved_at: "x",
          settings: [],
        },
        ORIGIN,
      ),
    ).toEqual({
      ok: false,
      reason: "shape",
    });
    expect(
      set_dev_config("alice", { ...entry(), account: "Not Valid" }, ORIGIN),
    ).toEqual({
      ok: false,
      reason: "shape",
    });
    expect(get_dev_config("alice")).toBeNull();
  });

  it("hashes the same config identically on both sides", () => {
    const local = { blog: "alice", ...entry() };
    const result = set_dev_config(
      "alice",
      JSON.parse(JSON.stringify(entry())),
      ORIGIN,
    );
    expect(result).toEqual({ ok: true, hash: dev_config_hash(local) });
    expect(dev_config_hash(entry({ siteName: "other" }))).not.toBe(
      dev_config_hash(local),
    );
  });
});

describe("load_config_with_status with a dev config", () => {
  it("prepares the dev config without reading the chain", async () => {
    set_dev_config(
      "hive-123456",
      {
        ...entry({ siteName: "Dev community" }),
        account: "bob",
      },
      ORIGIN,
    );
    const result = await load_config_with_status("hive-123456", true);

    expect(mocks.load_stored_config).not.toHaveBeenCalled();
    expect(result.status).toBe("found");
    if (result.status === "error") throw result.error;
    expect(result.config_account).toBe("bob");
    expect(result.settings.siteName).toBe("Dev community");
    expect(result.settings.hiveUsername).toBe("hive-123456");
    expect(result.settings.layoutSections.length).toBeGreaterThan(0);
  });

  it("reads the chain when the store has no entry for the blog", async () => {
    set_dev_config("bob", { ...entry(), account: "bob" }, ORIGIN);
    mocks.load_stored_config.mockResolvedValue({
      status: "found",
      account: { blog: "alice", account: "alice", source: "personal" },
      permlink: "blog-config",
      settings: { siteName: "Chain blog" },
    });
    const result = await load_config_with_status("alice", false);

    expect(mocks.load_stored_config).toHaveBeenCalledWith("alice");
    expect(result.status).toBe("found");
    if (result.status === "error") throw result.error;
    expect(result.settings.siteName).toBe("Chain blog");
  });
});

describe("/dev_mode/config endpoint", () => {
  it("is rendered on demand", () => {
    expect(prerender).toBe(false);
  });

  it("refuses non-loopback hosts and foreign origins", async () => {
    const lan = await call(GET, {
      url: "http://192.168.1.5:4327/dev_mode/config?blog=alice",
    });
    expect(lan.status).toBe(403);
    const foreign = await call(POST, {
      url: ENDPOINT,
      method: "POST",
      body: JSON.stringify({ blog: "alice", config: entry() }),
      headers: {
        "content-type": "application/json",
        origin: "https://evil.example",
      },
    });
    expect(foreign.status).toBe(403);
    const other_port = await json_post(
      { blog: "alice", config: entry() },
      { origin: "http://localhost:5173" },
    );
    expect(other_port.status).toBe(403);
    const other_host = await json_post(
      { blog: "alice", config: entry() },
      { origin: "http://127.0.0.1:4327" },
    );
    expect(other_host.status).toBe(403);
    const removed = await call(DELETE, {
      url: `${ENDPOINT}?blog=alice`,
      method: "DELETE",
      headers: { origin: "http://localhost:5173" },
    });
    expect(removed.status).toBe(403);
    expect(get_dev_config("alice")).toBeNull();
  });

  it("accepts the exact app origin and a JSON media type with parameters", async () => {
    const response = await json_post(
      { blog: "alice", config: entry() },
      { origin: ORIGIN, "content-type": "Application/JSON; charset=utf-8" },
    );
    expect(response.status).toBe(200);
    expect(get_dev_config("alice")?.origin).toBe(ORIGIN);
  });

  it("refuses a content type that only mentions application/json", async () => {
    for (const type of [
      "text/plain; x=application/json",
      "text/plain;application/json",
      "application/json-patch+json",
    ]) {
      const response = await json_post(
        { blog: "alice", config: entry() },
        { origin: ORIGIN, "content-type": type },
      );
      expect(response.status).toBe(415);
    }
    expect(get_dev_config("alice")).toBeNull();
  });

  it("refuses DELETE of an entry pushed from another origin", async () => {
    set_dev_config("alice", entry(), "http://127.0.0.1:4327");
    const response = await call(DELETE, {
      url: `${ENDPOINT}?blog=alice`,
      method: "DELETE",
    });
    expect(response.status).toBe(409);
    expect(get_dev_config("alice")).not.toBeNull();
  });

  it("returns 404 JSON for a blog without a dev config", async () => {
    const response = await call(GET, { url: `${ENDPOINT}?blog=alice` });
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
  });

  it("round-trips POST, GET and DELETE", async () => {
    const posted = await call(POST, {
      url: ENDPOINT,
      method: "POST",
      body: JSON.stringify({ blog: "alice", config: entry() }),
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:4327",
      },
    });
    expect(posted.status).toBe(200);
    const { hash } = (await posted.json()) as { hash: string };
    expect(hash).toBe(dev_config_hash(entry()));

    const read = await call(GET, { url: `${ENDPOINT}?blog=alice` });
    expect(read.status).toBe(200);
    expect(await read.json()).toMatchObject({
      blog: "alice",
      hash,
      config: entry(),
    });

    const removed = await call(DELETE, {
      url: `${ENDPOINT}?blog=alice`,
      method: "DELETE",
    });
    expect(removed.status).toBe(204);
    expect((await call(GET, { url: `${ENDPOINT}?blog=alice` })).status).toBe(
      404,
    );
  });

  it("validates the POST body", async () => {
    const post = (body: string, type = "application/json") =>
      call(POST, {
        url: ENDPOINT,
        method: "POST",
        body,
        headers: { "content-type": type },
      });

    expect((await post("{not json")).status).toBe(400);
    expect((await post("[1]")).status).toBe(400);
    expect(
      (
        await post(
          JSON.stringify({ blog: "alice", config: entry() }),
          "text/plain",
        )
      ).status,
    ).toBe(415);
    expect(
      (
        await post(
          JSON.stringify({
            blog: "alice",
            config: entry({ siteDescription: "x".repeat(70 * 1024) }),
          }),
        )
      ).status,
    ).toBe(413);
    expect(get_dev_config("alice")).toBeNull();
  });
});

describe("plan_dev_config_sync", () => {
  it.each([
    [null, null, "synced"],
    ["aaaa", "aaaa", "synced"],
    ["aaaa", null, "push"],
    ["aaaa", "bbbb", "push"],
    [null, "bbbb", "server_only"],
  ] as const)("local %s / server %s -> %s", (local_hash, server_hash, plan) => {
    expect(plan_dev_config_sync({ local_hash, server_hash })).toBe(plan);
  });
});

function stub_fetch(...responses: Array<Response | Error>) {
  const fetch_mock = vi.fn();
  for (const r of responses) {
    if (r instanceof Error) fetch_mock.mockRejectedValueOnce(r);
    else fetch_mock.mockResolvedValueOnce(r);
  }
  vi.stubGlobal("fetch", fetch_mock);
  return fetch_mock;
}

describe("release_dev_config_on_server", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends one DELETE for the normalized blog", async () => {
    const fetch_mock = stub_fetch(new Response(null, { status: 204 }));
    await expect(release_dev_config_on_server(" Alice ")).resolves.toBe(
      "released",
    );
    expect(fetch_mock).toHaveBeenCalledTimes(1);
    expect(fetch_mock).toHaveBeenCalledWith("/dev_mode/config?blog=alice", {
      method: "DELETE",
    });
  });

  it("treats a missing server entry as released", async () => {
    stub_fetch(new Response(null, { status: 404 }));
    await expect(release_dev_config_on_server("alice")).resolves.toBe(
      "released",
    );
  });

  it("skips an invalid blog name", async () => {
    const fetch_mock = stub_fetch();
    await expect(release_dev_config_on_server("x")).resolves.toBe("skipped");
    expect(fetch_mock).not.toHaveBeenCalled();
  });

  it("reports a foreign-origin 409 instead of swallowing it", async () => {
    stub_fetch(new Response(null, { status: 409 }));
    await expect(release_dev_config_on_server("alice")).resolves.toBe(
      "foreign",
    );
  });

  it("reports HTTP and network errors as failed without throwing", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    stub_fetch(new Response(null, { status: 500 }), new TypeError("offline"));
    await expect(release_dev_config_on_server("alice")).resolves.toBe("failed");
    await expect(release_dev_config_on_server("alice")).resolves.toBe("failed");
  });

  it("reaches the endpoint end to end: 409 from another origin", async () => {
    expect(set_dev_config("alice", entry(), "http://127.0.0.1:4327").ok).toBe(
      true,
    );
    vi.stubGlobal("fetch", (input: string, init: RequestInit) =>
      call(DELETE, { url: `${ORIGIN}${input}`, method: init.method }),
    );
    await expect(release_dev_config_on_server("alice")).resolves.toBe(
      "foreign",
    );
    expect(get_dev_config("alice")).not.toBeNull();
  });
});

describe("release_failure_message", () => {
  it("is null on success or skip", () => {
    expect(release_failure_message("released")).toBeNull();
    expect(release_failure_message("skipped")).toBeNull();
  });

  it("explains the other origin on 409 and the error otherwise", () => {
    expect(release_failure_message("foreign")).toMatch(/another origin/);
    expect(release_failure_message("failed")).toMatch(/Could not drop/);
  });
});

describe("server_only_notice", () => {
  it("names the origin that pushed the config when it differs", () => {
    const text = server_only_notice("http://127.0.0.1:4327", ORIGIN);
    expect(text).toContain("from http://127.0.0.1:4327");
    expect(text).toContain("Open /admin on http://127.0.0.1:4327");
  });

  it("falls back to the other-tab text for the same or unknown origin", () => {
    expect(server_only_notice(ORIGIN, ORIGIN)).toMatch(/another tab/);
    expect(server_only_notice(null, ORIGIN)).toMatch(/another tab/);
  });
});

describe("fetch_dev_config_info", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns hash and origin of the server entry from GET", async () => {
    const stored = set_dev_config("alice", entry(), "http://127.0.0.1:4327");
    vi.stubGlobal("fetch", (input: string) =>
      call(GET, { url: `${ORIGIN}${input}` }),
    );
    await expect(fetch_dev_config_info("alice")).resolves.toEqual({
      hash: stored.ok ? stored.hash : "",
      origin: "http://127.0.0.1:4327",
    });
  });

  it("returns null when the server has no entry", async () => {
    vi.stubGlobal("fetch", (input: string) =>
      call(GET, { url: `${ORIGIN}${input}` }),
    );
    await expect(fetch_dev_config_info("alice")).resolves.toBeNull();
  });
});
