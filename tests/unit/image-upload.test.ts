// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sign_with_wif: vi.fn(),
  hb_sign: vi.fn(),
  hb_user: vi.fn(),
  keychain_for: vi.fn(),
  is_dev_mode: vi.fn(() => false),
  endpoint: vi.fn(() => "https://images.hive.blog"),
}));

vi.mock("@hiveio/wax-signers-keychain", () => ({
  default: { for: mocks.keychain_for },
}));
vi.mock("../../src/lib/wif-signer", () => ({
  is_raw_wif: (key: string) =>
    key !== "__HBAUTH_MANAGED__" && key !== "__KEYCHAIN_MANAGED__",
  sign_with_wif: mocks.sign_with_wif,
}));
vi.mock("../../src/lib/hbauth-service", () => ({
  getOnlineClient: async () => ({
    getRegisteredUserByUsername: mocks.hb_user,
    sign: mocks.hb_sign,
  }),
}));
vi.mock("../../src/lib/dev-mode", () => ({ is_dev_mode: mocks.is_dev_mode }));
vi.mock("../../src/lib/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/lib/config")>();
  return { ...actual, get_hive_images_endpoint: mocks.endpoint };
});

import * as signer from "../../src/lib/transaction-signer";
import {
  ImageSigningUnsupportedError,
  sign_image_upload,
} from "../../src/lib/transaction-signer";
import { ImageUploadError, upload_image } from "../../src/lib/image-upload";
import {
  DEV_MARKER,
  KEYCHAIN_MANAGED_MARKER,
} from "../../src/components/auth/constants";

const WIF = "5JdeC9P7Pbd1uGdFVEsJ41EkEnADbbHGq6p1BwFxm6txNBsQnsw";
const HBAUTH = "__HBAUTH_MANAGED__";
const SIG = "1f" + "ab".repeat(64);
const GIF = new Uint8Array([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x02, 0x00, 0x03, 0x00, 0x00, 0x00,
]);

function expected_digest(data: Uint8Array): string {
  return createHash("sha256")
    .update(Buffer.from("ImageSigningChallenge", "utf8"))
    .update(data)
    .digest("hex");
}

function gif_file(): File {
  return new File([GIF], "photo.gif", { type: "image/gif" });
}

function json_response(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function upload_error(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ImageUploadError);
  return (error as ImageUploadError).code;
}

const fetch_mock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetch_mock);
  mocks.sign_with_wif.mockResolvedValue(SIG);
  mocks.hb_sign.mockResolvedValue(SIG);
  mocks.hb_user.mockResolvedValue({ unlocked: true });
  mocks.is_dev_mode.mockReturnValue(false);
  mocks.endpoint.mockReturnValue("https://images.hive.blog");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("sign_image_upload", () => {
  it("signs sha256('ImageSigningChallenge' || bytes) with WIF", async () => {
    const sig = await sign_image_upload(GIF, "alice", WIF);
    expect(sig).toBe(SIG);
    expect(mocks.sign_with_wif).toHaveBeenCalledWith(WIF, expected_digest(GIF));
  });

  it("signs the same digest through HB-Auth with the posting role", async () => {
    await sign_image_upload(GIF, "alice", HBAUTH);
    expect(mocks.hb_sign).toHaveBeenCalledWith(
      "alice",
      expected_digest(GIF),
      "posting",
    );
  });

  it("is deterministic for the same bytes", async () => {
    await sign_image_upload(GIF, "alice", WIF);
    await sign_image_upload(GIF.slice(), "alice", WIF);
    const [first, second] = mocks.sign_with_wif.mock.calls;
    expect(first[1]).toBe(second[1]);
  });

  it("rejects a locked HB-Auth wallet", async () => {
    mocks.hb_user.mockResolvedValue({ unlocked: false });
    await expect(sign_image_upload(GIF, "alice", HBAUTH)).rejects.toThrow(
      /locked/,
    );
    expect(mocks.hb_sign).not.toHaveBeenCalled();
  });

  it.each([KEYCHAIN_MANAGED_MARKER, DEV_MARKER])(
    "throws unsupported for %s",
    async (marker) => {
      await expect(
        sign_image_upload(GIF, "alice", marker),
      ).rejects.toBeInstanceOf(ImageSigningUnsupportedError);
      expect(mocks.sign_with_wif).not.toHaveBeenCalled();
      expect(mocks.hb_sign).not.toHaveBeenCalled();
      expect(mocks.keychain_for).not.toHaveBeenCalled();
    },
  );

  it("exposes no export that signs a caller-supplied digest", () => {
    expect(Object.keys(signer).sort()).toEqual([
      "ImageSigningUnsupportedError",
      "sign_image_upload",
      "sign_transaction",
    ]);
  });
});

