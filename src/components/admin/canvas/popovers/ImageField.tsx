// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

// No lucide-solid and no ui/auth barrels here: they run client-only code at import, which breaks the unit tests.
import { createEffect, createSignal, createUniqueId, For, on, onCleanup, Show } from 'solid-js'
import { Button } from '../../../ui/Button'
import { showToast } from '../../../ui/Toast'
import { currentUser, type LoginType } from '../../../auth/auth-store'
import { hive_image_proxy } from '../../../../lib/config'
import { ImageProcessingError, MAX_INPUT_BYTES, type ImageMime } from '../../../../lib/image-processing'
import { ALT_MAX_CHARS, IMAGE_DIMENSION_RANGE, safe_image_url, type ImageRef } from '../../../../lib/image-ref'
import { ImageUploadError, upload_image, type ImageUploadErrorCode } from '../../../../lib/image-upload'

// Keyed by ImageMime so the list cannot drift from what process_image_for_upload accepts.
const UPLOAD_FORMAT_LABELS: Record<ImageMime, string> = {
  'image/jpeg': 'JPG',
  'image/png': 'PNG',
  'image/gif': 'GIF',
  'image/webp': 'WebP',
}
export const UPLOAD_MIME_TYPES: readonly string[] = Object.keys(UPLOAD_FORMAT_LABELS)
export const UPLOAD_ACCEPT = UPLOAD_MIME_TYPES.join(',')
const UPLOAD_FORMATS_TEXT = (() => {
  const labels = Object.values(UPLOAD_FORMAT_LABELS)
  return `${labels.slice(0, -1).join(', ')} or ${labels[labels.length - 1]}`
})()
export const UPLOAD_MAX_MB = MAX_INPUT_BYTES / 1_000_000
export const SIGNED_OUT_UPLOAD_MESSAGE = 'Log in to upload images.'
export const KEYCHAIN_UPLOAD_MESSAGE = 'Upload requires HB-Auth or WIF login — paste an image URL instead'
export const IMAGE_LOAD_FAILED_MESSAGE = 'Image could not be loaded'
export const RATIO_TOLERANCE = 0.1

const PREVIEW_WIDTH = 640
const MEASURE_TIMEOUT_MS = 15_000
const UNDO_TIMEOUT_MS = 6000

export type UploadAvailability = 'available' | 'keychain' | 'signed_out' | 'hidden'
export type ImageSourceMode = 'upload' | 'paste'

export interface ImageRecommendation {
  /** Width / height, e.g. 16 / 9. */
  ratio?: number
  ratio_label?: string
  min_width?: number
}

export interface ImageFieldProps {
  label: string
  value: ImageRef | undefined
  on_change: (next: ImageRef | undefined) => void
  /** Role may write the config; wired by the panel. */
  can_upload: boolean
  /** Shows the `Decorative image` checkbox (spec: only `bg_image`). */
  allow_decorative?: boolean
  /** Hides the alt input for targets that never render alt text (e.g. favicon). */
  hide_alt?: boolean
  recommended?: ImageRecommendation
}

/** Whether the Upload mode is offered, and why not. */
export function upload_availability(input: { can_upload: boolean; login_type: LoginType | null }): UploadAvailability {
  // Signed out first: `can_upload` needs a username, so it is always false before login
  if (input.login_type === null) return 'signed_out'
  if (!input.can_upload) return 'hidden'
  if (input.login_type === 'keychain') return 'keychain'
  return 'available'
}

export function effective_mode(requested: ImageSourceMode, availability: UploadAvailability): ImageSourceMode {
  return availability === 'available' ? requested : 'paste'
}

/** Fast check before decoding with the limits of `process_image_for_upload`, which also verifies magic bytes. */
export function precheck_file(file: { type: string; size: number }): ImageUploadErrorCode | null {
  if (file.type && !UPLOAD_MIME_TYPES.includes(file.type)) {
    return file.type === 'image/heic' || file.type === 'image/heif' ? 'heic_unsupported' : 'unsupported_type'
  }
  if (file.size > MAX_INPUT_BYTES) return 'too_large'
  return null
}

