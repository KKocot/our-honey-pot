// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

/**
 * ElementRenderer - SolidJS component
 * Renders individual page elements (header, navigation, authorProfile, posts, footer)
 */

import { Show, For, createMemo, type Accessor } from 'solid-js'
import { settings as global_settings } from '../../../components/admin/store'
import type { SettingsData } from '../../../components/admin/types/settings'
import type { HiveData } from '../../../components/admin/queries'
import type { BridgePost } from '@hiveio/workerbee/blog-logic'
import {
  createAuthorProfileData,
  createAuthorProfileSettings,
  pickAuthorProfileSizes,
  renderAuthorProfileSections,
  renderSocialLinks,
} from '../author-profile'
import { createCommentCardData, createCommentCardSettings, renderCommentCardContent } from '../comment-card'
import { renderNavigationButtons, hasNavigationContent, type NavigationSettings } from '../navigation'
import { createOwnerNavConfig, type NavSourceSettings } from '../navigation/utils'
import { SITE_TOPBAR_CLASS, SITE_TOPBAR_ROW_CLASS, renderSiteTopbar } from '../navigation/render'
import { renderSiteHeader } from '../header'
import { usePageSlot } from '../header/slot-context'
import type { PageSlotPosition } from '../page-layout/types'
import { createSiteHeaderData, resolveSiteName, type SiteIdentityContext } from '../header/utils'
import { home_hero_shown } from '../sections'
import { renderFooter as renderFooterHtml } from '../footer'
import { createFooterRenderInput } from '../footer/utils'
import { format_date, t, t_count } from '../../../lib/i18n'
import { PostCard } from './PostCard'
import { render_comment_body } from '../../../lib/comment_renderer'
import { CommunityProfile } from '../../../components/community/CommunityProfile'
import { CommunitySidebar } from '../../../components/community/CommunitySidebar'
import type { HiveCommunity } from '../../../lib/types/community'

interface ElementRendererProps {
  elementId: string
  inSidebar?: boolean
  activeTab?: Accessor<string>
  setActiveTab?: (tab: string) => void
  data?: Accessor<HiveData | null>
  community_title?: string
  community_posts?: BridgePost[]
  community?: HiveCommunity | null
  /** Settings of one layout instance (admin canvas); defaults to the global settings store. */
  settings?: SettingsData
  /** Section id, keeps the mobile nav menu id unique per page (same id as SlotRenderer.astro). */
  sectionId?: string
  /** Page slot of the element; picks the header variant like SlotRenderer.astro (else PageSlotContext, then inSidebar). */
  slot?: PageSlotPosition
}

const NUMERIC_DATE: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'numeric', day: 'numeric' }

// community_title is undefined in user mode, empty string or title in community mode
function site_context(community_title?: string, community?: HiveCommunity | null): SiteIdentityContext {
  return { community_title, community_about: community?.about }
}

function renderHeader(
  settings: SettingsData,
  slot: PageSlotPosition,
  community_title?: string,
  community?: HiveCommunity | null
) {
  // Same rule as SSR (SlotRenderer.astro): a rendered hero owns the page H1.
  const data = {
    ...createSiteHeaderData(settings, site_context(community_title, community)),
    site_name_heading: !home_hero_shown(settings),
  }
  return <div innerHTML={renderSiteHeader(data, slot)} />
}

// Render author profile element using shared components
function renderAuthorProfile(
  settings: SettingsData,
  _layout: 'horizontal' | 'vertical' = 'horizontal',
  data: Accessor<HiveData | null>
) {
  const currentData = data()
  const profile = currentData?.profile
  const dbAccount = currentData?.dbAccount
  const globalProps = currentData?.globalProps
  if (!profile) return null

  // Create normalized data using shared utility
  const profileData = createAuthorProfileData(
    profile.name,
    profile,
    dbAccount ?? null,
    globalProps ?? null,
    null // manabars not available in preview
  )

  // Create settings using shared utility
  const profileSettings = createAuthorProfileSettings({
    ...pickAuthorProfileSizes(settings),
    authorProfileLayout2: settings.authorProfileLayout2,
    socialLinks: settings.socialLinks,
  })

  // Render using shared functions
  const sectionsHtml = renderAuthorProfileSections(profileData, profileSettings)
  const socialLinksHtml = renderSocialLinks(profileSettings.socialLinks)

  return (
    <div class="bg-bg-card rounded-token-lg shadow-sm border border-border overflow-hidden p-4">
      <div class="space-y-2" innerHTML={sectionsHtml} />
      <Show when={socialLinksHtml}>
        <div innerHTML={socialLinksHtml} />
      </Show>
    </div>
  )
}

