// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createContext, useContext } from 'solid-js'
import type { PageSlotPosition } from '../page-layout/types'

/** Page slot of the rendered section; the canvas provides it so the header picks the SSR variant. */
export const PageSlotContext = createContext<PageSlotPosition | undefined>(undefined)

export function usePageSlot(): PageSlotPosition | undefined {
  return useContext(PageSlotContext)
}
