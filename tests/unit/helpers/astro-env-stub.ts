// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

// Vitest stand-in for the astro:env/server virtual module (resolved by Astro only)
export function getSecret(key: string): string | undefined {
  return process.env[key];
}