const ERROR_MESSAGES: Record<ImageUploadErrorCode, string> = {
  unsupported_type: `Unsupported file type. Use a ${UPLOAD_FORMATS_TEXT} image.`,
  too_large: `The file is too large. Maximum size is ${UPLOAD_MAX_MB} MB.`,
  heic_unsupported: 'HEIC photos are not supported. Export the photo as JPG and try again.',
  decode_failed: 'The image could not be read. The file may be damaged.',
  invalid_signature: 'The image host rejected the upload signature. Log in again and retry.',
  payload_too_large: 'The image host rejected the file as too large.',
  file_missing: 'The image host did not receive the file. Try again.',
  no_such_account: 'The image host does not recognise this Hive account.',
  blacklisted: 'This account is blocked by the image host.',
  quota_exceeded: 'Upload limit reached for this account. Try again later or paste an image URL.',
  deplorable: 'The image host does not accept uploads from this account (reputation too low).',
  invalid_image: 'The image host could not process this image.',
  invalid_username: 'Your session has an invalid username. Log in again.',
  invalid_endpoint: 'The image host is not configured correctly.',
  signing_unsupported: KEYCHAIN_UPLOAD_MESSAGE,
  signing_failed: 'Signing the upload failed. Log in again and retry.',
  timeout: 'The upload timed out. Check your connection and try again.',
  aborted: 'Upload cancelled.',
  network: 'Network error. Check your connection and try again.',
  http_error: 'The image host returned an error. Try again later.',
  invalid_response: 'The image host returned an unexpected response.',
}

export function image_error_message(code: ImageUploadErrorCode): string {
  return ERROR_MESSAGES[code] ?? ERROR_MESSAGES.http_error
}

export function upload_error_code(error: unknown): ImageUploadErrorCode {
  if (error instanceof ImageUploadError || error instanceof ImageProcessingError) return error.code
  return 'network'
}

export type PastedUrlResult = { ok: true; url: string } | { ok: false; message: string }

/** Same gate as the config validator (`safe_image_url`). */
export function resolve_pasted_url(raw: string): PastedUrlResult {
  const value = raw.trim()
  if (!value) return { ok: false, message: 'Paste an image URL.' }
  const url = safe_image_url(value)
  if (!url) {
    return {
      ok: false,
      message: 'Use an https link from an allowed image host (e.g. images.hive.blog), max 256 bytes.',
    }
  }
  return { ok: true, url }
}

/** Dev-mode uploads return a local blob: URL that must never reach the ImageRef. */
export function is_local_preview_url(url: string): boolean {
  return url.startsWith('blob:')
}

export function alt_length(alt: string): number {
  return Array.from(alt.trim()).length
}

export function field_alt_issue(input: {
  alt: string
  decorative: boolean
  hide_alt: boolean
  has_image: boolean
}): string | null {
  if (input.hide_alt || !input.has_image) return null
  return alt_issue(input.alt, input.decorative)
}

export function alt_issue(alt: string, decorative: boolean): string | null {
  if (alt_length(alt) > ALT_MAX_CHARS) return `Alt text is too long (max ${ALT_MAX_CHARS} characters).`
  if (!decorative && alt.trim().length === 0) return 'Alt text is required.'
  return null
}

function valid_dimension(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isInteger(value)) return undefined
  return value >= IMAGE_DIMENSION_RANGE.min && value <= IMAGE_DIMENSION_RANGE.max ? value : undefined
}

export function build_image_ref(draft: {
  url: string
  alt: string
  w?: number
  h?: number
  decorative?: boolean
}): ImageRef {
  const ref: ImageRef = { url: draft.url, alt: draft.alt.trim() }
  const w = valid_dimension(draft.w)
  const h = valid_dimension(draft.h)
  if (w !== undefined && h !== undefined) {
    ref.w = w
    ref.h = h
  }
  if (draft.decorative) ref.decorative = true
  return ref
}

/** Non-blocking hints: aspect ratio off by more than 10% and width below the recommended minimum. */
export function image_warnings(
  size: { w?: number; h?: number },
  recommended: ImageRecommendation | undefined
): string[] {
  if (!recommended || !size.w || !size.h) return []
  const warnings: string[] = []
  if (recommended.ratio && Math.abs(size.w / size.h - recommended.ratio) / recommended.ratio > RATIO_TOLERANCE) {
    const label = recommended.ratio_label ?? recommended.ratio.toFixed(2)
    warnings.push(`Aspect ratio differs from the recommended ${label}; the image will be cropped.`)
  }
  if (recommended.min_width && size.w < recommended.min_width) {
    warnings.push(`Image is ${size.w} px wide; at least ${recommended.min_width} px is recommended.`)
  }
  return warnings
}

