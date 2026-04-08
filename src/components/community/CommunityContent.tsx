// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import {
  createSignal,
  createMemo,
  createEffect,
  Show,
  For,
  ErrorBoundary,
  onCleanup,
  onMount,
  type Component,
} from "solid-js";
import {
  QueryClientProvider,
  createQuery,
  hydrate,
  type DehydratedState,
} from "@tanstack/solid-query";
import {
  query_keys,
  fetch_community_posts,
  create_query_client,
  type CommunitySortOrder,
  type FetchCommunityPostsResult,
} from "../../lib/queries";
import type { BridgePost } from "@hiveio/workerbee/blog-logic";
import type { SiteSettings, CardLayout } from "../home/types";
import {
  createPostCardDataFromBridge,
  renderPostCardContent,
  type PostCardSettings,
  type PostCardData,
  type PostsGridSettings,
} from "../../shared/components/post-card";
import { SHADOW_MAP } from "../../shared/constants";
import {
  get_initial_scroll_style,
  get_visible_scroll_style,
} from "../../shared/utils/animations";

// ============================================
// Types
// ============================================

interface CommunityContentProps {
  community_name: string;
  initial_sort: CommunitySortOrder;
  posts_per_page: number;
  settings: SiteSettings;
  dehydrated_state?: string;
  post_card_layout?: CardLayout;
}

// ============================================
// Constants
// ============================================

const ALL_COMMUNITY_TABS: { id: CommunitySortOrder; label: string }[] = [
  { id: "trending", label: "Trending" },
  { id: "hot", label: "Hot" },
  { id: "created", label: "New" },
  { id: "payout", label: "Payouts" },
  { id: "muted", label: "Muted" },
];

const DEFAULT_VISIBLE_SORTS: CommunitySortOrder[] = [
  "trending",
  "hot",
  "created",
  "payout",
];

// ============================================
// Community Posts Grid
// ============================================

const CommunityPostsGrid: Component<{
  posts: BridgePost[];
  settings: SiteSettings;
  layout?: CardLayout;
}> = (props) => {
  const card_settings = createMemo(
    (): PostCardSettings => ({
      thumbnailSizePx: props.settings.thumbnailSizePx || 96,
      cardPaddingPx: props.settings.cardPaddingPx || 24,
      cardBorderRadiusPx: props.settings.cardBorderRadiusPx || 16,
      titleSizePx: props.settings.titleSizePx || 20,
      summaryMaxLength: props.settings.summaryMaxLength || 150,
      maxTags: props.settings.maxTags || 5,
      cardBorder: props.settings.cardBorder !== false,
      postCardLayout: props.layout || props.settings.postCardLayout,
      cardHoverEffect: props.settings.cardHoverEffect || "none",
      cardTransitionDuration: props.settings.cardTransitionDuration || 200,
      cardHoverScale: props.settings.cardHoverScale || 1.02,
      cardHoverShadow: props.settings.cardHoverShadow || "lg",
      cardHoverBrightness: props.settings.cardHoverBrightness || 1.05,
    })
  );

  const grid_settings = createMemo(
    (): PostsGridSettings => ({
      layout: props.settings.postsLayout || "list",
      columns: props.settings.gridColumns || 2,
      gap_px: props.settings.cardGapPx || 24,
    })
  );

  // Separate pinned and regular posts
  const pinned_posts = createMemo(() =>
    props.posts.filter((p) => p.stats?.is_pinned === true)
  );

  const regular_posts = createMemo(() =>
    props.posts.filter((p) => p.stats?.is_pinned !== true)
  );

  const render_post_list = (posts: BridgePost[], show_pinned_badge: boolean) => (
    <Show
      when={posts.length > 0}
      fallback={
        <div class="text-center py-8 bg-bg-card rounded-xl border border-border">
          <p class="text-text-muted">No posts found</p>
        </div>
      }
    >
      {/* List layout */}
      <Show when={grid_settings().layout === "list"}>
        <div
          style={`display: flex; flex-direction: column; gap: ${grid_settings().gap_px}px;`}
        >
          <For each={posts}>
            {(post, index) => (
              <CommunityPostCard
                post={post}
                settings={props.settings}
                card_settings={card_settings()}
                is_vertical={false}
                index={index()}
                show_pinned={show_pinned_badge}
              />
            )}
          </For>
        </div>
      </Show>
      {/* Masonry layout */}
      <Show when={grid_settings().layout === "masonry"}>
        <div
          style={`column-count: ${grid_settings().columns}; column-gap: ${grid_settings().gap_px}px;`}
        >
          <For each={posts}>
            {(post, index) => (
              <div
                style={`break-inside: avoid; margin-bottom: ${grid_settings().gap_px}px;`}
              >
                <CommunityPostCard
                  post={post}
                  settings={props.settings}
                  card_settings={card_settings()}
                  is_vertical={true}
                  index={index()}
                  show_pinned={show_pinned_badge}
                />
              </div>
            )}
          </For>
        </div>
      </Show>
      {/* Grid layout */}
      <Show when={grid_settings().layout === "grid"}>
        <div
          style={`display: grid; grid-template-columns: repeat(${grid_settings().columns}, 1fr); gap: ${grid_settings().gap_px}px;`}
        >
          <For each={posts}>
            {(post, index) => (
              <CommunityPostCard
                post={post}
                settings={props.settings}
                card_settings={card_settings()}
                is_vertical={true}
                index={index()}
                show_pinned={show_pinned_badge}
              />
            )}
          </For>
        </div>
      </Show>
    </Show>
  );

  return (
    <div>
      {/* Pinned posts are always rendered first to ensure visibility at the top */}
      <Show when={pinned_posts().length > 0}>
        <div class="flex items-center gap-2 mb-3">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="text-text-muted"
            aria-hidden="true"
          >
            <path d="M12 17v5" />
            <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
          </svg>
          <span class="text-sm font-medium text-text-muted">Pinned</span>
        </div>
        {render_post_list(pinned_posts(), true)}
        <Show when={regular_posts().length > 0}>
          <div class="border-t border-border my-6" aria-hidden="true" />
        </Show>
      </Show>
      {/* Regular (non-pinned) posts */}
      <Show when={regular_posts().length > 0}>
        {render_post_list(regular_posts(), false)}
      </Show>
    </div>
  );
};

