// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

/**
 * Header types - shared between Astro and SolidJS
 */

import type { BrandSettings } from '../../../components/admin/types/settings'

export type HeaderBrand = BrandSettings

export interface HeaderData {
  site_name: string
  site_description: string
  brand?: HeaderBrand
  /** False when another element (the home hero) owns the page H1: the site name renders as a <p>. */
  site_name_heading?: boolean
}
