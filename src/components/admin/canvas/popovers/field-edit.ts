// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createContext, useContext } from 'solid-js'

/**
 * One edited form field: `key` groups fast typing into one undo step, `label` names that step.
 * Without `key` the edit is discrete (add, remove, move): always its own step.
 */
export interface EditedField {
  key?: string
  label: string
}

/** Runs `edit` (a settings write) and records it in the editor history as a step of `field`. */
export type FieldEdit = (field: EditedField, edit: () => void) => void

const run_edit: FieldEdit = (_field, edit) => edit()

const FieldEditContext = createContext<FieldEdit>(run_edit)

/** Provided by PopoverHost; without a provider edits run untagged (history falls back to top-level keys). */
export const FieldEditProvider = FieldEditContext.Provider

export function use_field_edit(): FieldEdit {
  return useContext(FieldEditContext)
}

function step_label(verb: string, scope: string, field: string): string {
  return [verb, scope.toLowerCase(), field.toLowerCase()].filter(Boolean).join(' ')
}

/** Typed text: "Edited hero headline" from a scope ("Hero") and a field label ("Headline"). */
export function edited_label(scope: string, field: string): string {
  return step_label('Edited', scope, field)
}

/** Picked option, toggle or list change: "Changed footer column". */
export function changed_label(scope: string, field: string): string {
  return step_label('Changed', scope, field)
}

/** Discrete list addition: "Added hero button". */
export function added_label(scope: string, field: string): string {
  return step_label('Added', scope, field)
}

export function removed_label(scope: string, field: string): string {
  return step_label('Removed', scope, field)
}
