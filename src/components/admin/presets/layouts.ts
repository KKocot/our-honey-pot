// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import type { SettingsData } from '../types/settings'

/* Layout and motion halves of the former website templates the blog presets derive from. */

export const MINIMAL_WRITER_BASE: Partial<SettingsData> = {
  postsLayout: 'list',
  gridColumns: 1,
  cardLayout: 'vertical',
  thumbnailSizePx: 0,
  showThumbnail: false,
  showSummary: true,
  summaryMaxLength: 350,
  showDate: true,
  showVotes: false,
  showComments: false,
  showPayout: false,
  showTags: false,
  titleSizePx: 28,
  postCardLayout: {
    sections: [
      {
        id: 'sec-article',
        orientation: 'vertical',
        children: [
          { type: 'element', id: 'title' },
          { type: 'element', id: 'date' },
          { type: 'element', id: 'summary' },
        ],
      },
    ],
  },
  pageLayoutConfig: {
    template: 'no-sidebar',
    containers: {
      top: {
        elements: [{ id: 'header', active: true }],
      },
      sidebarLeft: { elements: [] },
      sidebarRight: { elements: [] },
      bottom: { elements: [] },
    },
  },
  cardHoverEffect: 'none',
  scrollAnimationType: 'fade',
  scrollAnimationDuration: 600,
  scrollAnimationDelay: 0,
}

export const DEVELOPER_BLOG_BASE: Partial<SettingsData> = {
  postsLayout: 'list',
  gridColumns: 1,
  cardLayout: 'horizontal',
  thumbnailSizePx: 100,
  showSummary: true,
  summaryMaxLength: 180,
  showDate: true,
  showVotes: true,
  showComments: true,
  showPayout: false,
  showTags: true,
  maxTags: 5,
  titleSizePx: 20,
  postCardLayout: {
    sections: [
      {
        id: 'sec-main',
        orientation: 'horizontal',
        children: [
          { type: 'element', id: 'thumbnail' },
          {
            type: 'section',
            section: {
              id: 'sec-content',
              orientation: 'vertical',
              children: [
                { type: 'element', id: 'title' },
                { type: 'element', id: 'summary' },
                {
                  type: 'section',
                  section: {
                    id: 'sec-meta',
                    orientation: 'horizontal',
                    children: [
                      { type: 'element', id: 'date' },
                      { type: 'element', id: 'votes' },
                      { type: 'element', id: 'comments' },
                    ],
                  },
                },
                { type: 'element', id: 'tags' },
              ],
            },
          },
        ],
      },
    ],
  },
  pageLayoutConfig: {
    template: 'sidebar-left',
    containers: {
      top: {
        elements: [{ id: 'header', active: true }],
      },
      sidebarLeft: {
        elements: [{ id: 'authorProfile', active: true }],
      },
      sidebarRight: { elements: [] },
      bottom: {
        elements: [{ id: 'footer', active: true }],
      },
    },
  },
  cardHoverEffect: 'glow',
  cardHoverBrightness: 1.05,
  scrollAnimationType: 'slide-left',
  scrollAnimationDuration: 300,
  scrollAnimationDelay: 80,
}

export const PHOTO_PORTFOLIO_BASE: Partial<SettingsData> = {
  postsLayout: 'masonry',
  gridColumns: 3,
  cardLayout: 'vertical',
  thumbnailSizePx: 350,
  showSummary: false,
  showDate: false,
  showVotes: false,
  showComments: false,
  showPayout: false,
  showTags: false,
  titleSizePx: 14,
  postCardLayout: {
    sections: [
      {
        id: 'sec-image',
        orientation: 'vertical',
        children: [
          { type: 'element', id: 'thumbnail' },
          { type: 'element', id: 'title' },
        ],
      },
    ],
  },
  pageLayoutConfig: {
    template: 'no-sidebar',
    containers: {
      top: {
        elements: [{ id: 'header', active: true }],
      },
      sidebarLeft: { elements: [] },
      sidebarRight: { elements: [] },
      bottom: {
        elements: [{ id: 'footer', active: true }],
      },
    },
  },
  cardHoverEffect: 'scale',
  cardTransitionDuration: 300,
  cardHoverScale: 1.03,
  scrollAnimationType: 'zoom',
  scrollAnimationDuration: 500,
  scrollAnimationDelay: 50,
}

export const TECH_MAGAZINE_BASE: Partial<SettingsData> = {
  postsLayout: 'grid',
  gridColumns: 3,
  cardLayout: 'vertical',
  thumbnailSizePx: 200,
  showSummary: true,
  summaryMaxLength: 100,
  showDate: true,
  showVotes: true,
  showComments: true,
  showPayout: false,
  showTags: true,
  maxTags: 2,
  titleSizePx: 18,
  postCardLayout: {
    sections: [
      {
        id: 'sec-card',
        orientation: 'vertical',
        children: [
          { type: 'element', id: 'thumbnail' },
          {
            type: 'section',
            section: {
              id: 'sec-content',
              orientation: 'vertical',
              children: [
                { type: 'element', id: 'tags' },
                { type: 'element', id: 'title' },
                { type: 'element', id: 'summary' },
                {
                  type: 'section',
                  section: {
                    id: 'sec-stats',
                    orientation: 'horizontal',
                    children: [
                      { type: 'element', id: 'date' },
                      { type: 'element', id: 'votes' },
                      { type: 'element', id: 'comments' },
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
  pageLayoutConfig: {
    template: 'sidebar-right',
    containers: {
      top: {
        elements: [{ id: 'header', active: true }],
      },
      sidebarLeft: { elements: [] },
      sidebarRight: {
        elements: [{ id: 'authorProfile', active: true }],
      },
      bottom: {
        elements: [{ id: 'footer', active: true }],
      },
    },
  },
  cardHoverEffect: 'lift',
  cardHoverScale: 1.02,
  cardHoverShadow: 'xl',
  scrollAnimationType: 'slide-up',
  scrollAnimationDuration: 350,
  scrollAnimationDelay: 75,
}
