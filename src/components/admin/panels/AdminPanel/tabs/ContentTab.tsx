// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { Show, createUniqueId, type JSX } from 'solid-js'
import { is_community_mode } from '../../../queries'
import { SiteSettings } from '../../../settings/SiteSettings'
import { PagesSettings, type PagesSettingsProps } from '../../../settings/PagesSettings'
import { SocialLinksSettings } from '../../../settings/SocialLinksSettings'
import { CommunityDisplaySettings } from '../../../settings/CommunityDisplaySettings'
import { PinnedPosts } from '../../../canvas/popovers/PostsPopover'

export type ContentGroup = 'site' | 'pages' | 'social' | 'pinned' | 'community'

/** DOM id of a Content tab group, so callers (e.g. "Edit site" in HeaderPopover) can scroll it into view. */
export function content_group_id(group: ContentGroup): string {
  return `admin-content-${group}`
}

function Group(props: { id: ContentGroup; title: string; children: JSX.Element }) {
  const heading_id = `content-group-${createUniqueId()}`
  return (
    <section
      id={content_group_id(props.id)}
      aria-labelledby={heading_id}
      class="flex scroll-mt-2 flex-col gap-3 border-b border-border px-4 py-4 last:border-b-0"
    >
      <h3 id={heading_id} class="text-xs font-semibold uppercase text-text-muted">
        {props.title}
      </h3>
      {props.children}
    </section>
  )
}

/** Site-wide content; moderation stays a separate editor mode (ADR 6ac6089d). */
export function ContentTab(props: { pages?: PagesSettingsProps }) {
  return (
    <div class="flex flex-col">
      <Group id="site" title="Site">
        <SiteSettings />
      </Group>
      <Group id="pages" title="Pages">
        <PagesSettings {...props.pages} />
      </Group>
      <Group id="social" title="Social links">
        <SocialLinksSettings />
      </Group>
      <Group id="pinned" title="Pinned posts">
        <PinnedPosts show_title={false} />
      </Group>
      <Show when={is_community_mode()}>
        <Group id="community" title="Community">
          <CommunityDisplaySettings />
        </Group>
      </Show>
    </div>
  )
}
