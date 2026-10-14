// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

/**
 * Header shared component
 * Single source of truth for header rendering
 */

export type { HeaderBrand, HeaderData } from './types'

export { createHeaderData, resolveHeaderVariant, type HeaderVariant } from './utils'

export { renderHeader, renderHeaderCompact, renderHeaderBottom, renderSiteHeader, BRAND_LOGO_HEIGHT_PX } from './render'
