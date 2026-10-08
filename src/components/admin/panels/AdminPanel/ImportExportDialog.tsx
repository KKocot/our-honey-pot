// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createEffect, createSignal, createUniqueId, For, Match, on, onCleanup, Show, Switch } from 'solid-js'
import { CircleAlert, FileCheck, FileDown, FileUp, LoaderCircle } from 'lucide-solid'
import {
  Button,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../ui'
import {
  DesignImportError,
  MAX_DESIGN_FILE_BYTES,
  design_file_name,
  read_design_file,
  serialize_design_file,
  type DesignImportResult,
  type DesignScope,
  type SkipReason,
} from '../../config-io'
import type { SettingsData } from '../../types/settings'

export type ImportExportMode = 'import' | 'export'

interface ImportExportDialogProps {
  open: boolean
  /** Tab shown each time the dialog opens. */
  initial_mode: ImportExportMode
  on_close: () => void
  /** Live settings: import diffs against them, export serializes them. */
  read_settings: () => SettingsData
  /** Receives only validated changes; the caller applies them as one history step. */
  on_apply: (result: DesignImportResult) => void
}

type ImportState =
  | { kind: 'idle' }
  | { kind: 'reading'; file_name: string }
  | { kind: 'ready'; file_name: string; result: DesignImportResult }
  | { kind: 'error'; file_name: string | null; message: string }

/** Skips that are expected (account-bound fields, keys outside a style-only file), not broken values. */
const IGNORED_REASONS: ReadonlySet<SkipReason> = new Set(['identity', 'out_of_scope'])

const SKIP_REASON_TEXT: Readonly<Record<SkipReason, string>> = {
  unknown_key: 'unknown setting',
  forbidden_key: 'forbidden key',
  identity: 'account-specific, ignored',
  out_of_scope: 'outside the file scope',
  invalid_value: 'invalid value',
  limit_exceeded: 'over the limit',
}

const SCOPE_OPTIONS: { value: DesignScope; label: string; hint: string }[] = [
  { value: 'full', label: 'Full design', hint: 'Style, layout, sections and content settings.' },
  { value: 'style', label: 'Style only', hint: 'Palette, fonts, shape, spacing and motion.' },
]

const MODE_TAB_CLASS =
  'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary max-md:min-h-11'

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

export function import_summary(result: DesignImportResult): { changes: string; skipped: string | null } {
  const invalid = result.skipped.filter((item) => !IGNORED_REASONS.has(item.reason)).length
  const changes =
    result.changed_keys.length === 0
      ? 'Nothing to change: this design matches your current settings.'
      : `Will change ${plural(result.changed_keys.length, 'setting', 'settings')}.`
  return {
    changes,
    skipped: invalid > 0 ? `${plural(invalid, 'invalid value', 'invalid values')} skipped.` : null,
  }
}

function download_text(text: string, file_name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = file_name
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function ImportExportDialog(props: ImportExportDialogProps) {
  const ids = {
    tabs: createUniqueId(),
    file: `design-file-${createUniqueId()}`,
    hint: `design-hint-${createUniqueId()}`,
  }
  const [mode, set_mode] = createSignal<ImportExportMode>(props.initial_mode)
  const [scope, set_scope] = createSignal<DesignScope>('full')
  const [state, set_state] = createSignal<ImportState>({ kind: 'idle' })
  const [dragging, set_dragging] = createSignal(false)
  const [export_message, set_export_message] = createSignal<{ ok: boolean; text: string } | null>(null)
  let drag_depth = 0
  let read_token = 0
  let file_input: HTMLInputElement | undefined

  createEffect(
    on(
      () => props.open,
      (open) => {
        if (!open) return
        set_mode(props.initial_mode)
        set_state({ kind: 'idle' })
        set_export_message(null)
        set_dragging(false)
        drag_depth = 0

        // A file dropped next to the drop zone must not make the browser navigate away from the editor.
        const block_page_drop = (event: DragEvent) => {
          if (event.dataTransfer?.types.includes('Files')) event.preventDefault()
        }
        document.addEventListener('dragover', block_page_drop)
        document.addEventListener('drop', block_page_drop)
        onCleanup(() => {
          read_token += 1
          document.removeEventListener('dragover', block_page_drop)
          document.removeEventListener('drop', block_page_drop)
        })
      }
    )
  )

  const load_file = async (files: FileList | null | undefined) => {
    if (!files || files.length === 0) return
    if (files.length > 1) {
      set_state({ kind: 'error', file_name: null, message: 'Drop one design file at a time.' })
      return
    }
    const file = files[0]
    const token = ++read_token
    set_state({ kind: 'reading', file_name: file.name })
    try {
      const result = await read_design_file(file, props.read_settings())
      if (token === read_token) set_state({ kind: 'ready', file_name: file.name, result })
    } catch (error) {
      if (token !== read_token) return
      const message =
        error instanceof DesignImportError
          ? error.message
          : `Could not read the file: ${error instanceof Error ? error.message : 'unknown error'}.`
      set_state({ kind: 'error', file_name: file.name, message })
    } finally {
      if (file_input) file_input.value = ''
    }
  }

  const handle_drag_enter = (event: DragEvent) => {
    if (!event.dataTransfer?.types.includes('Files')) return
    event.preventDefault()
    drag_depth += 1
    set_dragging(true)
  }

  const handle_drag_leave = () => {
    drag_depth = Math.max(0, drag_depth - 1)
    if (drag_depth === 0) set_dragging(false)
  }

  const handle_drop = (event: DragEvent) => {
    event.preventDefault()
    drag_depth = 0
    set_dragging(false)
    void load_file(event.dataTransfer?.files)
  }

  const ready = () => {
    const current = state()
    return current.kind === 'ready' ? current : null
  }
  const reading = () => {
    const current = state()
    return current.kind === 'reading' ? current : null
  }
  const failure = () => {
    const current = state()
    return current.kind === 'error' ? current : null
  }

  const apply = () => {
    const current = ready()
    if (!current || current.result.changed_keys.length === 0) return
    props.on_apply(current.result)
    props.on_close()
  }

  const export_design = () => {
    try {
      const settings = props.read_settings()
      const file_name = design_file_name(settings.siteName ?? '')
      download_text(serialize_design_file(settings, scope()), file_name)
      set_export_message({ ok: true, text: `Downloaded ${file_name}.` })
    } catch (error) {
      set_export_message({
        ok: false,
        text: `Export failed: ${error instanceof Error ? error.message : 'unknown error'}.`,
      })
    }
  }

  return (
    <DialogContent open={() => props.open} onClose={props.on_close} class="max-w-xl">
      <DialogHeader>
        <DialogTitle>Import / export design</DialogTitle>
        <DialogDescription>Move a blog design between sites as a JSON file.</DialogDescription>
      </DialogHeader>

      <DialogBody class="space-y-4">
        <div role="group" aria-label="Import or export" class="flex rounded-lg bg-bg-secondary p-1">
          <button
            type="button"
            aria-pressed={mode() === 'import'}
            aria-controls={`${ids.tabs}-panel`}
            onClick={() => set_mode('import')}
            class={`${MODE_TAB_CLASS} ${mode() === 'import' ? 'bg-bg-card text-text shadow-sm' : 'text-text-muted hover:text-text'}`}
          >
            Import
          </button>
          <button
            type="button"
            aria-pressed={mode() === 'export'}
            aria-controls={`${ids.tabs}-panel`}
            onClick={() => set_mode('export')}
            class={`${MODE_TAB_CLASS} ${mode() === 'export' ? 'bg-bg-card text-text shadow-sm' : 'text-text-muted hover:text-text'}`}
          >
            Export
          </button>
        </div>

        <div id={`${ids.tabs}-panel`}>
          <Show
            when={mode() === 'import'}
            fallback={
              <fieldset class="space-y-2">
                <legend class="mb-2 text-sm font-medium text-text">What to export</legend>
                <For each={SCOPE_OPTIONS}>
                  {(option) => (
                    <label
                      class={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors has-focus-visible:outline-2 has-focus-visible:outline-primary ${
                        scope() === option.value ? 'border-primary bg-primary/5' : 'border-border hover:bg-bg-secondary'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`${ids.tabs}-scope`}
                        value={option.value}
                        checked={scope() === option.value}
                        onChange={() => set_scope(option.value)}
                        class="mt-0.5 accent-primary"
                      />
                      <span>
                        <span class="block text-sm font-medium text-text">{option.label}</span>
                        <span class="block text-xs text-text-muted">{option.hint}</span>
                      </span>
                    </label>
                  )}
                </For>
                <p class="text-xs text-text-muted">Your Hive account and pinned posts are never included.</p>
                <Show when={export_message()}>
                  {(message) => (
                    <p
                      role={message().ok ? 'status' : 'alert'}
                      class={`text-sm ${message().ok ? 'text-success' : 'text-error'}`}
                    >
                      {message().text}
                    </p>
                  )}
                </Show>
              </fieldset>
            }
          >
            <div class="space-y-3">
              <label
                for={ids.file}
                onDragEnter={handle_drag_enter}
                onDragOver={(event) => {
                  if (event.dataTransfer?.types.includes('Files')) event.preventDefault()
                }}
                onDragLeave={handle_drag_leave}
                onDrop={handle_drop}
                class={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors has-focus-visible:outline-2 has-focus-visible:outline-primary ${
                  dragging() ? 'border-primary bg-primary/10' : 'border-border hover:bg-bg-secondary'
                }`}
              >
                <FileUp size={24} aria-hidden="true" class={dragging() ? 'text-primary' : 'text-text-muted'} />
                <span class="text-sm font-medium text-text">
                  {dragging() ? 'Drop the design file here' : 'Choose a design file or drop it here'}
                </span>
                <span id={ids.hint} class="text-xs text-text-muted">
                  JSON exported from Our Honey Pot, up to {MAX_DESIGN_FILE_BYTES / 1024} KB
                </span>
                <input
                  ref={file_input}
                  id={ids.file}
                  type="file"
                  accept="application/json,.json"
                  aria-describedby={ids.hint}
                  onChange={(event) => void load_file(event.currentTarget.files)}
                  class="sr-only"
                />
              </label>

              <div aria-live="polite">
                <Switch>
                  <Match when={reading()}>
                    {(current) => (
                      <p class="flex items-center gap-2 text-sm text-text-muted">
                        <LoaderCircle size={16} aria-hidden="true" class="animate-spin motion-reduce:animate-none" />
                        Checking {current().file_name}...
                      </p>
                    )}
                  </Match>
                  <Match when={ready()}>
                    {(current) => <ImportSummary file_name={current().file_name} result={current().result} />}
                  </Match>
                </Switch>
              </div>

              <Show when={failure()}>
                {(error) => (
                  <p
                    role="alert"
                    class="flex items-start gap-2 rounded-lg border border-error/40 bg-error/10 p-3 text-sm text-error"
                  >
                    <CircleAlert size={16} aria-hidden="true" class="mt-0.5 shrink-0" />
                    <span>
                      <Show when={error().file_name}>{(name) => <span class="font-medium">{name()}: </span>}</Show>
                      {error().message}
                    </span>
                  </p>
                )}
              </Show>
            </div>
          </Show>
        </div>
      </DialogBody>

      <DialogFooter class="gap-2">
        <Button variant="ghost" size="sm" onClick={props.on_close} class="max-md:min-h-11">
          Cancel
        </Button>
        <Show
          when={mode() === 'import'}
          fallback={
            <Button variant="primary" size="sm" onClick={export_design} class="max-md:min-h-11">
              <span class="inline-flex items-center gap-1.5">
                <FileDown size={16} aria-hidden="true" />
                Download design
              </span>
            </Button>
          }
        >
          <Button
            variant="primary"
            size="sm"
            disabled={!ready()?.result.changed_keys.length}
            onClick={apply}
            class="max-md:min-h-11"
          >
            Apply
          </Button>
        </Show>
      </DialogFooter>
    </DialogContent>
  )
}

function ImportSummary(props: { file_name: string; result: DesignImportResult }) {
  const summary = () => import_summary(props.result)
  return (
    <div class="space-y-2 rounded-lg border border-border bg-bg-secondary/50 p-3 text-sm">
      <p class="flex items-center gap-2 font-medium text-text">
        <FileCheck size={16} aria-hidden="true" class="shrink-0 text-success" />
        <span class="truncate">{props.file_name}</span>
        <span class="shrink-0 text-xs font-normal text-text-muted">
          ({props.result.scope === 'style' ? 'style only' : 'full design'})
        </span>
      </p>
      <p class="text-text">
        {summary().changes}
        <Show when={summary().skipped}>{(skipped) => <span class="text-warning"> {skipped()}</span>}</Show>
      </p>
      <Show when={props.result.changed_keys.length > 0 || props.result.skipped.length > 0}>
        <details class="text-xs text-text-muted">
          <summary class="cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-primary">
            Show details
          </summary>
          <Show when={props.result.changed_keys.length > 0}>
            <p class="mt-2 font-medium text-text">Changed settings</p>
            <ul class="mt-1 flex flex-wrap gap-1">
              <For each={props.result.changed_keys}>
                {(key) => <li class="rounded bg-bg-card px-1.5 py-0.5 font-mono">{key}</li>}
              </For>
            </ul>
          </Show>
          <Show when={props.result.skipped.length > 0}>
            <p class="mt-2 font-medium text-text">Skipped</p>
            <ul class="mt-1 space-y-0.5">
              <For each={props.result.skipped}>
                {(item) => (
                  <li>
                    <span class="font-mono break-all">{item.key}</span> — {SKIP_REASON_TEXT[item.reason]}
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </details>
      </Show>
    </div>
  )
}
