// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot
// Ported from beeyard editor_actions.ts (framework-agnostic)

// ============================================
// Types
// ============================================

export interface EditorActionContext {
  selection_start: number;
  selection_end: number;
  selected_text: string;
  full_text: string;
  line_start: number;
  line_end: number;
  current_line: string;
}

export interface EditorActionResult {
  text: string;
  selection_start: number;
  selection_end: number;
}

export interface ToolbarAction {
  execute: (ctx: EditorActionContext) => EditorActionResult;
  is_active?: (ctx: EditorActionContext) => boolean;
}

// ============================================
// Helpers
// ============================================

function wrap_selection(ctx: EditorActionContext, before: string, after: string): EditorActionResult {
  const { full_text, selection_start, selection_end, selected_text } = ctx;

  const has_wrapper =
    full_text.slice(selection_start - before.length, selection_start) === before &&
    full_text.slice(selection_end, selection_end + after.length) === after;

  if (has_wrapper) {
    const text = full_text.slice(0, selection_start - before.length) + selected_text + full_text.slice(selection_end + after.length);
    return { text, selection_start: selection_start - before.length, selection_end: selection_end - before.length };
  }

  const wrapped_inside = selected_text.startsWith(before) && selected_text.endsWith(after);
  if (wrapped_inside && selected_text.length >= before.length + after.length) {
    const unwrapped = selected_text.slice(before.length, selected_text.length - after.length);
    const text = full_text.slice(0, selection_start) + unwrapped + full_text.slice(selection_end);
    return { text, selection_start, selection_end: selection_start + unwrapped.length };
  }

  const text = full_text.slice(0, selection_start) + before + selected_text + after + full_text.slice(selection_end);
  return { text, selection_start: selection_start + before.length, selection_end: selection_end + before.length };
}

function toggle_line_prefix(ctx: EditorActionContext, prefix: string): EditorActionResult {
  const { full_text, selection_start, selection_end } = ctx;
  const lines = full_text.split("\n");
  const start_line_idx = full_text.slice(0, selection_start).split("\n").length - 1;
  const end_line_idx = full_text.slice(0, selection_end).split("\n").length - 1;

  const all_have_prefix = lines.slice(start_line_idx, end_line_idx + 1).every((line) => line.startsWith(prefix));
  let offset_delta = 0;

  for (let i = start_line_idx; i <= end_line_idx; i++) {
    if (all_have_prefix) {
      lines[i] = lines[i].slice(prefix.length);
      offset_delta -= prefix.length;
    } else {
      lines[i] = prefix + lines[i];
      offset_delta += prefix.length;
    }
  }

  const first_line_delta = all_have_prefix ? -prefix.length : prefix.length;
  return {
    text: lines.join("\n"),
    selection_start: Math.max(0, selection_start + first_line_delta),
    selection_end: Math.max(0, selection_end + offset_delta),
  };
}

function toggle_list_lines(
  ctx: EditorActionContext,
  get_prefix: (index: number) => string,
  detect_prefix: (line: string) => string | null,
): EditorActionResult {
  const { full_text, selection_start, selection_end } = ctx;
  const lines = full_text.split("\n");
  const start_line_idx = full_text.slice(0, selection_start).split("\n").length - 1;
  const end_line_idx = full_text.slice(0, selection_end).split("\n").length - 1;

  const target_lines = lines.slice(start_line_idx, end_line_idx + 1);
  const all_have_prefix = target_lines.every((line) => detect_prefix(line) !== null);
  let offset_delta = 0;
  let first_line_delta = 0;

  for (let i = start_line_idx; i <= end_line_idx; i++) {
    const relative_idx = i - start_line_idx;
    if (all_have_prefix) {
      const existing = detect_prefix(lines[i]);
      if (existing !== null) {
        lines[i] = lines[i].slice(existing.length);
        offset_delta -= existing.length;
        if (i === start_line_idx) first_line_delta = -existing.length;
      }
    } else {
      const prefix = get_prefix(relative_idx);
      lines[i] = prefix + lines[i];
      offset_delta += prefix.length;
      if (i === start_line_idx) first_line_delta = prefix.length;
    }
  }

  return {
    text: lines.join("\n"),
    selection_start: Math.max(0, selection_start + first_line_delta),
    selection_end: Math.max(0, selection_end + offset_delta),
  };
}

