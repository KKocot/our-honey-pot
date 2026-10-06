// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { type Component } from "solid-js";
import type { ToolbarAction } from "./editor_actions";
import {
  bold_action,
  italic_action,
  strikethrough_action,
  heading_action,
  link_action,
  image_action,
  code_action,
  code_block_action,
  quote_action,
  hr_action,
  table_action,
  ul_action,
  ol_action,
  task_list_action,
} from "./editor_actions";

interface MarkdownToolbarProps {
  execute_action: (action: ToolbarAction) => void;
  active_actions?: Set<string>;
  compact?: boolean;
  disabled?: boolean;
}

const MOD =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.userAgent)
    ? "\u2318"
    : "Ctrl";

const BTN =
  "rounded p-1.5 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default";
const BTN_DEFAULT = "text-text-muted hover:text-text hover:bg-bg-secondary";
const BTN_ACTIVE = "text-text bg-bg-secondary";

function ToolbarButton(props: {
  action: ToolbarAction;
  execute: (a: ToolbarAction) => void;
  label: string;
  title: string;
  active_name?: string;
  active_actions?: Set<string>;
  disabled?: boolean;
  children: any;
}) {
  const is_active = () =>
    props.active_name ? props.active_actions?.has(props.active_name) : false;
  return (
    <button
      type="button"
      class={`${BTN} ${is_active() ? BTN_ACTIVE : BTN_DEFAULT}`}
      title={props.title}
      aria-label={props.label}
      disabled={props.disabled}
      onClick={() => props.execute(props.action)}
    >
      {props.children}
    </button>
  );
}

function Separator() {
  return <div class="bg-border mx-1 h-5 w-px" />;
}

const ICON = "w-4 h-4";