// Render footer element using shared component
function renderFooter(settings: SettingsData, community_title?: string) {
  const input = createFooterRenderInput(
    settings,
    resolveSiteName(settings, site_context(community_title)),
    new Date().getFullYear()
  )
  return <div innerHTML={renderFooterHtml(input.data, undefined, input.owner, input.locale)} />
}

// Posts component - reactive
function PostsSection(props: {
  settings: Accessor<SettingsData>
  data: Accessor<HiveData | null>
  community_posts?: BridgePost[]
}) {
  const settings = () => props.settings()
  const posts = () => props.community_posts ?? props.data()?.posts ?? []

  const gridSettings = createMemo(() => ({
    layout: settings().postsLayout || 'grid',
    columns: settings().gridColumns || 2,
    gap_px: settings().cardGapPx || 24,
  }))

  return (
    <div>
      <Show
        when={posts().length > 0}
        fallback={
          <div class="text-center py-8 bg-bg-card rounded-xl border border-border">
            <p class="text-text-muted">{t(settings().locale, 'posts.empty')}</p>
          </div>
        }
      >
        {/* List layout */}
        <Show when={gridSettings().layout === 'list'}>
          <div style={`display: flex; flex-direction: column; gap: ${gridSettings().gap_px}px;`}>
            <For each={posts()}>
              {(post, index) => (
                <PostCard
                  post={post}
                  forceVertical={false}
                  index={index()}
                  layout={settings().postCardLayout}
                  settings={settings()}
                />
              )}
            </For>
          </div>
        </Show>
        {/* Masonry layout */}
        <Show when={gridSettings().layout === 'masonry'}>
          <div style={`column-count: ${gridSettings().columns}; column-gap: ${gridSettings().gap_px}px;`}>
            <For each={posts()}>
              {(post, index) => (
                <div style={`break-inside: avoid; margin-bottom: ${gridSettings().gap_px}px;`}>
                  <PostCard
                    post={post}
                    forceVertical={true}
                    index={index()}
                    layout={settings().postCardLayout}
                    settings={settings()}
                  />
                </div>
              )}
            </For>
          </div>
        </Show>
        {/* Grid layout */}
        <Show when={gridSettings().layout === 'grid'}>
          <div
            style={`display: grid; grid-template-columns: repeat(${gridSettings().columns}, 1fr); gap: ${gridSettings().gap_px}px;`}
          >
            <For each={posts()}>
              {(post, index) => (
                <PostCard
                  post={post}
                  forceVertical={true}
                  index={index()}
                  layout={settings().postCardLayout}
                  settings={settings()}
                />
              )}
            </For>
          </div>
        </Show>
      </Show>
    </div>
  )
}

