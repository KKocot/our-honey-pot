// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createSignal, createUniqueId, Match, Show, Switch, onMount } from 'solid-js'
import { HBAuthLogin, KeychainLogin, has_keychain, type AuthUser } from '../../../auth'
import type { HBAuthMode } from '../../../auth/HBAuthLogin'
import { LockIcon, CloseIcon } from '../../../auth/icons'
import { DevLoginForm } from '../../../dev/DevLoginForm'
import { is_dev_mode } from '../../../../lib/dev-mode'
import { useFocusTrap } from '../../../ui/use-focus-trap'

type LoginMethod = 'hbauth-login' | 'hbauth-register' | 'keychain' | 'dev'

interface LoginModalProps {
  show: boolean
  onClose: () => void
  onSuccess: (user: AuthUser) => void
  /** Dev mode: prefilled username of the "Dev login" tab. */
  dev_login_username?: string | null
}

function DevLoginTabImpl(props: { pressed: boolean; on_select: () => void; class: string }) {
  return (
    <button type="button" aria-pressed={props.pressed} onClick={() => props.on_select()} class={props.class}>
      Dev login
    </button>
  )
}

// Literal DEV gate: Solid memo-wraps a `{DEV && <jsx>}` expression, so it would survive tree-shaking
const DevLoginTab = import.meta.env.DEV ? DevLoginTabImpl : () => null

function initial_login_focus(elements: HTMLElement[], panel: HTMLElement): HTMLElement | null {
  const active = document.activeElement
  if (active instanceof Node && panel.contains(active)) return null
  return elements.find((element) => element instanceof HTMLInputElement) ?? elements[0] ?? panel
}

export function LoginModal(props: LoginModalProps) {
  return (
    <Show when={props.show}>
      <LoginModalPanel {...props} />
    </Show>
  )
}

function LoginModalPanel(props: LoginModalProps) {
  const [login_method, setLoginMethod] = createSignal<LoginMethod>('hbauth-login')
  const [keychain_available, setKeychainAvailable] = createSignal(false)
  const [dev_login_available, set_dev_login_available] = createSignal(false)
  const title_id = createUniqueId()
  let backdrop_ref: HTMLDivElement | undefined
  let wrapper_ref: HTMLDivElement | undefined
  let panel_ref: HTMLDivElement | undefined
  let press_started_on_backdrop = false

  const focus_trap = useFocusTrap(
    () => panel_ref,
    () => true,
    {
      catch_escaped_focus: true,
      skip_hidden: true,
      initial_focus: initial_login_focus,
      on_escape: () => props.onClose(),
    }
  )

  const is_backdrop = (target: EventTarget | null) => target === backdrop_ref || target === wrapper_ref

  onMount(() => {
    setKeychainAvailable(has_keychain())
    if (import.meta.env.DEV) set_dev_login_available(is_dev_mode())
  })

  const hbauth_mode = (): HBAuthMode => (login_method() === 'hbauth-register' ? 'register' : 'login')

  function handle_mode_change(mode: HBAuthMode) {
    setLoginMethod(mode === 'register' ? 'hbauth-register' : 'hbauth-login')
  }

  function tab_class(method: LoginMethod): string {
    const is_active = login_method() === method
    return `flex-1 rounded-lg py-2 px-3 text-sm font-medium transition-all ${
      is_active ? 'bg-primary text-primary-text shadow-md' : 'text-text-muted hover:text-text hover:bg-bg-card'
    }`
  }

  return (
    <div
      ref={backdrop_ref}
      class="fixed inset-0 z-[100] overflow-y-auto overscroll-contain bg-black/60 backdrop-blur-sm"
      onMouseDown={(e) => {
        press_started_on_backdrop = is_backdrop(e.target)
      }}
      onClick={(e) => {
        const should_close = press_started_on_backdrop && is_backdrop(e.target)
        press_started_on_backdrop = false
        if (should_close) props.onClose()
      }}
    >
      <div ref={wrapper_ref} class="flex min-h-full items-center justify-center p-4">
        <div
          ref={(el) => {
            panel_ref = el
            focus_trap.activate()
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby={title_id}
          tabindex="-1"
          class="bg-bg-card rounded-2xl border border-border p-8 max-w-md w-full shadow-2xl outline-none animate-in fade-in zoom-in duration-200"
        >
          {/* Header */}
          <div class="flex items-start justify-between mb-6">
            <div class="flex items-center gap-3">
              <div class="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <LockIcon class="w-6 h-6 text-primary" />
              </div>
              <div>
                <h2 id={title_id} class="text-xl font-bold text-text">
                  Login Required
                </h2>
                <p class="text-sm text-text-muted">Hive authentication</p>
              </div>
            </div>
            <button
              type="button"
              onClick={props.onClose}
              class="text-text-muted hover:text-text hover:bg-bg-secondary rounded-lg p-1.5 transition-colors"
              aria-label="Close login modal"
            >
              <CloseIcon class="w-5 h-5" />
            </button>
          </div>

          {/* Description */}
          <p class="text-text-muted mb-6 leading-relaxed">
            Sign in with your Hive account to save your blog configuration to the blockchain. Your settings will be
            stored permanently and loaded automatically.
          </p>

          {/* Flat login method tabs */}
          <div
            class="flex rounded-xl bg-bg-secondary border border-border p-1 mb-6 gap-1"
            role="group"
            aria-label="Login method"
          >
            <button
              type="button"
              aria-pressed={login_method() === 'hbauth-login'}
              onClick={() => setLoginMethod('hbauth-login')}
              class={tab_class('hbauth-login')}
            >
              Login
            </button>
            <button
              type="button"
              aria-pressed={login_method() === 'hbauth-register'}
              onClick={() => setLoginMethod('hbauth-register')}
              class={tab_class('hbauth-register')}
            >
              Register Key
            </button>
            <Show when={keychain_available()}>
              <button
                type="button"
                aria-pressed={login_method() === 'keychain'}
                onClick={() => setLoginMethod('keychain')}
                class={tab_class('keychain')}
              >
                Keychain
              </button>
            </Show>
            <Show when={dev_login_available()}>
              <DevLoginTab
                pressed={login_method() === 'dev'}
                on_select={() => setLoginMethod('dev')}
                class={tab_class('dev')}
              />
            </Show>
          </div>

          {/* Login form */}
          <Switch
            fallback={
              <HBAuthLogin mode={hbauth_mode()} onModeChange={handle_mode_change} onSuccess={props.onSuccess} />
            }
          >
            <Match when={login_method() === 'keychain'}>
              <KeychainLogin onSuccess={props.onSuccess} />
            </Match>
            <Match when={import.meta.env.DEV && login_method() === 'dev'}>
              <DevLoginForm default_username={props.dev_login_username} on_login={props.onSuccess} />
            </Match>
          </Switch>
        </div>
      </div>
    </div>
  )
}
