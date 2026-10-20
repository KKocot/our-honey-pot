// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import type { CounterTone } from '../../../settings/SiteSettings'

export const LABEL_CLASS = 'block text-xs font-medium text-text'
export const HINT_CLASS = 'text-xs text-text-muted'
export const ERROR_CLASS = 'text-xs text-error'
export const FIELD_CLASS =
  'w-full rounded-lg border border-border bg-bg px-3 py-1.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary aria-invalid:border-error max-md:min-h-11'
export const LINK_BUTTON_CLASS =
  'rounded text-xs font-medium text-primary underline underline-offset-2 hover:text-primary-hover focus-visible:outline-2 focus-visible:outline-primary'
export const ICON_BUTTON_CLASS =
  'inline-flex size-7 items-center justify-center rounded text-text-muted hover:bg-bg-secondary hover:text-text focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40 max-md:size-11'
export const ADD_BUTTON_CLASS =
  'flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border px-3 py-2 text-sm text-text-muted hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border disabled:hover:text-text-muted max-md:min-h-11'
export const CARD_CLASS = 'flex min-w-0 flex-col gap-2 rounded-lg border border-border/60 p-2'
export const COUNTER_TONE_CLASS: Readonly<Record<CounterTone, string>> = {
  normal: 'text-text-muted',
  warn: 'text-warning',
  limit: 'text-error',
}