// Comments section - displays user's comments from Hive
function CommentsSection(props: { settings: Accessor<SettingsData>; data: Accessor<HiveData | null> }) {
  const settings = () => props.settings()
  const comments = () => props.data()?.comments || []

  // Create comment settings from current settings
  const commentSettings = createMemo(() =>
    createCommentCardSettings({
      commentShowAuthor: settings().commentShowAuthor,
      commentShowAvatar: settings().commentShowAvatar,
      commentAvatarSizePx: settings().commentAvatarSizePx,
      commentShowReplyContext: settings().commentShowReplyContext,
      commentShowTimestamp: settings().commentShowTimestamp,
      commentShowRepliesCount: settings().commentShowRepliesCount,
      commentShowVotes: settings().commentShowVotes,
      commentShowPayout: settings().commentShowPayout,
      commentMaxLength: settings().commentMaxLength,
      commentPaddingPx: settings().commentPaddingPx,
      commentCardLayout: settings().commentCardLayout,
    })
  )

  return (
    <div class="space-y-4">
      <Show
        when={comments().length > 0}
        fallback={
          <div class="text-center py-8 bg-bg-card rounded-xl border border-border">
            <p class="text-text-muted">{t(settings().locale, 'comments.empty')}</p>
          </div>
        }
      >
        <For each={comments()}>
          {(comment) => {
            // Create normalized comment data using shared utility
            const commentData = createCommentCardData(comment)
            // Render using shared function
            const contentHtml = renderCommentCardContent(commentData, commentSettings())

            return <article class="bg-bg-card rounded-xl border border-border" innerHTML={contentHtml} />
          }}
        </For>
      </Show>
    </div>
  )
}

// Threads section - displays comments from author's "My Threads" post as short posts
function ThreadsSection(props: { settings: Accessor<SettingsData>; data: Accessor<HiveData | null> }) {
  const locale = () => props.settings().locale
  const threads = () => props.data()?.threads || []

  return (
    <div class="space-y-4">
      <Show
        when={threads().length > 0}
        fallback={
          <div class="text-center py-8 bg-bg-card rounded-xl border border-border">
            <p class="text-text-muted">{t(locale(), 'threads.empty')}</p>
            <p class="text-text-muted text-xs mt-2">{t(locale(), 'threads.empty_hint')}</p>
          </div>
        }
      >
        <For each={threads()}>
          {(thread) => (
            <article class="bg-bg-card rounded-xl border border-border p-4">
              <div class="prose prose-sm max-w-none text-text" innerHTML={render_comment_body(thread.body)} />
              <div class="flex items-center gap-3 mt-3 pt-3 border-t border-border text-xs text-text-muted">
                <time>{format_date(locale(), thread.created, NUMERIC_DATE)}</time>
                <Show when={thread.children > 0}>
                  <span>{t_count(locale(), 'count.replies', thread.children)}</span>
                </Show>
                <Show when={thread.stats?.total_votes > 0}>
                  <span>{t_count(locale(), 'count.votes', thread.stats.total_votes)}</span>
                </Show>
              </div>
            </article>
          )}
        </For>
      </Show>
    </div>
  )
}

// Main content section that switches based on active tab
function MainContentSection(props: {
  settings: Accessor<SettingsData>
  activeTab: Accessor<string>
  data: Accessor<HiveData | null>
  community_posts?: BridgePost[]
}) {
  const settings = () => props.settings()
  const active_category_tag = createMemo(() => {
    const tab = (settings().navigationTabs || []).find((t) => t.id === props.activeTab())
    return tab?.tag || null
  })

  const is_posts_or_category = createMemo(() => props.activeTab() === 'posts' || !!active_category_tag())

  const filtered_posts = createMemo(() => {
    const all_posts = props.community_posts ?? props.data()?.posts ?? []
    const tag = active_category_tag()
    if (!tag) return all_posts
    return all_posts.filter((post) => post.json_metadata?.tags?.includes(tag))
  })

  return (
    <>
      <Show when={is_posts_or_category()}>
        <PostsSection settings={props.settings} data={props.data} community_posts={filtered_posts()} />
      </Show>
      <Show when={props.activeTab() === 'comments'}>
        <CommentsSection settings={props.settings} data={props.data} />
      </Show>
      <Show when={props.activeTab() === 'threads'}>
        <ThreadsSection settings={props.settings} data={props.data} />
      </Show>
    </>
  )
}