function measure_image(src: string): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    const image = new Image()
    const timer = window.setTimeout(() => finish(null), MEASURE_TIMEOUT_MS)
    function finish(result: { w: number; h: number } | null) {
      window.clearTimeout(timer)
      image.onload = null
      image.onerror = null
      resolve(result)
    }
    image.onload = () =>
      finish(
        image.naturalWidth > 0 && image.naturalHeight > 0 ? { w: image.naturalWidth, h: image.naturalHeight } : null
      )
    image.onerror = () => finish(null)
    image.src = src
  })
}

type UploadState =
  | { status: 'idle' }
  | { status: 'uploading'; file_name: string }
  | { status: 'success'; file_name: string }
  | { status: 'local'; file_name: string; url: string; w: number; h: number }
  | { status: 'error'; message: string }

const TEXT_INPUT =
  'min-w-0 flex-1 rounded border border-border bg-bg px-2 py-1 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary max-md:min-h-11'

const SEGMENT =
  'flex-1 rounded-md px-2 py-1.5 font-medium focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50 max-md:min-h-11'

export function ImageField(props: ImageFieldProps) {
  const uid = createUniqueId()
  const ids = {
    label: `image-field-label-${uid}`,
    file: `image-field-file-${uid}`,
    url: `image-field-url-${uid}`,
    alt: `image-field-alt-${uid}`,
    alt_hint: `image-field-alt-hint-${uid}`,
    alt_error: `image-field-alt-error-${uid}`,
    upload_note: `image-field-upload-note-${uid}`,
    paste_error: `image-field-paste-error-${uid}`,
    decorative: `image-field-decorative-${uid}`,
  }

  const availability = () =>
    upload_availability({ can_upload: props.can_upload, login_type: currentUser()?.loginType ?? null })
  const [requested_mode, set_requested_mode] = createSignal<ImageSourceMode>('upload')
  const mode = () => effective_mode(requested_mode(), availability())

  const [upload, set_upload] = createSignal<UploadState>({ status: 'idle' })
  const [drag_active, set_drag_active] = createSignal(false)
  const [announcement, set_announcement] = createSignal('')

  const [pasted, set_pasted] = createSignal('')
  const [paste_error, set_paste_error] = createSignal<string | null>(null)
  const [checking, set_checking] = createSignal(false)

  const [alt, set_alt] = createSignal(props.value?.alt ?? '')
  const [decorative, set_decorative] = createSignal(props.value?.decorative === true)
  createEffect(
    on(
      () => props.value?.alt,
      (value) => set_alt(value ?? ''),
      { defer: true }
    )
  )
  createEffect(
    on(
      () => props.value?.decorative,
      (value) => set_decorative(value === true),
      { defer: true }
    )
  )

  let file_input: HTMLInputElement | undefined
  let choose_button: HTMLButtonElement | undefined
  let cancel_button: HTMLButtonElement | undefined
  let controller: AbortController | undefined
  let run = 0

  const local_preview = () => {
    const state = upload()
    return state.status === 'local' ? state : null
  }

  const release_local = () => {
    const local = local_preview()
    if (local) URL.revokeObjectURL(local.url)
  }

  onCleanup(() => {
    run++
    controller?.abort()
    release_local()
  })

  const is_decorative = () => props.allow_decorative === true && decorative()
  const stored_url_invalid = () => props.value !== undefined && safe_image_url(props.value.url) === null
  const has_image = () => props.value !== undefined || local_preview() !== null
  const hide_alt = () => props.hide_alt === true
  const current_alt_issue = () =>
    field_alt_issue({ alt: alt(), decorative: is_decorative(), hide_alt: hide_alt(), has_image: has_image() })
  const preview_size = () => local_preview() ?? props.value
  const warnings = () => {
    const size = preview_size()
    return size ? image_warnings({ w: size.w, h: size.h }, props.recommended) : []
  }

  const emit = (draft: { url: string; w?: number; h?: number }) =>
    props.on_change(build_image_ref({ ...draft, alt: hide_alt() ? '' : alt(), decorative: is_decorative() }))

  const commit_alt = () => {
    const value = props.value
    if (value && value.alt !== alt().trim()) emit(value)
  }

  const toggle_decorative = (checked: boolean) => {
    set_decorative(checked)
    if (props.value) emit(props.value)
  }

  const start_upload = async (file: File) => {
    const precheck = precheck_file(file)
    if (precheck) {
      set_upload({ status: 'error', message: image_error_message(precheck) })
      return
    }
    const user = currentUser()
    if (!user) {
      set_upload({ status: 'error', message: 'Log in to upload images.' })
      return
    }

    release_local()
    controller?.abort()
    controller = new AbortController()
    const id = ++run
    set_upload({ status: 'uploading', file_name: file.name })
    set_announcement(`Uploading ${file.name}`)
    queueMicrotask(() => cancel_button?.focus({ preventScroll: true }))

    try {
      const result = await upload_image(file, {
        username: user.username,
        private_key: user.privateKey,
        signal: controller.signal,
      })
      if (id !== run) {
        if (is_local_preview_url(result.url)) URL.revokeObjectURL(result.url)
        return
      }
      if (is_local_preview_url(result.url)) {
        set_upload({ status: 'local', file_name: file.name, url: result.url, w: result.w, h: result.h })
        set_announcement('Dev mode: local preview only, the image was not uploaded')
      } else {
        emit({ url: result.url, w: result.w, h: result.h })
        set_upload({ status: 'success', file_name: file.name })
        set_announcement(`Uploaded ${file.name}`)
      }
    } catch (error) {
      if (id !== run) return
      const code = upload_error_code(error)
      if (code === 'aborted') {
        set_upload({ status: 'idle' })
        set_announcement(image_error_message('aborted'))
        return
      }
      set_upload({ status: 'error', message: image_error_message(code) })
    } finally {
      if (id === run) controller = undefined
    }
    queueMicrotask(() => choose_button?.focus({ preventScroll: true }))
  }

  const cancel_upload = () => {
    run++
    controller?.abort()
    controller = undefined
    set_upload({ status: 'idle' })
    set_announcement(image_error_message('aborted'))
    queueMicrotask(() => choose_button?.focus({ preventScroll: true }))
  }

  const open_picker = () => file_input?.click()

  const on_file_input = (event: Event & { currentTarget: HTMLInputElement }) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (file) void start_upload(file)
  }

  const on_drag_over = (event: DragEvent) => {
    if (!event.dataTransfer?.types.includes('Files')) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    set_drag_active(true)
  }

  const on_drag_leave = (event: DragEvent & { currentTarget: HTMLDivElement }) => {
    const next = event.relatedTarget
    if (next instanceof Node && event.currentTarget.contains(next)) return
    set_drag_active(false)
  }

  const on_drop = (event: DragEvent) => {
    event.preventDefault()
    set_drag_active(false)
    const file = event.dataTransfer?.files?.[0]
    if (file) void start_upload(file)
  }

  const apply_pasted = async () => {
    const resolved = resolve_pasted_url(pasted())
    if (!resolved.ok) {
      set_paste_error(resolved.message)
      return
    }
    set_paste_error(null)
    set_checking(true)
    const size = await measure_image(hive_image_proxy(resolved.url, 0, 0))
    set_checking(false)
    if (!size) {
      set_paste_error(IMAGE_LOAD_FAILED_MESSAGE)
      return
    }
    release_local()
    set_upload({ status: 'idle' })
    emit({ url: resolved.url, w: size.w, h: size.h })
    set_pasted('')
    set_announcement('Image URL applied')
  }

  const remove_image = () => {
    const before = props.value
    release_local()
    set_upload({ status: 'idle' })
    if (!before) return
    props.on_change(undefined)
    showToast('Image removed', 'success', {
      duration_ms: UNDO_TIMEOUT_MS,
      action: { label: 'Undo', on_click: () => props.on_change(before) },
    })
    queueMicrotask(() => (choose_button ?? document.getElementById(ids.url))?.focus({ preventScroll: true }))
  }

  const preview_src = () => {
    const local = local_preview()
    if (local) return local.url
    const url = props.value ? safe_image_url(props.value.url) : null
    return url ? hive_image_proxy(url, PREVIEW_WIDTH) : null
  }

  const frame_ratio = () => {
    const size = preview_size()
    if (props.recommended?.ratio) return props.recommended.ratio
    return size?.w && size?.h ? size.w / size.h : 16 / 9
  }

  const alt_describedby = () => [ids.alt_hint, current_alt_issue() ? ids.alt_error : null].filter(Boolean).join(' ')

  return (
    <fieldset class="flex min-w-0 flex-col gap-3">
      <legend id={ids.label} class="mb-1 text-sm font-medium text-text">
        {props.label}
      </legend>

      <Show when={availability() !== 'hidden'}>
        <div role="group" aria-label="Image source" class="flex rounded-lg bg-bg-secondary p-0.5 text-xs">
          <button
            type="button"
            aria-pressed={mode() === 'upload'}
            disabled={availability() !== 'available'}
            aria-describedby={availability() === 'available' ? undefined : ids.upload_note}
            onClick={() => set_requested_mode('upload')}
            class={`${SEGMENT} ${mode() === 'upload' ? 'bg-bg-card text-text shadow-sm' : 'text-text-muted hover:text-text'}`}
          >
            Upload
          </button>
          <button
            type="button"
            aria-pressed={mode() === 'paste'}
            onClick={() => set_requested_mode('paste')}
            class={`${SEGMENT} ${mode() === 'paste' ? 'bg-bg-card text-text shadow-sm' : 'text-text-muted hover:text-text'}`}
          >
            Paste URL
          </button>
        </div>
        <Show when={availability() === 'keychain' || availability() === 'signed_out'}>
          <p id={ids.upload_note} class="text-xs text-text-muted">
            {availability() === 'keychain' ? KEYCHAIN_UPLOAD_MESSAGE : SIGNED_OUT_UPLOAD_MESSAGE}
          </p>
        </Show>
      </Show>

      <Show when={mode() === 'upload'}>
        <input
          ref={file_input}
          id={ids.file}
          type="file"
          accept={UPLOAD_ACCEPT}
          tabIndex={-1}
          aria-hidden="true"
          class="sr-only"
          onChange={on_file_input}
        />
        <Show
          when={upload().status === 'uploading' ? (upload() as { file_name: string }) : null}
          fallback={
            <div
              onDragEnter={on_drag_over}
              onDragOver={on_drag_over}
              onDragLeave={on_drag_leave}
              onDrop={on_drop}
              class={`flex flex-col items-center gap-2 rounded-lg border-2 border-dashed px-3 py-4 text-center transition-colors duration-150 ease-out motion-reduce:transition-none ${
                drag_active() ? 'border-primary bg-primary/10' : 'border-border bg-bg'
              }`}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                class={`size-6 ${drag_active() ? 'text-primary' : 'text-text-muted'}`}
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M12 3v12" />
                <path d="m17 8-5-5-5 5" />
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              </svg>
              <p class="text-sm text-text">{drag_active() ? 'Drop image here' : 'Drag an image here or'}</p>
              <Button ref={choose_button} type="button" variant="secondary" size="sm" onClick={open_picker}>
                Choose file
              </Button>
              <p class="text-xs text-text-muted">
                {UPLOAD_FORMATS_TEXT}, up to {UPLOAD_MAX_MB} MB
              </p>
            </div>
          }
        >
          {(state) => (
            <div class="flex flex-col gap-2 rounded-lg border border-border bg-bg p-3">
              <div class="flex items-center gap-2">
                <span class="min-w-0 flex-1 truncate text-sm text-text">Uploading {state().file_name}</span>
                <Button ref={cancel_button} type="button" variant="ghost" size="sm" onClick={cancel_upload}>
                  Cancel
                </Button>
              </div>
              <div
                role="progressbar"
                aria-label={`Uploading ${state().file_name}`}
                class="h-1.5 overflow-hidden rounded-full bg-bg-secondary"
              >
                <div class="h-full w-1/3 rounded-full bg-primary animate-pulse motion-reduce:animate-none" />
              </div>
            </div>
          )}
        </Show>

        <Show when={upload().status === 'error' ? (upload() as { message: string }) : null}>
          {(state) => (
            <div role="alert" class="flex items-start gap-2 rounded-lg border border-error bg-error/10 p-2">
              <p class="min-w-0 flex-1 text-xs text-error">{state().message}</p>
              <Button type="button" variant="ghost" size="sm" onClick={open_picker}>
                Try again
              </Button>
            </div>
          )}
        </Show>

        <Show when={upload().status === 'success' ? (upload() as { file_name: string }) : null}>
          {(state) => <p class="text-xs text-success">Uploaded {state().file_name}</p>}
        </Show>
      </Show>

      <Show when={mode() === 'paste'}>
        <div class="flex flex-col gap-1">
          <label for={ids.url} class="text-xs text-text-muted">
            Image URL
          </label>
          <div class="flex items-center gap-2">
            <input
              id={ids.url}
              type="url"
              inputmode="url"
              value={pasted()}
              placeholder="https://images.hive.blog/..."
              aria-invalid={paste_error() ? true : undefined}
              aria-describedby={paste_error() ? ids.paste_error : undefined}
              onInput={(event) => {
                set_pasted(event.currentTarget.value)
                set_paste_error(null)
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return
                event.preventDefault()
                void apply_pasted()
              }}
              class={TEXT_INPUT}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              loading={checking()}
              onClick={() => void apply_pasted()}
            >
              Use URL
            </Button>
          </div>
          <Show when={paste_error()}>
            {(message) => (
              <p id={ids.paste_error} role="alert" class="text-xs text-error">
                {message()}
              </p>
            )}
          </Show>
        </div>
      </Show>

      <Show when={stored_url_invalid()}>
        <p class="text-xs text-error">
          The current image URL is not allowed and will not be saved. Upload a file or paste a new URL.
        </p>
      </Show>

      <Show when={preview_src()}>
        {(src) => (
          <figure class="flex flex-col gap-1.5">
            <div
              class="relative w-full overflow-hidden rounded-lg bg-bg-secondary"
              style={{ 'aspect-ratio': String(frame_ratio()) }}
            >
              <img src={src()} alt="" loading="lazy" decoding="async" class="size-full object-cover" />
              <div
                aria-hidden="true"
                class="pointer-events-none absolute inset-0 rounded-lg ring-1 ring-inset ring-border"
              />
              <Show when={props.recommended?.ratio_label}>
                {(ratio) => (
                  <span class="absolute left-1.5 top-1.5 rounded bg-bg-card/90 px-1.5 py-0.5 text-xs text-text">
                    Crop {ratio()}
                  </span>
                )}
              </Show>
            </div>
            <figcaption class="flex items-center gap-2">
              <span class="min-w-0 flex-1 truncate text-xs text-text-muted">
                <Show when={preview_size()?.w && preview_size()?.h}>
                  {preview_size()?.w} × {preview_size()?.h} px
                </Show>
              </span>
              <Button type="button" variant="ghost" size="sm" class="text-error" onClick={remove_image}>
                {local_preview() ? 'Discard preview' : 'Remove image'}
              </Button>
            </figcaption>
            <Show when={local_preview()}>
              <p class="text-xs text-warning">
                Dev mode: this is a local preview only. The image was not uploaded and will not be saved — paste an
                image URL to keep an image.
              </p>
            </Show>
            <Show when={warnings().length > 0}>
              <ul class="flex flex-col gap-0.5 text-xs text-warning">
                <For each={warnings()}>{(warning) => <li>{warning}</li>}</For>
              </ul>
            </Show>
          </figure>
        )}
      </Show>

      <Show when={!hide_alt()}>
        <div class="flex flex-col gap-1">
          <div class="flex items-baseline justify-between gap-2">
            <label for={ids.alt} class="text-xs text-text-muted">
              Alt text{is_decorative() ? ' (optional)' : ''}
            </label>
            <span
              id={ids.alt_hint}
              class={`text-xs tabular-nums ${alt_length(alt()) > ALT_MAX_CHARS ? 'text-error' : 'text-text-muted'}`}
            >
              {alt_length(alt())}/{ALT_MAX_CHARS}
            </span>
          </div>
          <input
            id={ids.alt}
            type="text"
            value={alt()}
            placeholder="Describe the image"
            required={!is_decorative()}
            aria-invalid={current_alt_issue() ? true : undefined}
            aria-describedby={alt_describedby()}
            onInput={(event) => set_alt(event.currentTarget.value)}
            onChange={commit_alt}
            class={TEXT_INPUT}
          />
          <Show when={current_alt_issue()}>
            {(issue) => (
              <p id={ids.alt_error} class="text-xs text-error">
                {issue()}
              </p>
            )}
          </Show>
        </div>
      </Show>

      <Show when={props.allow_decorative}>
        <label for={ids.decorative} class="flex items-center gap-2 text-sm text-text">
          <input
            id={ids.decorative}
            type="checkbox"
            checked={decorative()}
            onChange={(event) => toggle_decorative(event.currentTarget.checked)}
            class="size-4 cursor-pointer rounded border-border text-primary focus:ring-primary"
          />
          Decorative image
        </label>
      </Show>

      <p role="status" aria-live="polite" class="sr-only">
        {announcement()}
      </p>
    </fieldset>
  )
}