describe("upload_image", () => {
  it("posts FormData to endpoint/username/signature and returns a validated URL", async () => {
    fetch_mock.mockResolvedValue(
      json_response(200, { url: "https://images.hive.blog/DQmX/photo.gif" }),
    );
    const result = await upload_image(gif_file(), {
      username: "alice",
      private_key: WIF,
    });

    expect(result).toEqual({
      url: "https://images.hive.blog/DQmX/photo.gif",
      w: 2,
      h: 3,
    });
    const [url, init] = fetch_mock.mock.calls[0];
    expect(url).toBe(`https://images.hive.blog/alice/${SIG}`);
    expect(init.method).toBe("POST");
    expect(init.headers).toBeUndefined();
    const file = (init.body as FormData).get("file") as File;
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(GIF);
  });

  it.each([
    ["invalid_signature", "invalid_signature"],
    ["payload_too_large", "payload_too_large"],
    ["file_missing", "file_missing"],
    ["no_such_account", "no_such_account"],
    ["blacklisted", "blacklisted"],
    ["qouta_exceeded", "quota_exceeded"],
    ["deplorable", "deplorable"],
    ["invalid_image", "invalid_image"],
  ])("maps hoster error %s to %s", async (name, code) => {
    fetch_mock.mockResolvedValue(json_response(400, { error: { name } }));
    expect(
      await upload_error(
        upload_image(gif_file(), { username: "alice", private_key: WIF }),
      ),
    ).toBe(code);
  });

  it("maps unknown or non-JSON failures to http_error, even with a url in the body", async () => {
    fetch_mock.mockResolvedValue(
      json_response(500, { url: "https://images.hive.blog/x.gif" }),
    );
    expect(
      await upload_error(
        upload_image(gif_file(), { username: "alice", private_key: WIF }),
      ),
    ).toBe("http_error");
  });

  it.each([
    "http://images.hive.blog/x.gif",
    "https://evil.example/x.gif",
    "javascript:alert(1)",
    "blob:https://images.hive.blog/123",
    undefined,
  ])("rejects response URL %s", async (bad) => {
    fetch_mock.mockResolvedValue(json_response(200, { url: bad }));
    expect(
      await upload_error(
        upload_image(gif_file(), { username: "alice", private_key: WIF }),
      ),
    ).toBe("invalid_response");
  });

  it("maps network failure and timeout", async () => {
    fetch_mock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    expect(
      await upload_error(
        upload_image(gif_file(), { username: "alice", private_key: WIF }),
      ),
    ).toBe("network");

    fetch_mock.mockImplementationOnce(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    expect(
      await upload_error(
        upload_image(gif_file(), {
          username: "alice",
          private_key: WIF,
          timeout_ms: 5,
        }),
      ),
    ).toBe("timeout");
  });

  it("validates size and type before signing", async () => {
    const svg = new File(["<svg></svg>"], "x.svg", { type: "image/png" });
    expect(
      await upload_error(
        upload_image(svg, { username: "alice", private_key: WIF }),
      ),
    ).toBe("unsupported_type");

    const huge = new File([new Uint8Array(15_000_001)], "x.gif");
    expect(
      await upload_error(
        upload_image(huge, { username: "alice", private_key: WIF }),
      ),
    ).toBe("too_large");
    expect(mocks.sign_with_wif).not.toHaveBeenCalled();
    expect(fetch_mock).not.toHaveBeenCalled();
  });

  it.each(["http://images.hive.blog", "not a url", "https://u:p@img.example"])(
    "refuses non-https endpoint %s before signing",
    async (endpoint) => {
      mocks.endpoint.mockReturnValue(endpoint);
      expect(
        await upload_error(
          upload_image(gif_file(), { username: "alice", private_key: WIF }),
        ),
      ).toBe("invalid_endpoint");
      expect(mocks.sign_with_wif).not.toHaveBeenCalled();
    },
  );

  it("rejects an invalid username before signing", async () => {
    expect(
      await upload_error(
        upload_image(gif_file(), { username: "../x", private_key: WIF }),
      ),
    ).toBe("invalid_username");
    expect(mocks.sign_with_wif).not.toHaveBeenCalled();
  });

  it("reports Keychain sessions as signing_unsupported without network", async () => {
    expect(
      await upload_error(
        upload_image(gif_file(), {
          username: "alice",
          private_key: KEYCHAIN_MANAGED_MARKER,
        }),
      ),
    ).toBe("signing_unsupported");
    expect(fetch_mock).not.toHaveBeenCalled();
  });

  it("dev mode returns a local blob URL without signing or network", async () => {
    mocks.is_dev_mode.mockReturnValue(true);
    const result = await upload_image(gif_file(), {
      username: "alice",
      private_key: DEV_MARKER,
    });
    expect(result.url.startsWith("blob:")).toBe(true);
    expect(result).toMatchObject({ w: 2, h: 3 });
    expect(fetch_mock).not.toHaveBeenCalled();
    expect(mocks.sign_with_wif).not.toHaveBeenCalled();
    URL.revokeObjectURL(result.url);
  });

  it("dev marker outside dev mode is unsupported", async () => {
    expect(
      await upload_error(
        upload_image(gif_file(), {
          username: "alice",
          private_key: DEV_MARKER,
        }),
      ),
    ).toBe("signing_unsupported");
    expect(fetch_mock).not.toHaveBeenCalled();
  });
});