// Navigation preview component - uses settings.navigationTabs with shared utilities
function NavigationPreview(props: {
  settings: Accessor<SettingsData>
  activeTab: Accessor<string>
  setActiveTab: (tab: string) => void
  sectionId?: string
}) {
  const settings = () => props.settings()
  const ownerNav = createMemo(() => createOwnerNavConfig(settings(), props.sectionId))
  const showNav = createMemo(() =>
    hasNavigationContent({ tabs: settings().navigationTabs, links: ownerNav().links, cta: ownerNav().cta })
  )

  const navSettings = createMemo((): NavigationSettings => ({
    tabs: (settings().navigationTabs || [])
      .filter((t) => t.enabled)
      .map((t) => ({
        id: t.id,
        label: t.label,
        enabled: t.enabled,
        showCount: false,
        tooltip: t.tooltip,
      })),
    activeTab: props.activeTab(),
    postsCount: 0,
    commentsCount: 0,
    ...ownerNav(),
  }))

  const navHtml = createMemo(() => renderNavigationButtons(navSettings()))

  // Event delegation for tab clicks
  const handleNavClick = (e: MouseEvent) => {
    // Owner links are real anchors; the canvas must not navigate away from the editor.
    if ((e.target as HTMLElement).closest('a')) e.preventDefault()
    const target = (e.target as HTMLElement).closest('[data-tab]')
    if (target) {
      const tab = (target as HTMLElement).dataset.tab
      if (tab) props.setActiveTab(tab)
    }
  }

  return (
    <Show when={showNav()}>
      <div onClick={handleNavClick} innerHTML={navHtml()} />
    </Show>
  )
}

/** Site top bar (name + community owner nav) of the canvas; same renderer and classes as Layout.astro, minus login. */
export function SiteTopbar(props: { siteName: string; nav?: NavSourceSettings }) {
  const html = createMemo(() => renderSiteTopbar({ site_name: props.siteName, nav: props.nav }))
  // Owner links are real anchors; the canvas must not navigate away from the editor.
  const prevent_navigation = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest('a')) e.preventDefault()
  }
  return (
    <div class={SITE_TOPBAR_CLASS}>
      <div class={SITE_TOPBAR_ROW_CLASS} onClick={prevent_navigation} innerHTML={html()} />
    </div>
  )
}

export function ElementRenderer(props: ElementRendererProps) {
  const settings = (): SettingsData => props.settings ?? global_settings
  const context_slot = usePageSlot()
  const slot = (): PageSlotPosition => props.slot ?? context_slot ?? (props.inSidebar ? 'sidebar-left' : 'top')
  return (
    <>
      <Show when={props.elementId === 'header'}>
        {renderHeader(settings(), slot(), props.community_title, props.community)}
      </Show>
      <Show when={props.elementId === 'authorProfile'}>
        {renderAuthorProfile(
          settings(),
          props.inSidebar ? 'vertical' : settings().authorProfileLayout || 'horizontal',
          props.data!
        )}
      </Show>
      <Show when={props.elementId === 'posts'}>
        <MainContentSection
          settings={settings}
          activeTab={props.activeTab!}
          data={props.data!}
          community_posts={props.community_posts}
        />
      </Show>
      <Show when={props.elementId === 'footer'}>{renderFooter(settings(), props.community_title)}</Show>
      <Show when={props.elementId === 'navigation'}>
        <Show when={props.community_title === undefined}>
          <NavigationPreview
            settings={settings}
            activeTab={props.activeTab!}
            setActiveTab={props.setActiveTab!}
            sectionId={props.sectionId}
          />
        </Show>
      </Show>
      <Show when={props.elementId === 'communityProfile' && props.community}>
        {(community) => (
          <CommunityProfile
            community={community()}
            show_subscribers={settings().community_show_subscribers !== false}
            avatar_size_px={settings().community_avatar_size_px}
            title_size_px={settings().community_title_size_px}
            about_size_px={settings().community_about_size_px}
          />
        )}
      </Show>
      <Show when={props.elementId === 'communitySidebar' && props.community}>
        {(community) => (
          <CommunitySidebar
            community={community()}
            show_description={settings().community_show_description !== false}
            show_rules={settings().community_show_rules !== false}
            show_leadership={settings().community_show_leadership !== false}
          />
        )}
      </Show>
    </>
  )
}
