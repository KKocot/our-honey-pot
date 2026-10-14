// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

/**
 * Shared transaction signing logic.
 * Detects signing method (Keychain, WIF, HB-Auth) based on the privateKey marker
 * and signs the transaction accordingly.
 */

import KeychainProvider from "@hiveio/wax-signers-keychain";
import { getOnlineClient } from "./hbauth-service";
import { is_raw_wif, sign_with_wif } from "./wif-signer";
import {
  DEV_MARKER,
  KEYCHAIN_MANAGED_MARKER,
} from "../components/auth/constants";
import { is_dev_mode } from "./dev-mode";

type KeychainSignableTransaction = Parameters<
  ReturnType<typeof KeychainProvider.for>["signTransaction"]
>[0];

/**
 * Sign a transaction using the appropriate method based on the private key value.
 *
 * - DEV_MARKER: no-op in dev mode (broadcast is intercepted), rejected otherwise
 * - KEYCHAIN_MANAGED_MARKER: delegates to Hive Keychain extension
 * - Raw WIF string: signs via in-memory beekeeper
 * - Otherwise: assumes HB-Auth managed key in IndexedDB
 */
export async function sign_transaction(
  tx: KeychainSignableTransaction,
  username: string,
  private_key: string,
): Promise<void> {
  if (private_key === DEV_MARKER) {
    if (!is_dev_mode()) {
      throw new Error(
        "Dev mode session cannot sign outside dev mode. Please login again.",
      );
    }
    return;
  }

  if (private_key === KEYCHAIN_MANAGED_MARKER) {
    const provider = KeychainProvider.for(username, "posting");
    await provider.signTransaction(tx);
    return;
  }

  if (is_raw_wif(private_key)) {
    const digest = tx.sigDigest;
    const signature = await sign_with_wif(private_key, digest);
    tx.addSignature(signature);
    return;
  }

  // HB-Auth signing (production mode -- key managed in IndexedDB)
  tx.addSignature(await sign_with_hbauth(username, tx.sigDigest));
}

async function sign_with_hbauth(
  username: string,
  digest: string,
): Promise<string> {
  const auth_client = await getOnlineClient();
  const registered_user =
    await auth_client.getRegisteredUserByUsername(username);
  if (!registered_user) {
    throw new Error("User not registered in HB-Auth. Please login first.");
  }
  if (!registered_user.unlocked) {
    throw new Error(
      "Wallet is locked. Please unlock with your password first.",
    );
  }
  return auth_client.sign(username, digest, "posting");
}

const IMAGE_SIGNING_PREFIX = new TextEncoder().encode("ImageSigningChallenge");

/** Thrown when the session's signing method cannot sign image uploads (Keychain, dev login). */
export class ImageSigningUnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageSigningUnsupportedError";
  }
}

async function image_upload_digest(data: Uint8Array): Promise<string> {
  const payload = new Uint8Array(IMAGE_SIGNING_PREFIX.length + data.length);
  payload.set(IMAGE_SIGNING_PREFIX, 0);
  payload.set(data, IMAGE_SIGNING_PREFIX.length);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", payload));
  return Array.from(hash, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

/**
 * Posting-key signature for an images.hive.blog upload of `data` (HB-Auth or WIF only).
 * The challenge prefix is fixed here on purpose: accepting a ready digest would turn this
 * into a signing oracle for arbitrary transactions.
 * @throws ImageSigningUnsupportedError for Keychain and dev-mode sessions
 */
export async function sign_image_upload(
  data: Uint8Array,
  username: string,
  private_key: string,
): Promise<string> {
  if (private_key === DEV_MARKER) {
    throw new ImageSigningUnsupportedError(
      "Dev mode session cannot sign image uploads.",
    );
  }
  if (private_key === KEYCHAIN_MANAGED_MARKER) {
    throw new ImageSigningUnsupportedError(
      "Hive Keychain cannot sign image uploads. Paste an image URL instead.",
    );
  }

  const digest = await image_upload_digest(data);
  if (is_raw_wif(private_key)) return sign_with_wif(private_key, digest);
  return sign_with_hbauth(username, digest);
}