// ============================================
// Single Community Post Card
// ============================================

const CommunityPostCard: Component<{
  post: BridgePost;
  settings: SiteSettings;
  card_settings: PostCardSettings;
  is_vertical: boolean;
  index: number;
  show_pinned: boolean;
}> = (props) => {
  const effective_vertical = () =>
    props.is_vertical ||
    props.settings.cardLayout === "vertical" ||
    props.settings.postsLayout !== "list";

  const [is_hovered, set_is_hovered] = createSignal(false);
  const [is_visible, set_is_visible] = createSignal(false);

  const handle_post_click = () => {
    window.location.href = `/${props.post.author}/${props.post.permlink}`;
  };

  onMount(() => {
    if (
      props.settings.scrollAnimationType !== "none" &&
      props.settings.scrollAnimationEnabled
    ) {
      const delay = props.index * (props.settings.scrollAnimationDelay || 100);
      setTimeout(() => set_is_visible(true), delay);
    } else {
      set_is_visible(true);
    }
  });

  const post_data = createMemo((): PostCardData => {
    return createPostCardDataFromBridge(props.post, {
      thumbnailSizePx: props.settings.thumbnailSizePx || 96,
      maxTags: props.settings.maxTags || 5,
    });
  });

  const content_html = createMemo(() => {
    const data = post_data();
    return renderPostCardContent(data, props.card_settings, effective_vertical());
  });

  const card_style = createMemo(() => {
    const effect = props.settings.cardHoverEffect || "none";
    const hover_duration = props.settings.cardTransitionDuration || 200;
    const scroll_duration = props.settings.scrollAnimationDuration || 400;
    const scroll_type = props.settings.scrollAnimationType || "none";
    const scale = props.settings.cardHoverScale || 1.02;
    const shadow = props.settings.cardHoverShadow || "lg";
    const brightness = props.settings.cardHoverBrightness || 1.05;

    const styles: Record<string, string> = {
      padding: `${props.settings.cardPaddingPx || 24}px`,
      "border-radius": `${props.settings.cardBorderRadiusPx || 16}px`,
      border:
        props.settings.cardBorder !== false
          ? "1px solid var(--color-border)"
          : "1px solid transparent",
      transition: `all ${scroll_duration}ms ease-out, box-shadow ${hover_duration}ms ease-out, transform ${hover_duration}ms ease-out, filter ${hover_duration}ms ease-out`,
    };

    if (!is_visible() && scroll_type !== "none") {
      Object.assign(styles, get_initial_scroll_style(scroll_type));
    } else if (is_visible()) {
      Object.assign(styles, get_visible_scroll_style());
    }

    if (is_hovered() && effect !== "none") {
      if (effect === "shadow") {
        styles["box-shadow"] = SHADOW_MAP[shadow] || SHADOW_MAP.md;
      } else if (effect === "scale") {
        styles.transform = `scale(${scale})`;
      } else if (effect === "lift") {
        styles.transform = `scale(${scale}) translateY(-4px)`;
        styles["box-shadow"] = SHADOW_MAP[shadow] || SHADOW_MAP.lg;
      } else if (effect === "glow") {
        styles.filter = `brightness(${brightness})`;
        styles["box-shadow"] = "0 0 20px var(--color-primary)";
      }
    }

    return Object.entries(styles)
      .map(([key, value]) => `${key}: ${value}`)
      .join("; ");
  });

  return (
    <article
      class={`rounded-xl overflow-hidden cursor-pointer relative ${props.show_pinned ? "bg-primary/5" : "bg-bg-card"}`}
      style={card_style()}
      onMouseEnter={() => set_is_hovered(true)}
      onMouseLeave={() => set_is_hovered(false)}
      onClick={handle_post_click}
    >
      <Show when={props.show_pinned}>
        <div class="absolute top-2 right-2 z-10 px-2 py-0.5 bg-primary/90 text-primary-text text-xs font-medium rounded-full">
          Pinned
        </div>
      </Show>
      <div innerHTML={content_html()} />
    </article>
  );
};

