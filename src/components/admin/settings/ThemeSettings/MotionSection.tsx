// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { Show } from 'solid-js'
import { Select, Slider } from '../../../ui'
import { cardHoverEffectOptions, cardHoverShadowOptions, scrollAnimationTypeOptions } from '../../types/index'
import type { SettingsData } from '../../types/settings'
import { Disclosure } from './controls'
import type { StyleChange } from './style-macros'

type MotionSettings = Pick<
  SettingsData,
  | 'cardHoverEffect'
  | 'cardTransitionDuration'
  | 'cardHoverShadow'
  | 'cardHoverScale'
  | 'cardHoverBrightness'
  | 'scrollAnimationType'
  | 'scrollAnimationDuration'
  | 'scrollAnimationDelay'
>

interface MotionSectionProps {
  settings: MotionSettings
  on_change: StyleChange
}

export function MotionSection(props: MotionSectionProps) {
  const hover = () => props.settings.cardHoverEffect
  const scroll_on = () => props.settings.scrollAnimationType !== 'none'

  return (
    <div class="space-y-4">
      <Select
        label="Hover effect"
        options={cardHoverEffectOptions}
        value={hover()}
        onChange={(e) =>
          props.on_change(
            { cardHoverEffect: e.currentTarget.value as SettingsData['cardHoverEffect'] },
            'Changed hover effect'
          )
        }
      />
      <Select
        label="Scroll animation"
        options={scrollAnimationTypeOptions}
        value={props.settings.scrollAnimationType}
        onChange={(e) => {
          const type = e.currentTarget.value as SettingsData['scrollAnimationType']
          props.on_change(
            { scrollAnimationType: type, scrollAnimationEnabled: type !== 'none' },
            'Changed scroll animation'
          )
        }}
      />

      <Show when={hover() !== 'none' || scroll_on()}>
        <Disclosure title="Fine-tune">
          <Show when={hover() !== 'none'}>
            <Slider
              label="Transition duration"
              unit="ms"
              min={50}
              max={500}
              step={10}
              value={props.settings.cardTransitionDuration}
              onChange={(val) => props.on_change({ cardTransitionDuration: val }, 'Changed transition duration')}
            />
          </Show>
          <Show when={hover() === 'shadow' || hover() === 'lift'}>
            <Select
              label="Shadow size"
              options={cardHoverShadowOptions}
              value={props.settings.cardHoverShadow}
              onChange={(e) => props.on_change({ cardHoverShadow: e.currentTarget.value }, 'Changed shadow size')}
            />
          </Show>
          <Show when={hover() === 'scale' || hover() === 'lift'}>
            <Slider
              label="Scale"
              min={1}
              max={1.15}
              step={0.01}
              value={props.settings.cardHoverScale}
              onChange={(val) => props.on_change({ cardHoverScale: val }, 'Changed hover scale')}
            />
          </Show>
          <Show when={hover() === 'glow'}>
            <Slider
              label="Glow brightness"
              min={1}
              max={1.2}
              step={0.01}
              value={props.settings.cardHoverBrightness}
              onChange={(val) => props.on_change({ cardHoverBrightness: val }, 'Changed glow brightness')}
            />
          </Show>
          <Show when={scroll_on()}>
            <Slider
              label="Animation duration"
              unit="ms"
              min={100}
              max={1000}
              step={50}
              value={props.settings.scrollAnimationDuration}
              onChange={(val) => props.on_change({ scrollAnimationDuration: val }, 'Changed animation duration')}
            />
            <Slider
              label="Stagger delay"
              unit="ms"
              min={0}
              max={300}
              step={10}
              value={props.settings.scrollAnimationDelay}
              onChange={(val) => props.on_change({ scrollAnimationDelay: val }, 'Changed stagger delay')}
            />
          </Show>
        </Disclosure>
      </Show>
    </div>
  )
}