function insert_at_cursor(ctx: EditorActionContext, insert_text: string): EditorActionResult {
  const { full_text, selection_start, selection_end } = ctx;
  const text = full_text.slice(0, selection_start) + insert_text + full_text.slice(selection_end);
  const cursor = selection_start + insert_text.length;
  return { text, selection_start: cursor, selection_end: cursor };
}

// ============================================
// Formatting actions
// ============================================

export const bold_action: ToolbarAction = {
  execute: (ctx) => wrap_selection(ctx, "**", "**"),
  is_active: (ctx) => {
    const { full_text, selection_start, selection_end, selected_text } = ctx;
    if (selected_text.startsWith("**") && selected_text.endsWith("**")) return true;
    return full_text.slice(selection_start - 2, selection_start) === "**" && full_text.slice(selection_end, selection_end + 2) === "**";
  },
};

export const italic_action: ToolbarAction = {
  execute: (ctx) => wrap_selection(ctx, "*", "*"),
  is_active: (ctx) => {
    const { full_text, selection_start, selection_end, selected_text } = ctx;
    if (selected_text.startsWith("*") && selected_text.endsWith("*")) return true;
    const char_before = full_text.slice(selection_start - 1, selection_start);
    const char_after = full_text.slice(selection_end, selection_end + 1);
    return char_before === "*" && char_after === "*" && full_text.slice(selection_start - 2, selection_start) !== "**" && full_text.slice(selection_end, selection_end + 2) !== "**";
  },
};

export const strikethrough_action: ToolbarAction = {
  execute: (ctx) => wrap_selection(ctx, "~~", "~~"),
  is_active: (ctx) => {
    const { full_text, selection_start, selection_end, selected_text } = ctx;
    if (selected_text.startsWith("~~") && selected_text.endsWith("~~")) return true;
    return full_text.slice(selection_start - 2, selection_start) === "~~" && full_text.slice(selection_end, selection_end + 2) === "~~";
  },
};

export const code_action: ToolbarAction = {
  execute: (ctx) => wrap_selection(ctx, "`", "`"),
  is_active: (ctx) => {
    const { full_text, selection_start, selection_end, selected_text } = ctx;
    if (selected_text.startsWith("`") && selected_text.endsWith("`")) return true;
    return full_text.slice(selection_start - 1, selection_start) === "`" && full_text.slice(selection_end, selection_end + 1) === "`";
  },
};