// ============================================
// Main Inner Component
// ============================================

const CommunityContentInner: Component<CommunityContentProps> = (props) => {
  const visible_tabs = createMemo(() => {
    const visible = props.settings.community_visible_sorts;
    const allowed =
      Array.isArray(visible) && visible.length > 0
        ? visible
        : DEFAULT_VISIBLE_SORTS;
    return ALL_COMMUNITY_TABS.filter((tab) => allowed.includes(tab.id));
  });

  const [active_sort, set_active_sort] = createSignal<CommunitySortOrder>(
    props.initial_sort
  );
  const [cursor_author, set_cursor_author] = createSignal<string | undefined>(
    undefined
  );
  const [cursor_permlink, set_cursor_permlink] = createSignal<
    string | undefined
  >(undefined);

  const posts_query = createQuery(() => ({
    queryKey: query_keys.community_posts(
      props.community_name,
      active_sort(),
      props.posts_per_page,
      cursor_author(),
      cursor_permlink()
    ),
    queryFn: () =>
      fetch_community_posts(
        props.community_name,
        active_sort(),
        props.posts_per_page,
        cursor_author(),
        cursor_permlink()
      ),
    staleTime: 1000 * 60 * 5,
  }));

  const handle_sort_change = (sort: CommunitySortOrder) => {
    set_active_sort(sort);
    set_cursor_author(undefined);
    set_cursor_permlink(undefined);
  };

  const handle_next_page = () => {
    const data = posts_query.data;
    if (data?.next_author && data?.next_permlink) {
      set_cursor_author(data.next_author);
      set_cursor_permlink(data.next_permlink);
    }
  };

  const handle_first_page = () => {
    set_cursor_author(undefined);
    set_cursor_permlink(undefined);
  };

  const has_cursor = () =>
    cursor_author() !== undefined && cursor_permlink() !== undefined;

  return (
    <div>
      {/* Sort Tabs */}
      <nav class="border-b border-border mb-6">
        <div class="flex flex-wrap">
          <For each={visible_tabs()}>
            {(tab) => (
              <button
                type="button"
                class={`relative px-4 py-3 text-sm font-medium transition-colors hover:bg-bg-card/50 ${
                  active_sort() === tab.id
                    ? "text-text"
                    : "text-text-muted hover:text-text"
                }`}
                onClick={() => handle_sort_change(tab.id)}
              >
                <span class="flex items-center gap-2">{tab.label}</span>
                <Show when={active_sort() === tab.id}>
                  <span class="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-t-full" />
                </Show>
              </button>
            )}
          </For>
        </div>
      </nav>

      {/* Loading */}
      <Show when={posts_query.isLoading}>
        <div class="text-center py-12 text-text-muted">Loading posts...</div>
      </Show>

      {/* Error */}
      <Show when={posts_query.isError}>
        <div class="bg-error/10 border border-error/30 text-error px-4 py-3 rounded-lg">
          Error loading posts: {String(posts_query.error)}
        </div>
      </Show>

      {/* Posts */}
      <Show when={posts_query.data}>
        <CommunityPostsGrid
          posts={posts_query.data?.posts || []}
          settings={props.settings}
          layout={props.post_card_layout}
        />
      </Show>

      {/* Pagination */}
      <Show when={!posts_query.isLoading}>
        <div class="flex justify-between items-center mt-8">
          <Show when={has_cursor()} fallback={<div />}>
            <button
              onClick={handle_first_page}
              class="px-4 py-2 bg-bg-card border border-border rounded-lg text-text hover:bg-primary hover:text-primary-text hover:border-primary transition-colors"
            >
              First page
            </button>
          </Show>
          <Show when={posts_query.data?.has_more}>
            <button
              onClick={handle_next_page}
              class="px-4 py-2 bg-primary text-primary-text rounded-lg hover:bg-primary-hover transition-colors"
            >
              Next page
            </button>
          </Show>
        </div>
      </Show>
    </div>
  );
};

// ============================================
// Wrapper with QueryClientProvider
// ============================================

const CommunityContent: Component<CommunityContentProps> = (props) => {
  const [query_client] = createSignal(create_query_client());

  onCleanup(() => {
    query_client().clear();
  });

  createEffect(() => {
    if (props.dehydrated_state) {
      const parsed: DehydratedState = JSON.parse(props.dehydrated_state);
      hydrate(query_client(), parsed);
    }
  });

  return (
    <ErrorBoundary
      fallback={() => (
        <div class="bg-error/10 text-error p-4 rounded-lg">
          Failed to load community content. Please refresh the page.
        </div>
      )}
    >
      <QueryClientProvider client={query_client()}>
        <CommunityContentInner {...props} />
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export { CommunityContent };
