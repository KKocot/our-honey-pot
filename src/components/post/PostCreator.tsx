// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createSignal, Show, type Component } from "solid-js";
import { MarkdownEditor } from "../editor/MarkdownEditor";
import { currentUser, isAuthenticated } from "../auth/auth-store";
import { broadcast_comment, broadcast_comment_with_options } from "../../lib/broadcast";
import { sign_comment } from "../../lib/signer-relay";

// ============================================
// Types
// ============================================

interface PostCreatorProps {
  community_name: string;
}

type PostStatus = "idle" | "sending" | "success" | "error";

// ============================================
// Helpers
// ============================================

function generate_permlink(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 200);
  return `${slug}-${Date.now().toString(36)}`;
}

// ============================================
// Component
// ============================================

export const PostCreator: Component<PostCreatorProps> = (props) => {
  const [title, set_title] = createSignal("");
  const [body, set_body] = createSignal("");
  const [tags, set_tags] = createSignal("");
  const [status, set_status] = createSignal<PostStatus>("idle");
  const [error_msg, set_error_msg] = createSignal("");
  const [tx_id, set_tx_id] = createSignal("");

  const TITLE_MAX = 256;
  const BODY_MIN = 50;

  const can_submit = () =>
    title().trim().length > 0 &&
    title().trim().length <= TITLE_MAX &&
    body().trim().length >= BODY_MIN &&
    status() !== "sending";

  const tag_list = () =>
    tags()
      .split(/[\s,]+/)
      .map((t) => t.trim().toLowerCase().replace(/^#/, ""))
      .filter((t) => t.length > 0);

  async function handle_submit() {
    if (!can_submit()) return;

    const user = currentUser();
    const author = user?.username;
    if (!author) {
      set_error_msg("Please login first to create a post.");
      set_status("error");
      return;
    }

    set_status("sending");
    set_error_msg("");

    const permlink = generate_permlink(title());
    const parsed_tags = tag_list();
    const all_tags = parsed_tags.length > 0 ? parsed_tags : ["general"];

    const json_metadata = JSON.stringify({
      app: "my-honey-pot/1.0",
      format: "markdown",
      tags: all_tags,
      community: props.community_name,
    });

    try {
      // Post to community: parent_author="" (top-level), parent_permlink=community_name
      const result = isAuthenticated()
        ? await broadcast_comment(
            author,
            permlink,
            "",
            props.community_name,
            title().trim(),
            body().trim(),
            json_metadata,
          )
        : await sign_comment(
            author,
            permlink,
            "",
            props.community_name,
            title().trim(),
            body().trim(),
            json_metadata,
          );

      if (result.success) {
        set_status("success");
        set_tx_id(result.transaction_id ?? "");
        set_title("");
        set_body("");
        set_tags("");
      } else {
        set_status("error");
        set_error_msg(result.error ?? "Unknown error");
      }
    } catch (err) {
      set_status("error");
      set_error_msg(err instanceof Error ? err.message : "Unexpected error");
    }
  }

  return (
    <div class="space-y-6">
      {/* Title */}
      <div>
        <label class="block text-sm font-medium text-text mb-1.5">Title</label>
        <input
          type="text"
          value={title()}
          onInput={(e) => set_title(e.currentTarget.value)}
          placeholder="Post title"
          maxLength={TITLE_MAX}
          disabled={status() === "sending"}
          class="w-full bg-bg-card border border-border rounded-lg px-4 py-2.5 text-text placeholder:text-text-muted focus:outline-none focus:border-primary transition-colors"
        />
        <p class="text-xs text-text-muted mt-1">{title().length}/{TITLE_MAX}</p>
      </div>

      {/* Body (Markdown Editor) */}
      <div>
        <label class="block text-sm font-medium text-text mb-1.5">Content</label>
        <MarkdownEditor
          value={body()}
          on_change={set_body}
          placeholder="Write your post content here..."
          min_rows={16}
          disabled={status() === "sending"}
        />
        <Show when={body().trim().length > 0 && body().trim().length < BODY_MIN}>
          <p class="text-xs text-warning mt-1">
            Minimum {BODY_MIN} characters ({body().trim().length}/{BODY_MIN})
          </p>
        </Show>
      </div>

      {/* Tags */}
      <div>
        <label class="block text-sm font-medium text-text mb-1.5">Tags</label>
        <input
          type="text"
          value={tags()}
          onInput={(e) => set_tags(e.currentTarget.value)}
          placeholder="hive blockchain community (space or comma separated)"
          disabled={status() === "sending"}
          class="w-full bg-bg-card border border-border rounded-lg px-4 py-2.5 text-text placeholder:text-text-muted focus:outline-none focus:border-primary transition-colors"
        />
        <Show when={tag_list().length > 0}>
          <div class="flex flex-wrap gap-1.5 mt-2">
            {tag_list().map((tag) => (
              <span class="bg-bg-secondary text-text-muted text-xs px-2 py-0.5 rounded-full">#{tag}</span>
            ))}
          </div>
        </Show>
      </div>

      {/* Community info */}
      <div class="bg-bg-secondary/50 rounded-lg p-3 text-sm text-text-muted">
        Posting to community: <strong class="text-text">{props.community_name}</strong>
      </div>

      {/* Submit */}
      <div class="flex items-center gap-4">
        <button
          type="button"
          onClick={handle_submit}
          disabled={!can_submit()}
          class="bg-primary hover:bg-primary-hover text-primary-text font-medium rounded-lg px-6 py-2.5 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default"
        >
          {status() === "sending" ? "Publishing..." : "Publish Post"}
        </button>

        <Show when={!isAuthenticated()}>
          <p class="text-sm text-warning">Login required to publish.</p>
        </Show>
      </div>

      {/* Error */}
      <Show when={status() === "error"}>
        <div class="bg-error/10 border border-error/30 text-error px-4 py-3 rounded-lg">
          {error_msg()}
        </div>
      </Show>

      {/* Success */}
      <Show when={status() === "success"}>
        <div class="bg-success/10 border border-success/30 text-success px-4 py-3 rounded-lg">
          Post published successfully!
          <Show when={tx_id()}>
            <span class="text-sm ml-2 opacity-75">TX: {tx_id()}</span>
          </Show>
          <div class="mt-2">
            <a href="/" class="text-primary hover:underline text-sm">Back to community</a>
          </div>
        </div>
      </Show>
    </div>
  );
};
