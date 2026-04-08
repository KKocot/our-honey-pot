// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot
// Ported from beeyard create_codemirror.svelte.ts — vanilla TS (no Svelte runes)

import { EditorView, keymap, placeholder as cm_placeholder } from "@codemirror/view";
import { EditorState, Compartment } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { highlightSelectionMatches } from "@codemirror/search";
import { closeBrackets } from "@codemirror/autocomplete";
import { oneDark } from "@codemirror/theme-one-dark";
import type { EditorActionContext, ToolbarAction } from "./editor_actions";
import { bold_action, italic_action, link_action, strikethrough_action, code_action } from "./editor_actions";

// ============================================
// Types
// ============================================

export interface CreateCodemirrorOptions {
  initial_value: string;
  on_change: (value: string) => void;
  placeholder?: string;
  on_selection_change?: (ctx: EditorActionContext) => void;
  disabled?: boolean;
}

export interface CodemirrorInstance {
  view: EditorView | null;
  attach: (el: HTMLDivElement) => void;
  destroy: () => void;
  execute_action: (action: ToolbarAction) => void;
  get_context: () => EditorActionContext | null;
  focus: () => void;
  sync_value: (new_value: string) => void;
  insert_text: (text: string) => void;
}

// ============================================
// Helpers
// ============================================

function resolve_dark_mode(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.classList.contains("dark") ||
    document.documentElement.getAttribute("data-theme-mode") === "dark";
}

function build_context(view: EditorView): EditorActionContext {
  const state = view.state;
  const sel = state.selection.main;
  const full_text = state.doc.toString();
  const selected_text = state.sliceDoc(sel.from, sel.to);
  const line = state.doc.lineAt(sel.from);

  return {
    selection_start: sel.from,
    selection_end: sel.to,
    selected_text,
    full_text,
    line_start: line.from,
    line_end: line.to,
    current_line: line.text,
  };
}

// ============================================
// Factory
// ============================================

export function create_codemirror(options: CreateCodemirrorOptions): CodemirrorInstance {
  let view: EditorView | null = null;
  const theme_compartment = new Compartment();
  let is_external_update = false;
  let mutation_observer: MutationObserver | null = null;

  function execute_action_on_view(v: EditorView, action: ToolbarAction): void {
    const ctx = build_context(v);
    const result = action.execute(ctx);

    is_external_update = true;
    v.dispatch({
      changes: { from: 0, to: v.state.doc.length, insert: result.text },
      selection: { anchor: result.selection_start, head: result.selection_end },
    });
    is_external_update = false;
    options.on_change(result.text);
    v.focus();
  }

  function attach(container: HTMLDivElement): void {
    if (view) return;

    const is_dark = resolve_dark_mode();

    const update_listener = EditorView.updateListener.of((update) => {
      if (update.docChanged && !is_external_update) {
        options.on_change(update.state.doc.toString());
      }
      if (update.selectionSet && options.on_selection_change) {
        options.on_selection_change(build_context(update.view));
      }
    });

    const editor_shortcuts = keymap.of([
      { key: "Mod-b", run: (v) => { execute_action_on_view(v, bold_action); return true; } },
      { key: "Mod-i", run: (v) => { execute_action_on_view(v, italic_action); return true; } },
      { key: "Mod-k", run: (v) => { execute_action_on_view(v, link_action); return true; } },
      { key: "Mod-Shift-s", run: (v) => { execute_action_on_view(v, strikethrough_action); return true; } },
      { key: "Mod-e", run: (v) => { execute_action_on_view(v, code_action); return true; } },
    ]);

    const extensions = [
      history(),
      closeBrackets(),
      highlightSelectionMatches(),
      markdown({ codeLanguages: languages }),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      editor_shortcuts,
      update_listener,
      theme_compartment.of(is_dark ? oneDark : []),
      EditorView.lineWrapping,
    ];

    if (options.placeholder) {
      extensions.push(cm_placeholder(options.placeholder));
    }

    const state = EditorState.create({
      doc: options.initial_value,
      extensions,
    });

    view = new EditorView({ state, parent: container });

    // Auto theme switching
    mutation_observer = new MutationObserver(() => {
      if (!view) return;
      const dark = resolve_dark_mode();
      view.dispatch({ effects: theme_compartment.reconfigure(dark ? oneDark : []) });
    });
    mutation_observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme-mode"],
    });
  }

  function destroy(): void {
    mutation_observer?.disconnect();
    mutation_observer = null;
    view?.destroy();
    view = null;
  }

  function execute_action(action: ToolbarAction): void {
    if (!view) return;
    execute_action_on_view(view, action);
  }

  function get_context(): EditorActionContext | null {
    if (!view) return null;
    return build_context(view);
  }

  function sync_value(new_value: string): void {
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === new_value) return;

    is_external_update = true;
    view.dispatch({ changes: { from: 0, to: current.length, insert: new_value } });
    is_external_update = false;
  }

  function insert_text(text: string): void {
    if (!view) return;
    const pos = view.state.selection.main.from;
    is_external_update = true;
    view.dispatch({
      changes: { from: pos, to: pos, insert: text },
      selection: { anchor: pos + text.length },
    });
    is_external_update = false;
    options.on_change(view.state.doc.toString());
  }

  function focus(): void {
    view?.focus();
  }

  return {
    get view() { return view; },
    attach,
    destroy,
    execute_action,
    get_context,
    focus,
    sync_value,
    insert_text,
  };
}