export const MarkdownToolbar: Component<MarkdownToolbarProps> = (props) => {
  const exec = (a: ToolbarAction) => props.execute_action(a);
  const active = () => props.active_actions ?? new Set<string>();
  const d = () => props.disabled ?? false;
  const compact = () => props.compact ?? false;

  return (
    <div
      class="flex flex-wrap items-center gap-0.5 border-b border-border px-2 py-1 bg-bg-secondary/50"
      role="toolbar"
      aria-label="Formatting options"
    >
      <ToolbarButton
        action={bold_action}
        execute={exec}
        label={`Bold (${MOD}+B)`}
        title={`Bold (${MOD}+B)`}
        active_name="bold"
        active_actions={active()}
        disabled={d()}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class={ICON}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8" />
        </svg>
      </ToolbarButton>

      <ToolbarButton
        action={italic_action}
        execute={exec}
        label={`Italic (${MOD}+I)`}
        title={`Italic (${MOD}+I)`}
        active_name="italic"
        active_actions={active()}
        disabled={d()}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class={ICON}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="19" x2="10" y1="4" y2="4" />
          <line x1="14" x2="5" y1="20" y2="20" />
          <line x1="15" x2="9" y1="4" y2="20" />
        </svg>
      </ToolbarButton>

      {!compact() && (
        <ToolbarButton
          action={strikethrough_action}
          execute={exec}
          label={`Strikethrough (${MOD}+Shift+S)`}
          title={`Strikethrough (${MOD}+Shift+S)`}
          active_name="strikethrough"
          active_actions={active()}
          disabled={d()}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class={ICON}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M16 4H9a3 3 0 0 0-2.83 4" />
            <path d="M14 12a4 4 0 0 1 0 8H6" />
            <line x1="4" x2="20" y1="12" y2="12" />
          </svg>
        </ToolbarButton>
      )}

      <Separator />

      {!compact() && (
        <>
          <ToolbarButton
            action={heading_action}
            execute={exec}
            label="Heading"
            title="Heading (cycle)"
            active_name="heading"
            active_actions={active()}
            disabled={d()}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class={ICON}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M4 12h8" />
              <path d="M4 18V6" />
              <path d="M12 18V6" />
              <path d="m17 12 3-2v8" />
            </svg>
          </ToolbarButton>
          <Separator />
        </>
      )}

      <ToolbarButton
        action={link_action}
        execute={exec}
        label={`Link (${MOD}+K)`}
        title={`Link (${MOD}+K)`}
        disabled={d()}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class={ICON}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      </ToolbarButton>

      {!compact() && (
        <>
          <ToolbarButton
            action={image_action}
            execute={exec}
            label="Image"
            title="Image"
            disabled={d()}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class={ICON}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
              <circle cx="9" cy="9" r="2" />
              <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
            </svg>
          </ToolbarButton>
          <Separator />
        </>
      )}

      <ToolbarButton
        action={quote_action}
        execute={exec}
        label="Quote"
        title="Quote"
        active_name="quote"
        active_actions={active()}
        disabled={d()}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class={ICON}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M17 6H3" />
          <path d="M21 12H8" />
          <path d="M21 18H8" />
          <path d="M3 12v6" />
        </svg>
      </ToolbarButton>

      <ToolbarButton
        action={code_action}
        execute={exec}
        label={`Inline code (${MOD}+E)`}
        title={`Inline code (${MOD}+E)`}
        active_name="code"
        active_actions={active()}
        disabled={d()}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class={ICON}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </svg>
      </ToolbarButton>

      {!compact() && (
        <>
          <ToolbarButton
            action={code_block_action}
            execute={exec}
            label="Code block"
            title="Code block"
            active_name="code_block"
            active_actions={active()}
            disabled={d()}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class={ICON}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M10 12.5 8 15l2 2.5" />
              <path d="m14 12.5 2 2.5-2 2.5" />
              <path d="M14 2v4a2 2 0 0 0 2 2h4" />
              <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z" />
            </svg>
          </ToolbarButton>
          <Separator />
        </>
      )}

      <ToolbarButton
        action={ul_action}
        execute={exec}
        label="Bullet list"
        title="Bullet list"
        active_name="ul"
        active_actions={active()}
        disabled={d()}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class={ICON}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="8" x2="21" y1="6" y2="6" />
          <line x1="8" x2="21" y1="12" y2="12" />
          <line x1="8" x2="21" y1="18" y2="18" />
          <line x1="3" x2="3.01" y1="6" y2="6" />
          <line x1="3" x2="3.01" y1="12" y2="12" />
          <line x1="3" x2="3.01" y1="18" y2="18" />
        </svg>
      </ToolbarButton>

      {!compact() && (
        <>
          <ToolbarButton
            action={ol_action}
            execute={exec}
            label="Numbered list"
            title="Numbered list"
            active_name="ol"
            active_actions={active()}
            disabled={d()}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class={ICON}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <line x1="10" x2="21" y1="6" y2="6" />
              <line x1="10" x2="21" y1="12" y2="12" />
              <line x1="10" x2="21" y1="18" y2="18" />
              <path d="M4 6h1v4" />
              <path d="M4 10h2" />
              <path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />
            </svg>
          </ToolbarButton>

          <ToolbarButton
            action={task_list_action}
            execute={exec}
            label="Task list"
            title="Task list"
            active_name="task_list"
            active_actions={active()}
            disabled={d()}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class={ICON}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <rect width="18" height="18" x="3" y="3" rx="2" />
              <path d="m9 12 2 2 4-4" />
            </svg>
          </ToolbarButton>

          <Separator />

          <ToolbarButton
            action={table_action}
            execute={exec}
            label="Table"
            title="Table"
            disabled={d()}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class={ICON}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M12 3v18" />
              <rect width="18" height="18" x="3" y="3" rx="2" />
              <path d="M3 9h18" />
              <path d="M3 15h18" />
            </svg>
          </ToolbarButton>

          <ToolbarButton
            action={hr_action}
            execute={exec}
            label="Horizontal rule"
            title="Horizontal rule"
            disabled={d()}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class={ICON}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M5 12h14" />
            </svg>
          </ToolbarButton>
        </>
      )}
    </div>
  );
};