export const code_block_action: ToolbarAction = {
  execute: (ctx) => wrap_selection(ctx, "```\n", "\n```"),
  is_active: (ctx) => {
    const text_before = ctx.full_text.slice(0, ctx.selection_start);
    return (text_before.match(/```/g) ?? []).length % 2 === 1;
  },
};

// ============================================
// Structure actions
// ============================================

const HEADING_REGEX = /^(#{1,6})\s/;

export const heading_action: ToolbarAction = {
  execute: (ctx) => {
    const { full_text, current_line, line_start, line_end } = ctx;
    const match = current_line.match(HEADING_REGEX);

    if (match) {
      const level = match[1].length;
      if (level < 6) {
        const new_prefix = "#".repeat(level + 1) + " ";
        const old_prefix = "#".repeat(level) + " ";
        const new_line = new_prefix + current_line.slice(old_prefix.length);
        const text = full_text.slice(0, line_start) + new_line + full_text.slice(line_end);
        const cursor = line_start + new_line.length;
        return { text, selection_start: cursor, selection_end: cursor };
      }
      const stripped = current_line.slice(match[0].length);
      const text = full_text.slice(0, line_start) + stripped + full_text.slice(line_end);
      const cursor = line_start + stripped.length;
      return { text, selection_start: cursor, selection_end: cursor };
    }

    const new_line = "## " + current_line;
    const text = full_text.slice(0, line_start) + new_line + full_text.slice(line_end);
    const cursor = line_start + new_line.length;
    return { text, selection_start: cursor, selection_end: cursor };
  },
  is_active: (ctx) => HEADING_REGEX.test(ctx.current_line),
};

export const quote_action: ToolbarAction = {
  execute: (ctx) => toggle_line_prefix(ctx, "> "),
  is_active: (ctx) => ctx.current_line.startsWith("> "),
};

export const hr_action: ToolbarAction = {
  execute: (ctx) => insert_at_cursor(ctx, "\n---\n"),
};

export const table_action: ToolbarAction = {
  execute: (ctx) => insert_at_cursor(ctx, "\n| Column 1 | Column 2 | Column 3 |\n| -------- | -------- | -------- |\n| Text     | Text     | Text     |\n"),
};

export const link_action: ToolbarAction = {
  execute: (ctx) => {
    const { full_text, selection_start, selection_end, selected_text } = ctx;
    const replacement = `[${selected_text}](url)`;
    const text = full_text.slice(0, selection_start) + replacement + full_text.slice(selection_end);
    const url_start = selection_start + selected_text.length + 3;
    return { text, selection_start: url_start, selection_end: url_start + 3 };
  },
};

export const image_action: ToolbarAction = {
  execute: (ctx) => {
    const { full_text, selection_start, selection_end, selected_text } = ctx;
    const alt = selected_text || "alt";
    const replacement = `![${alt}](url)`;
    const text = full_text.slice(0, selection_start) + replacement + full_text.slice(selection_end);
    const url_start = selection_start + alt.length + 4;
    return { text, selection_start: url_start, selection_end: url_start + 3 };
  },
};

// ============================================
// List actions
// ============================================

const UL_REGEX = /^- /;
const OL_REGEX = /^(\d+)\.\s/;
const TASK_REGEX = /^- \[([ x])\] /;

export const ul_action: ToolbarAction = {
  execute: (ctx) => toggle_list_lines(ctx, () => "- ", (line) => (UL_REGEX.test(line) ? "- " : null)),
  is_active: (ctx) => UL_REGEX.test(ctx.current_line),
};

export const ol_action: ToolbarAction = {
  execute: (ctx) => toggle_list_lines(ctx, (index) => `${index + 1}. `, (line) => { const match = line.match(OL_REGEX); return match ? match[0] : null; }),
  is_active: (ctx) => OL_REGEX.test(ctx.current_line),
};

export const task_list_action: ToolbarAction = {
  execute: (ctx) => toggle_list_lines(ctx, () => "- [ ] ", (line) => { const match = line.match(TASK_REGEX); return match ? match[0] : null; }),
  is_active: (ctx) => TASK_REGEX.test(ctx.current_line),
};

// ============================================
// Image upload helpers
// ============================================

export function create_upload_placeholder(file_name: string): { id: string; markdown: string } {
  const id = `uploading-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return { id, markdown: `![Uploading ${file_name}...](${id})` };
}

export function build_upload_replacement(
  full_text: string,
  placeholder_id: string,
  image_url: string | null,
  file_name: string,
): { new_text: string; cursor: number } | null {
  const placeholder = `![Uploading ${file_name}...](${placeholder_id})`;
  const idx = full_text.indexOf(placeholder);
  if (idx === -1) return null;

  const replacement = image_url ? `![${file_name}](${image_url})` : `![Upload failed: ${file_name}]()`;
  const new_text = full_text.slice(0, idx) + replacement + full_text.slice(idx + placeholder.length);
  return { new_text, cursor: idx + replacement.length };
}
