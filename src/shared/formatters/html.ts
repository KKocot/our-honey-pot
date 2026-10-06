// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

/**
 * HTML formatters - escape and sanitize HTML strings
 */

/** Escape text for HTML element content */
export function escape_html(text: string): string {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
    .replace(/`/g, "&#096;");
}

/** Escape value for a quoted HTML attribute */
export function escape_html_attr(value: string): string {
  return escape_html(value);
}

/** Coerce untrusted numeric setting to a finite number for inline CSS */
export function safe_css_number(value: unknown, fallback: number): number {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : fallback;
}
