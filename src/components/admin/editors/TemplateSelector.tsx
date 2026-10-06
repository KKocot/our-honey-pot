// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { For, Show, createSignal } from "solid-js";
import { updateSettingsImmediate } from "../store";
import {
  applyThemeColors,
  getSettingsSnapshot,
  is_community_mode,
} from "../queries";
import {
  websiteTemplates,
  designPatterns,
  themePresets,
  build_template_patch,
  build_undo_patch,
  type WebsiteTemplate,
  type SettingsData,
} from "../types/index";
import {
  Button,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  createDialog,
  showToast,
} from "../../ui";

// ============================================
// Template Card Component
// ============================================

interface TemplateCardProps {
  template: WebsiteTemplate;
  onSelect: (template: WebsiteTemplate) => void;
}

function TemplateCard(props: TemplateCardProps) {
  const colors = () => {
    const themeId = props.template.settings.siteTheme;
    const theme = themePresets.find((p) => p.id === themeId) || themePresets[0];
    return theme.colors;
  };

  // Read layout from pageLayoutConfig (v3)
  const layoutTemplate = () =>
    props.template.settings.pageLayoutConfig?.template ?? "no-sidebar";
  const postsLayout = () => props.template.settings.postsLayout ?? "list";
  const gridCols = () => Math.min(props.template.settings.gridColumns ?? 2, 3);
  const gapClass = () =>
    (props.template.settings.cardGapPx ?? 16) < 16 ? "gap-0.5" : "gap-1";

  return (
    <button
      type="button"
      class="group relative flex flex-col rounded-xl border border-border bg-bg-card p-3 text-left transition-all hover:border-primary hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
      onClick={() => props.onSelect(props.template)}
    >
      {/* Mini Preview */}
      <div
        class="mb-3 aspect-video w-full overflow-hidden rounded-lg"
        style={{ background: colors().bg }}
      >
        {/* Simplified layout preview */}
        <div class="flex h-full flex-col p-2">
          {/* Header */}
          <div
            class="mb-1 h-2 w-full rounded-sm"
            style={{ background: colors().primary }}
          />
          {/* Content area */}
          <div class="flex flex-1 gap-1">
            {/* Left sidebar from pageLayoutConfig */}
            {(layoutTemplate() === "sidebar-left" ||
              layoutTemplate() === "both-sidebars") && (
              <div
                class="rounded-sm"
                classList={{
                  "w-1/4": layoutTemplate() === "sidebar-left",
                  "w-1/5": layoutTemplate() === "both-sidebars",
                }}
                style={{ background: colors().bgCard }}
              />
            )}
            {/* Main content area */}
            <div class={`flex-1 ${gapClass()}`}>
              {postsLayout() === "list" ? (
                <div class={`flex flex-col h-full ${gapClass()}`}>
                  <div
                    class="h-3 rounded-sm"
                    style={{ background: colors().bgCard }}
                  />
                  <div
                    class="h-3 rounded-sm"
                    style={{ background: colors().bgCard }}
                  />
                  <div
                    class="h-3 rounded-sm"
                    style={{ background: colors().bgCard }}
                  />
                </div>
              ) : postsLayout() === "masonry" ? (
                <div
                  class={`grid h-full ${gapClass()}`}
                  style={{
                    "grid-template-columns": `repeat(${gridCols()}, 1fr)`,
                  }}
                >
                  <div
                    class="rounded-sm"
                    style={{
                      background: colors().bgCard,
                      "grid-row": "span 2",
                    }}
                  />
                  <div
                    class="rounded-sm"
                    style={{ background: colors().bgCard }}
                  />
                  {gridCols() >= 3 && (
                    <div
                      class="rounded-sm"
                      style={{
                        background: colors().bgCard,
                        "grid-row": "span 2",
                      }}
                    />
                  )}
                  <div
                    class="rounded-sm"
                    style={{ background: colors().bgCard }}
                  />
                  {gridCols() < 3 && (
                    <div
                      class="rounded-sm"
                      style={{ background: colors().bgCard }}
                    />
                  )}
                </div>
              ) : (
                <div
                  class={`grid h-full ${gapClass()}`}
                  style={{
                    "grid-template-columns": `repeat(${gridCols()}, 1fr)`,
                  }}
                >
                  <For each={Array.from({ length: gridCols() * 2 })}>
                    {() => (
                      <div
                        class="rounded-sm"
                        style={{ background: colors().bgCard }}
                      />
                    )}
                  </For>
                </div>
              )}
            </div>
            {/* Right sidebar from pageLayoutConfig */}
            {(layoutTemplate() === "sidebar-right" ||
              layoutTemplate() === "both-sidebars") && (
              <div
                class="rounded-sm"
                classList={{
                  "w-1/4": layoutTemplate() === "sidebar-right",
                  "w-1/5": layoutTemplate() === "both-sidebars",
                }}
                style={{ background: colors().bgCard }}
              />
            )}
          </div>
        </div>
      </div>

      {/* Template Info */}
      <div class="flex items-start gap-2">
        <span class="text-2xl">{props.template.icon}</span>
        <div class="flex-1 min-w-0">
          <h3 class="font-medium text-text truncate">{props.template.name}</h3>
          <p class="text-xs text-text-muted line-clamp-2">
            {props.template.description}
          </p>
        </div>
      </div>

      {/* Hover overlay */}
      <div class="absolute inset-0 rounded-xl bg-primary/5 opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );
}

// ============================================
// Template Selector Component
// ============================================

type PendingAction =
  | { kind: "template"; template: WebsiteTemplate }
  | { kind: "random" };

interface UndoState {
  label: string;
  patch: Partial<SettingsData>;
}

function resolve_colors(data: Partial<SettingsData>) {
  if (data.customColors) return data.customColors;
  return themePresets.find((p) => p.id === data.siteTheme)?.colors ?? null;
}

function build_random_settings(): Partial<SettingsData> {
  const randomChoice = <T,>(arr: readonly T[]): T =>
    arr[Math.floor(Math.random() * arr.length)];
  const vary = (base: number, range: number, min = 0) =>
    Math.max(min, base + Math.floor(Math.random() * (range * 2 + 1)) - range);

  const pattern = randomChoice(designPatterns);
  const randomTheme = randomChoice(themePresets);

  return {
    ...pattern.settings,
    siteTheme: randomTheme.id,
    cardPaddingPx: vary(pattern.settings.cardPaddingPx ?? 16, 4),
    cardBorderRadiusPx: vary(pattern.settings.cardBorderRadiusPx ?? 8, 4),
    cardGapPx: vary(pattern.settings.cardGapPx ?? 16, 4),
    thumbnailSizePx: vary(pattern.settings.thumbnailSizePx ?? 120, 20),
  };
}

export function TemplateSelector() {
  const confirm_dialog = createDialog();
  const [pending, set_pending] = createSignal<PendingAction | null>(null);
  const [undo_state, set_undo_state] = createSignal<UndoState | null>(null);

  const request_apply = (action: PendingAction) => {
    set_pending(action);
    confirm_dialog.setOpen(true);
  };

  const close_confirm = () => {
    confirm_dialog.setOpen(false);
    set_pending(null);
  };

  const apply_patch = (template_settings: Partial<SettingsData>, label: string) => {
    const patch = build_template_patch(template_settings, is_community_mode());
    if (!patch) return;

    const undo_patch = build_undo_patch(getSettingsSnapshot(), patch);
    updateSettingsImmediate(patch);

    const colors = resolve_colors(patch);
    if (colors) applyThemeColors(colors);

    set_undo_state(undo_patch ? { label, patch: undo_patch } : null);
    showToast(`Applied "${label}"`, "success");
  };

  const confirm_apply = () => {
    const action = pending();
    close_confirm();
    if (!action) return;
    if (action.kind === "template") {
      apply_patch(action.template.settings, action.template.name);
    } else {
      apply_patch(build_random_settings(), "Random settings");
    }
  };

  const undo = () => {
    const state = undo_state();
    if (!state) return;
    updateSettingsImmediate(state.patch);
    const colors = resolve_colors(getSettingsSnapshot());
    if (colors) applyThemeColors(colors);
    set_undo_state(null);
    showToast(`Reverted "${state.label}"`, "success");
  };

  const pending_label = () => {
    const action = pending();
    if (!action) return "";
    return action.kind === "template" ? `"${action.template.name}" template` : "random settings";
  };

  return (
    <div class="bg-bg-card rounded-xl p-6 mb-6 border border-border">
      <div class="mb-6">
        <h2 class="text-xl font-semibold text-primary">Quick Start Templates</h2>
        <p class="text-sm text-text-muted mt-1">
          Choose a template to instantly apply a complete design preset
        </p>
      </div>

      <Show when={undo_state()}>
        {(state) => (
          <div
            role="status"
            class="mb-4 flex items-center justify-between gap-4 rounded-lg border border-border bg-bg-secondary px-4 py-3"
          >
            <p class="text-sm text-text">
              Applied <span class="font-medium">{state().label}</span>. Layout, theme and colors were replaced.
            </p>
            <Button type="button" variant="secondary" size="sm" onClick={undo}>
              Undo
            </Button>
          </div>
        )}
      </Show>

      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        <button
          type="button"
          class="group relative flex flex-col rounded-xl border-2 border-dashed border-primary/50 bg-primary/5 p-3 text-left transition-all hover:border-primary hover:bg-primary/10 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          onClick={() => request_apply({ kind: "random" })}
        >
          <div class="mb-3 aspect-video w-full overflow-hidden rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
            <span class="text-4xl">🎲</span>
          </div>

          <div class="flex items-start gap-2">
            <span class="text-2xl">✨</span>
            <div class="flex-1 min-w-0">
              <h3 class="font-medium text-primary truncate">Randomize</h3>
              <p class="text-xs text-text-muted line-clamp-2">Generate random settings</p>
            </div>
          </div>
        </button>

        <For each={websiteTemplates}>
          {(template) => (
            <TemplateCard
              template={template}
              onSelect={(t) => request_apply({ kind: "template", template: t })}
            />
          )}
        </For>
      </div>

      <DialogContent open={confirm_dialog.open} onClose={close_confirm}>
        <DialogHeader>
          <DialogTitle>Apply {pending_label()}?</DialogTitle>
          <DialogDescription>
            This replaces your page layout, post card layout, theme and custom colors. You can undo it
            right after applying.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter class="pt-6 gap-2">
          <Button type="button" variant="secondary" onClick={close_confirm}>
            Cancel
          </Button>
          <Button type="button" variant="primary" onClick={confirm_apply}>
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </div>
  );
}
