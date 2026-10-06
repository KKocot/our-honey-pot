// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

export { escape_html_attr } from '../formatters/html'

const SAFE_PROTOCOLS = ['http:', 'https:']

/**
 * Validate a link target from untrusted data (KB pattern honeycomb-safe-link-target).
 * Returns normalized absolute http(s) URL, root-relative path, or null.
 */
export function safe_url(raw: unknown, options: { allow_relative?: boolean } = {}): string | null {
  if (typeof raw !== 'string') return null
  const value = raw.trim()
  if (!value || value.includes('\\') || /[\u0000-\u001F\u007F]/.test(value)) return null

  if (value.startsWith('/')) {
    if (!options.allow_relative || value.startsWith('//')) return null
    return value
  }

  try {
    const parsed = new URL(value)
    if (!SAFE_PROTOCOLS.includes(parsed.protocol) || !parsed.hostname) return null
    return parsed.href
  } catch {
    return null
  }
}

/** Encode characters that could break out of a CSS url('...') value */
export function css_url_value(raw: unknown): string | null {
  const url = safe_url(raw, { allow_relative: true })
  if (!url) return null
  return url.replace(/['"()\\\s]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`)
}

export const get_domain_from_url = (url: string): string => {
  try {
    const full_url = url.startsWith('http') ? url : `https://${url}`
    return new URL(full_url).hostname
  } catch {
    return ''
  }
}

export const is_valid_url_for_favicon = (url: string): boolean => {
  try {
    const full_url = url.startsWith('http') ? url : `https://${url}`
    const parsed = new URL(full_url)
    return ['http:', 'https:'].includes(parsed.protocol) && parsed.hostname.includes('.')
  } catch {
    return false
  }
}
