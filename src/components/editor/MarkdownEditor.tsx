// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createSignal, onMount, onCleanup, Show, type Component } from "solid-js";
import { create_codemirror } from "./create_codemirror";
import { MarkdownToolbar } from "./MarkdownToolbar";
import type { EditorActionContext } from "./editor_actions";
import { renderPostBody } from "../../lib/renderer";

// ============================================
// Types
// ============================================

interface MarkdownEditorProps {
  value?: string;
  on_change?: (value: string) => void;
  placeholder?: string;
  min_rows?: number;
  compact?: boolean;
  disabled?: boolean;
}

type EditorMode = "write" | "preview" | "split";

// ============================================
// Component
// ============================================

export const MarkdownEditor: Component<MarkdownEditorProps> = (props) => {
  const [mode, set_mode] = createSignal<EditorMode>("write");
  const [active_actions, set_active_actions] = createSignal<Set<string>>(new Set());
  const [preview_html, set_preview_html] = createSignal("");

  let editor_container: HTMLDivElement | undefined;

  const cm = create_codemirror({
    initial_value: props.value ?? "",
    on_change: (value) => {
      props.on_change?.(value);
      if (mode() === "split" || mode() === "preview") {
        set_preview_html(renderPostBody(value));
      }
    },
    placeholder: props.placeholder ?? "Write your content here...",
    on_selection_change: (ctx: EditorActionContext) => {
      const new_active = new Set<string>();
      const checks: Array<[string, (c: EditorActionContext) => boolean | undefined]> = [
        ["bold", (c) => c.full_text.slice(c.selection_start - 2, c.selection_start) === "**" && c.full_text.slice(c.selection_end, c.selection_end + 2) === "**"],
        ["italic", (c) => {
          const b = c.full_text.slice(c.selection_start - 1, c.selection_start);
          const a = c.full_text.slice(c.selection_end, c.selection_end + 1);
          return b === "*" && a === "*" && c.full_text.slice(c.selection_start - 2, c.selection_start) !== "**";
        }],
        ["strikethrough", (c) => c.full_text.slice(c.selection_start - 2, c.selection_start) === "~~" && c.full_text.slice(c.selection_end, c.selection_end + 2) === "~~"],
        ["code", (c) => c.full_text.slice(c.selection_start - 1, c.selection_start) === "`" && c.full_text.slice(c.selection_end, c.selection_end + 1) === "`"],
        ["heading", (c) => /^#{1,6}\s/.test(c.current_line)],
        ["quote", (c) => c.current_line.startsWith("> ")],
        ["ul", (c) => /^- /.test(c.current_line)],
        ["ol", (c) => /^\d+\.\s/.test(c.current_line)],
        ["task_list", (c) => /^- \[[ x]\] /.test(c.current_line)],
      ];
      for (const [name, check] of checks) {
        if (check(ctx)) new_active.add(name);
      }
      set_active_actions(new_active);
    },
    disabled: props.disabled,
  });

  onMount(() => {
    if (editor_container) {
      cm.attach(editor_container);
    }
  });

  onCleanup(() => {
    cm.destroy();
  });

  function switch_mode(new_mode: EditorMode) {
    if (new_mode === mode()) return;
    if (new_mode === "preview" || new_mode === "split") {
      const current_value = cm.get_context()?.full_text ?? props.value ?? "";
      set_preview_html(renderPostBody(current_value));
    }
    set_mode(new_mode);
  }

  const min_height = () => `${(props.min_rows ?? 12) * 1.5}rem`;

  const TAB_BASE = "px-3 py-1.5 text-sm font-medium rounded-t-lg transition-colors cursor-pointer";
  const TAB_ACTIVE = "bg-bg-card text-text border border-border border-b-transparent";
  const TAB_INACTIVE = "text-text-muted hover:text-text";

  return (
    <div class="border border-border rounded-lg overflow-hidden bg-bg-card">
      {/* Mode tabs + toolbar */}
      <div class="flex items-center justify-between border-b border-border bg-bg-secondary/30">
        <div class="flex">
          <button type="button" class={`${TAB_BASE} ${mode() === "write" ? TAB_ACTIVE : TAB_INACTIVE}`} onClick={() => switch_mode("write")}>Write</button>
          <button type="button" class={`${TAB_BASE} ${mode() === "preview" ? TAB_ACTIVE : TAB_INACTIVE}`} onClick={() => switch_mode("preview")}>Preview</button>
          <button type="button" class={`${TAB_BASE} ${mode() === "split" ? TAB_ACTIVE : TAB_INACTIVE}`} onClick={() => switch_mode("split")}>Split</button>
        </div>
      </div>

      {/* Toolbar (visible in write and split modes) */}
      <Show when={mode() !== "preview"}>
        <MarkdownToolbar
          execute_action={(action) => cm.execute_action(action)}
          active_actions={active_actions()}
          compact={props.compact}
          disabled={props.disabled}
        />
      </Show>

      {/* Editor area */}
      <div class={mode() === "split" ? "grid grid-cols-2 divide-x divide-border" : ""}>
        {/* Write pane */}
        <Show when={mode() !== "preview"}>
          <div
            ref={editor_container}
            class="cm-editor-container"
            style={{ "min-height": min_height() }}
          />
        </Show>

        {/* Preview pane */}
        <Show when={mode() === "preview" || mode() === "split"}>
          <div
            class="prose prose-sm max-w-none p-4 overflow-y-auto rendered-content"
            style={{ "min-height": min_height() }}
            innerHTML={preview_html()}
          />
        </Show>
      </div>
    </div>
  );
};
