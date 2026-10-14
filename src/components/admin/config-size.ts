// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

/** Largest config body accepted on chain and in dev mode localStorage, in UTF-8 bytes. */
export const MAX_BODY_SIZE = 64 * 1024

export const CONFIG_SIZE_WARN_RATIO = 0.7
export const CONFIG_SIZE_DANGER_RATIO = 0.9

export type ConfigSizeLevel = 'ok' | 'warn' | 'danger' | 'blocked'

export interface ConfigSize {
  bytes: number
  max: number
  ratio: number
  level: ConfigSizeLevel
}

const encoder = new TextEncoder()

export function body_byte_size(body: string): number {
  return encoder.encode(body).length
}

export function config_size_level(bytes: number, max: number = MAX_BODY_SIZE): ConfigSizeLevel {
  if (bytes > max) return 'blocked'
  const ratio = bytes / max
  if (ratio > CONFIG_SIZE_DANGER_RATIO) return 'danger'
  if (ratio >= CONFIG_SIZE_WARN_RATIO) return 'warn'
  return 'ok'
}

/** Size of a config body as the save limit counts it, with the editor threshold level. */
export function measure_config_body(body: string, max: number = MAX_BODY_SIZE): ConfigSize {
  const bytes = body_byte_size(body)
  return { bytes, max, ratio: bytes / max, level: config_size_level(bytes, max) }
}
