// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createMemo, createSignal } from 'solid-js'
import { clear_instance_override, settings } from '../../queries'
import { commentCardElementLabels, migrateCardLayout } from '../../types/layout'
import { defaultSettings } from '../../types/settings'
import { resolve_instance_settings } from '../../../../lib/instance-overrides'
import {
  createCommentCardData,
  createCommentCardSettings,
  renderCommentCardContent,
} from '../../../../shared/components/comment-card'
import { create_mock_comments } from '../mocks'
import { CardLayoutDnd } from './CardLayoutDnd'
import { PopoverShell, slot_label, type PopoverScope } from './PopoverShell'
import {
  GlobalGroup,
  SizeSlider,
  element_label,
  has_instance_overrides,
  type ElementControlsProps,
  type ElementPopoverProps,
} from './PostCardPopover'

function CommentPreview(props: { section_id: string; element_id: string }) {
  const comment = createCommentCardData(create_mock_comments()[0])
  const html = createMemo(() => {
    const resolved = resolve_instance_settings(settings, props.section_id, props.element_id)
    return renderCommentCardContent(
      comment,
      createCommentCardSettings({
        ...resolved,
        commentCardLayout: migrateCardLayout(resolved.commentCardLayout) ?? defaultSettings.commentCardLayout,
      })
    )
  })
  // Rendered from static mock data with the same shared renderer the blog uses.
  return <article class="rounded-xl border border-border bg-bg-card" innerHTML={html()} />
}

export function CommentsControls(props: ElementControlsProps) {
  return (
    <>
      <SizeSlider {...props} setting="commentAvatarSizePx" label="Avatar size" unit="px" />
      <SizeSlider {...props} setting="commentPaddingPx" label="Comment padding" unit="px" />
      <SizeSlider {...props} setting="commentMaxLength" label="Comment length" unit="chars" step={50} />
      <GlobalGroup>
        <CardLayoutDnd
          layout_key="commentCardLayout"
          element_labels={commentCardElementLabels}
          label="Comment card layout"
          preview={<CommentPreview section_id={props.section_id} element_id={props.element_id} />}
        />
      </GlobalGroup>
    </>
  )
}

export function CommentsPopover(props: ElementPopoverProps) {
  const [scope, set_scope] = createSignal<PopoverScope>('instance')

  return (
    <PopoverShell
      open
      anchor={props.anchor}
      onClose={props.on_close}
      element_label={`${element_label(props.element_id)} · comments`}
      slot_label={slot_label(props.slot)}
      scope={scope()}
      onScopeChange={set_scope}
      onResetInstance={
        scope() === 'instance' ? () => clear_instance_override(props.section_id, props.element_id) : undefined
      }
      has_instance_overrides={has_instance_overrides(props.section_id, props.element_id)}
    >
      <CommentsControls section_id={props.section_id} element_id={props.element_id} scope={scope()} />
    </PopoverShell>
  )
}
