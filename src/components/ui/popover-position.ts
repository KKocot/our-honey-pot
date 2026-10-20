// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

export interface Rect {
  top: number
  right: number
  bottom: number
  left: number
}

export interface Size {
  width: number
  height: number
}

export interface BesidePosition {
  top: number
  left: number
  /** False while the anchor rect is entirely outside the viewport (scrolled away). */
  visible: boolean
}

export interface BesideSpacing {
  /** Distance between the anchor rect and the panel. */
  gap: number
  /** Minimum distance between the panel and the viewport edges. */
  margin: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

function intersects_viewport(anchor: Rect, viewport: Size): boolean {
  return anchor.bottom >= 0 && anchor.right >= 0 && anchor.top <= viewport.height && anchor.left <= viewport.width
}

/**
 * Viewport position of a panel placed outside `anchor`: right, left, below, above, in that order.
 * When no side has room the panel docks at the right viewport edge (the only case it may cover the anchor).
 */
export function compute_beside_position(
  anchor: Rect,
  panel: Size,
  viewport: Size,
  spacing: BesideSpacing
): BesidePosition {
  const { gap, margin } = spacing
  const visible = intersects_viewport(anchor, viewport)
  const top_along = clamp(anchor.top, margin, viewport.height - margin - panel.height)
  const left_along = clamp(anchor.left, margin, viewport.width - margin - panel.width)

  const right = anchor.right + gap
  if (right + panel.width <= viewport.width - margin) return { top: top_along, left: right, visible }

  const left = anchor.left - gap - panel.width
  if (left >= margin) return { top: top_along, left, visible }

  const below = anchor.bottom + gap
  if (below + panel.height <= viewport.height - margin) return { top: below, left: left_along, visible }

  const above = anchor.top - gap - panel.height
  if (above >= margin) return { top: above, left: left_along, visible }

  return { top: margin, left: Math.max(margin, viewport.width - margin - panel.width), visible }
}
