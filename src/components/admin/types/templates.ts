// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

// Must not import from './index' -- the barrel pulls lib/config, which breaks node unit tests.
import type { SettingsData } from "./settings";
import type {
  ContainerConfig,
  ContainerElement,
  PageLayout,
  PageLayoutConfig,
} from "./layout";

export interface DesignPattern {
  name: string;
  settings: Partial<SettingsData>;
}

export const designPatterns: DesignPattern[] = [
  {
    name: "clean-list",
    settings: {
      postsLayout: "list",
      gridColumns: 1,
      cardLayout: "horizontal",
      thumbnailSizePx: 140,
      cardPaddingPx: 24,
      cardBorderRadiusPx: 16,
      titleSizePx: 22,
      cardGapPx: 28,
      cardBorder: true,
      showSummary: true,
      summaryMaxLength: 200,
      showTags: true,
      maxTags: 3,
      showDate: true,
      showVotes: true,
      showComments: true,
      showPayout: false,
      showThumbnail: true,
      cardHoverEffect: "shadow",
      cardHoverShadow: "md",
      scrollAnimationType: "fade",
      scrollAnimationDuration: 400,
      scrollAnimationDelay: 100,
      postCardLayout: {
        sections: [
          {
            id: "sec-main",
            orientation: "horizontal",
            children: [
              { type: "element", id: "thumbnail" },
              {
                type: "section",
                section: {
                  id: "sec-content",
                  orientation: "vertical",
                  children: [
                    { type: "element", id: "title" },
                    { type: "element", id: "summary" },
                    {
                      type: "section",
                      section: {
                        id: "sec-meta",
                        orientation: "horizontal",
                        children: [
                          { type: "element", id: "date" },
                          { type: "element", id: "votes" },
                          { type: "element", id: "comments" },
                        ],
                      },
                    },
                    { type: "element", id: "tags" },
                  ],
                },
              },
            ],
          },
        ],
      },
      pageLayout: {
        sections: [
          {
            id: "page-sec-1",
            slot: "top",
            orientation: "horizontal",
            elements: ["header"],
            active: true,
          },
          {
            id: "page-sec-3",
            slot: "main",
            orientation: "vertical",
            elements: ["posts"],
            active: true,
          },
          {
            id: "page-sec-4",
            slot: "bottom",
            orientation: "horizontal",
            elements: ["footer"],
            active: true,
          },
        ],
      },
      pageLayoutConfig: {
        template: "no-sidebar",
        containers: {
          top: { elements: [{ id: "header", active: true }] },
          sidebarLeft: { elements: [] },
          sidebarRight: { elements: [] },
          bottom: { elements: [{ id: "footer", active: true }] },
        },
      },
    },
  },
  {
    name: "dense-grid",
    settings: {
      postsLayout: "grid",
      gridColumns: 3,
      cardLayout: "vertical",
      thumbnailSizePx: 180,
      cardPaddingPx: 12,
      cardBorderRadiusPx: 8,
      titleSizePx: 16,
      cardGapPx: 12,
      cardBorder: true,
      showSummary: true,
      summaryMaxLength: 100,
      showTags: true,
      maxTags: 2,
      showDate: true,
      showVotes: true,
      showComments: true,
      showPayout: false,
      showThumbnail: true,
      cardHoverEffect: "lift",
      cardHoverScale: 1.02,
      cardHoverShadow: "lg",
      scrollAnimationType: "slide-up",
      scrollAnimationDuration: 300,
      scrollAnimationDelay: 60,
      postCardLayout: {
        sections: [
          {
            id: "sec-card",
            orientation: "vertical",
            children: [
              { type: "element", id: "thumbnail" },
              {
                type: "section",
                section: {
                  id: "sec-content",
                  orientation: "vertical",
                  children: [
                    { type: "element", id: "title" },
                    { type: "element", id: "summary" },
                    {
                      type: "section",
                      section: {
                        id: "sec-meta",
                        orientation: "horizontal",
                        children: [
                          { type: "element", id: "date" },
                          { type: "element", id: "votes" },
                          { type: "element", id: "comments" },
                        ],
                      },
                    },
                    { type: "element", id: "tags" },
                  ],
                },
              },
            ],
          },
        ],
      },
      pageLayout: {
        sections: [
          {
            id: "page-sec-1",
            slot: "top",
            orientation: "horizontal",
            elements: ["header"],
            active: true,
          },
          {
            id: "page-sec-3",
            slot: "main",
            orientation: "vertical",
            elements: ["posts"],
            active: true,
          },
          {
            id: "page-sec-2",
            slot: "sidebar-right",
            orientation: "vertical",
            elements: ["authorProfile"],
            active: true,
          },
          {
            id: "page-sec-4",
            slot: "bottom",
            orientation: "horizontal",
            elements: ["footer"],
            active: true,
          },
        ],
      },
      pageLayoutConfig: {
        template: "sidebar-right",
        containers: {
          top: { elements: [{ id: "header", active: true }] },
          sidebarLeft: { elements: [] },
          sidebarRight: { elements: [{ id: "authorProfile", active: true }] },
          bottom: { elements: [{ id: "footer", active: true }] },
        },
      },
    },
  },
  {
    name: "visual-masonry",
    settings: {
      postsLayout: "masonry",
      gridColumns: 3,
      cardLayout: "vertical",
      thumbnailSizePx: 320,
      cardPaddingPx: 0,
      cardBorderRadiusPx: 4,
      titleSizePx: 14,
      cardGapPx: 8,
      cardBorder: false,
      showSummary: false,
      showTags: false,
      showDate: false,
      showVotes: false,
      showComments: false,
      showPayout: false,
      showThumbnail: true,
      cardHoverEffect: "scale",
      cardHoverScale: 1.04,
      cardTransitionDuration: 300,
      scrollAnimationType: "zoom",
      scrollAnimationDuration: 500,
      scrollAnimationDelay: 50,
      postCardLayout: {
        sections: [
          {
            id: "sec-image",
            orientation: "vertical",
            children: [
              { type: "element", id: "thumbnail" },
              { type: "element", id: "title" },
            ],
          },
        ],
      },
      pageLayout: {
        sections: [
          {
            id: "page-sec-1",
            slot: "top",
            orientation: "horizontal",
            elements: ["header"],
            active: true,
          },
          {
            id: "page-sec-3",
            slot: "main",
            orientation: "vertical",
            elements: ["posts"],
            active: true,
          },
          {
            id: "page-sec-4",
            slot: "bottom",
            orientation: "horizontal",
            elements: ["footer"],
            active: true,
          },
        ],
      },
      pageLayoutConfig: {
        template: "no-sidebar",
        containers: {
          top: { elements: [{ id: "header", active: true }] },
          sidebarLeft: { elements: [] },
          sidebarRight: { elements: [] },
          bottom: { elements: [{ id: "footer", active: true }] },
        },
      },
    },
  },
  {
    name: "classic-blog",
    settings: {
      postsLayout: "list",
      gridColumns: 1,
      cardLayout: "horizontal",
      thumbnailSizePx: 120,
      cardPaddingPx: 24,
      cardBorderRadiusPx: 12,
      titleSizePx: 20,
      cardGapPx: 24,
      cardBorder: true,
      showSummary: true,
      summaryMaxLength: 180,
      showTags: true,
      maxTags: 4,
      showDate: true,
      showVotes: true,
      showComments: true,
      showPayout: true,
      showThumbnail: true,
      cardHoverEffect: "shadow",
      cardHoverShadow: "md",
      scrollAnimationType: "fade",
      scrollAnimationDuration: 400,
      scrollAnimationDelay: 80,
      postCardLayout: {
        sections: [
          {
            id: "sec-card",
            orientation: "horizontal",
            children: [
              { type: "element", id: "thumbnail" },
              {
                type: "section",
                section: {
                  id: "sec-body",
                  orientation: "vertical",
                  children: [
                    { type: "element", id: "title" },
                    { type: "element", id: "summary" },
                    {
                      type: "section",
                      section: {
                        id: "sec-footer",
                        orientation: "horizontal",
                        children: [
                          { type: "element", id: "date" },
                          { type: "element", id: "votes" },
                          { type: "element", id: "comments" },
                          { type: "element", id: "payout" },
                        ],
                      },
                    },
                    { type: "element", id: "tags" },
                  ],
                },
              },
            ],
          },
        ],
      },
      pageLayout: {
        sections: [
          {
            id: "page-sec-1",
            slot: "top",
            orientation: "horizontal",
            elements: ["header"],
            active: true,
          },
          {
            id: "page-sec-2",
            slot: "sidebar-left",
            orientation: "vertical",
            elements: ["authorProfile"],
            active: true,
          },
          {
            id: "page-sec-3",
            slot: "main",
            orientation: "vertical",
            elements: ["posts"],
            active: true,
          },
          {
            id: "page-sec-4",
            slot: "bottom",
            orientation: "horizontal",
            elements: ["footer"],
            active: true,
          },
        ],
      },
      pageLayoutConfig: {
        template: "sidebar-left",
        containers: {
          top: { elements: [{ id: "header", active: true }] },
          sidebarLeft: { elements: [{ id: "authorProfile", active: true }] },
          sidebarRight: { elements: [] },
          bottom: { elements: [{ id: "footer", active: true }] },
        },
      },
    },
  },
  {
    name: "magazine-grid",
    settings: {
      postsLayout: "grid",
      gridColumns: 3,
      cardLayout: "vertical",
      thumbnailSizePx: 200,
      cardPaddingPx: 16,
      cardBorderRadiusPx: 12,
      titleSizePx: 18,
      cardGapPx: 20,
      cardBorder: true,
      showSummary: true,
      summaryMaxLength: 100,
      showTags: true,
      maxTags: 2,
      showDate: true,
      showVotes: true,
      showComments: true,
      showPayout: false,
      showThumbnail: true,
      cardHoverEffect: "lift",
      cardHoverScale: 1.02,
      cardHoverShadow: "xl",
      scrollAnimationType: "slide-up",
      scrollAnimationDuration: 350,
      scrollAnimationDelay: 75,
      postCardLayout: {
        sections: [
          {
            id: "sec-card",
            orientation: "vertical",
            children: [
              { type: "element", id: "thumbnail" },
              {
                type: "section",
                section: {
                  id: "sec-content",
                  orientation: "vertical",
                  children: [
                    { type: "element", id: "tags" },
                    { type: "element", id: "title" },
                    { type: "element", id: "summary" },
                    {
                      type: "section",
                      section: {
                        id: "sec-stats",
                        orientation: "horizontal",
                        children: [
                          { type: "element", id: "date" },
                          { type: "element", id: "votes" },
                          { type: "element", id: "comments" },
                        ],
                      },
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
      pageLayout: {
        sections: [
          {
            id: "page-sec-1",
            slot: "top",
            orientation: "horizontal",
            elements: ["header"],
            active: true,
          },
          {
            id: "page-sec-3",
            slot: "main",
            orientation: "vertical",
            elements: ["posts"],
            active: true,
          },
          {
            id: "page-sec-2",
            slot: "sidebar-right",
            orientation: "vertical",
            elements: ["authorProfile"],
            active: true,
          },
          {
            id: "page-sec-4",
            slot: "bottom",
            orientation: "horizontal",
            elements: ["footer"],
            active: true,
          },
        ],
      },
      pageLayoutConfig: {
        template: "sidebar-right",
        containers: {
          top: { elements: [{ id: "header", active: true }] },
          sidebarLeft: { elements: [] },
          sidebarRight: { elements: [{ id: "authorProfile", active: true }] },
          bottom: { elements: [{ id: "footer", active: true }] },
        },
      },
    },
  },
  {
    name: "compact-grid",
    settings: {
      postsLayout: "grid",
      gridColumns: 4,
      cardLayout: "vertical",
      thumbnailSizePx: 180,
      cardPaddingPx: 8,
      cardBorderRadiusPx: 8,
      titleSizePx: 14,
      cardGapPx: 12,
      cardBorder: true,
      showSummary: false,
      showTags: true,
      maxTags: 2,
      showDate: false,
      showVotes: true,
      showComments: true,
      showPayout: false,
      showThumbnail: true,
      cardHoverEffect: "scale",
      cardHoverScale: 1.05,
      cardTransitionDuration: 200,
      scrollAnimationType: "slide-up",
      scrollAnimationDuration: 350,
      scrollAnimationDelay: 50,
      postCardLayout: {
        sections: [
          {
            id: "sec-card",
            orientation: "vertical",
            children: [
              { type: "element", id: "thumbnail" },
              { type: "element", id: "title" },
              {
                type: "section",
                section: {
                  id: "sec-stats",
                  orientation: "horizontal",
                  children: [
                    { type: "element", id: "votes" },
                    { type: "element", id: "comments" },
                  ],
                },
              },
              { type: "element", id: "tags" },
            ],
          },
        ],
      },
      pageLayout: {
        sections: [
          {
            id: "page-sec-1",
            slot: "top",
            orientation: "horizontal",
            elements: ["header"],
            active: true,
          },
          {
            id: "page-sec-3",
            slot: "main",
            orientation: "vertical",
            elements: ["posts"],
            active: true,
          },
          {
            id: "page-sec-4",
            slot: "bottom",
            orientation: "horizontal",
            elements: ["footer"],
            active: true,
          },
        ],
      },
      pageLayoutConfig: {
        template: "no-sidebar",
        containers: {
          top: { elements: [{ id: "header", active: true }] },
          sidebarLeft: { elements: [] },
          sidebarRight: { elements: [] },
          bottom: { elements: [{ id: "footer", active: true }] },
        },
      },
    },
  },
  {
    name: "wide-masonry",
    settings: {
      postsLayout: "masonry",
      gridColumns: 2,
      cardLayout: "vertical",
      thumbnailSizePx: 260,
      cardPaddingPx: 16,
      cardBorderRadiusPx: 16,
      titleSizePx: 18,
      cardGapPx: 20,
      cardBorder: true,
      showSummary: true,
      summaryMaxLength: 140,
      showTags: true,
      maxTags: 3,
      showDate: true,
      showVotes: true,
      showComments: false,
      showPayout: false,
      showThumbnail: true,
      cardHoverEffect: "glow",
      cardHoverBrightness: 1.08,
      scrollAnimationType: "zoom",
      scrollAnimationDuration: 400,
      scrollAnimationDelay: 80,
      postCardLayout: {
        sections: [
          {
            id: "sec-card",
            orientation: "vertical",
            children: [
              { type: "element", id: "thumbnail" },
              {
                type: "section",
                section: {
                  id: "sec-details",
                  orientation: "vertical",
                  children: [
                    { type: "element", id: "title" },
                    { type: "element", id: "summary" },
                    {
                      type: "section",
                      section: {
                        id: "sec-meta",
                        orientation: "horizontal",
                        children: [
                          { type: "element", id: "date" },
                          { type: "element", id: "votes" },
                        ],
                      },
                    },
                    { type: "element", id: "tags" },
                  ],
                },
              },
            ],
          },
        ],
      },
      pageLayout: {
        sections: [
          {
            id: "page-sec-1",
            slot: "top",
            orientation: "horizontal",
            elements: ["header"],
            active: true,
          },
          {
            id: "page-sec-3",
            slot: "main",
            orientation: "vertical",
            elements: ["posts"],
            active: true,
          },
          {
            id: "page-sec-4",
            slot: "bottom",
            orientation: "horizontal",
            elements: ["footer"],
            active: true,
          },
        ],
      },
      pageLayoutConfig: {
        template: "no-sidebar",
        containers: {
          top: { elements: [{ id: "header", active: true }] },
          sidebarLeft: { elements: [] },
          sidebarRight: { elements: [] },
          bottom: { elements: [{ id: "footer", active: true }] },
        },
      },
    },
  },
];

// ============================================
// Template application (pure, unit-tested)
// ============================================

const USER_PROFILE_ELEMENT = "authorProfile";
const COMMUNITY_PROFILE_ELEMENTS = [
  "communityProfile",
  "communitySidebar",
] as const;

function replace_profile_in_container(
  container: ContainerConfig,
): ContainerConfig {
  const elements: ContainerElement[] = [];
  for (const element of container.elements) {
    if (element.id === USER_PROFILE_ELEMENT) {
      for (const id of COMMUNITY_PROFILE_ELEMENTS) {
        elements.push({ id, active: element.active });
      }
    } else {
      elements.push({ ...element });
    }
  }
  return { elements };
}

function container_has_community_profile(container: ContainerConfig): boolean {
  return container.elements.some(
    (e) => e.id === "communityProfile" || e.id === "communitySidebar",
  );
}

function adapt_page_layout_config(config: PageLayoutConfig): PageLayoutConfig {
  const containers = {
    top: replace_profile_in_container(config.containers.top),
    sidebarLeft: replace_profile_in_container(config.containers.sidebarLeft),
    sidebarRight: replace_profile_in_container(config.containers.sidebarRight),
    bottom: replace_profile_in_container(config.containers.bottom),
  };
  const has_community = Object.values(containers).some(
    container_has_community_profile,
  );
  if (!has_community) {
    // Full-width templates have no sidebar: keep the community block visible below the header.
    containers.top = {
      elements: [
        ...containers.top.elements,
        ...COMMUNITY_PROFILE_ELEMENTS.map((id) => ({ id, active: true })),
      ],
    };
  }
  return { template: config.template, containers };
}

function adapt_page_layout(layout: PageLayout): PageLayout {
  const sections = layout.sections.map((section) => ({
    ...section,
    elements: section.elements.flatMap((id) =>
      id === USER_PROFILE_ELEMENT ? [...COMMUNITY_PROFILE_ELEMENTS] : [id],
    ),
  }));
  const has_community = sections.some((s) =>
    s.elements.some(
      (id) => id === "communityProfile" || id === "communitySidebar",
    ),
  );
  if (!has_community) {
    const top_index = sections.findIndex((s) => s.slot === "top");
    if (top_index >= 0) {
      const top = sections[top_index];
      sections[top_index] = {
        ...top,
        elements: [...top.elements, ...COMMUNITY_PROFILE_ELEMENTS],
      };
    }
  }
  return { sections };
}

/**
 * Replace the user-only authorProfile with communityProfile + communitySidebar.
 * Templates without a profile get the community block appended to the top container.
 */
export function adapt_layout_for_community(
  template_settings: Partial<SettingsData>,
): Partial<SettingsData> {
  const result: Partial<SettingsData> = { ...template_settings };
  if (template_settings.pageLayoutConfig) {
    result.pageLayoutConfig = adapt_page_layout_config(
      template_settings.pageLayoutConfig,
    );
  }
  if (template_settings.pageLayout) {
    result.pageLayout = adapt_page_layout(template_settings.pageLayout);
  }
  return result;
}
