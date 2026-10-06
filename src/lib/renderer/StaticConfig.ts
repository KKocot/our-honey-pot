// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

/**
 * This file is based on
 *  - https://github.com/openhive-network/condenser/blob/master/src/app/utils/SanitizeConfig.js
 */

/**
 * Static configuration class for content sanitization and iframe handling.
 *
 * This class provides configuration settings for:
 * - Whitelisted iframe sources with their validation and transformation rules
 * - Text to display when images are hidden due to low ratings
 * - Allowed HTML tags for content rendering
 *
 * The iframe whitelist includes support for:
 * - Twitter/X.com embedded tweets
 * - Vimeo video embeds
 * - YouTube video embeds
 * - SoundCloud audio players
 * - Twitch.tv video players
 * - Spotify embeds (playlists, shows, episodes, albums, tracks, artists)
 * - 3speak video embeds
 */
const TWITCH_CHANNEL_PATTERN = /^[A-Za-z0-9_]{1,25}$/;
const TWITCH_VIDEO_PATTERN = /^v?\d{1,20}$/;
const TWITCH_COLLECTION_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const HOSTNAME_PATTERN = /^[a-z0-9.-]{1,253}$/i;

function build_twitch_player_url(src: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(src, "https://player.twitch.tv");
  } catch {
    return null;
  }
  if (parsed.hostname !== "player.twitch.tv" || parsed.pathname !== "/") {
    return null;
  }
  const params = new URLSearchParams();
  const channel = parsed.searchParams.get("channel");
  const video = parsed.searchParams.get("video");
  const collection = parsed.searchParams.get("collection");
  if (channel && TWITCH_CHANNEL_PATTERN.test(channel)) {
    params.set("channel", channel);
  } else if (video && TWITCH_VIDEO_PATTERN.test(video)) {
    params.set("video", video);
  } else if (collection && TWITCH_COLLECTION_PATTERN.test(collection)) {
    params.set("collection", collection);
  } else {
    return null;
  }
  for (const parent of parsed.searchParams.getAll("parent")) {
    if (HOSTNAME_PATTERN.test(parent)) {
      params.append("parent", parent);
    }
  }
  return `https://player.twitch.tv/?${params.toString()}`;
}

export class StaticConfig {
  public static sanitization = {
    iframeWhitelist: [
      {
        // eslint-disable-next-line security/detect-unsafe-regex
        re: /^(?:@?(?:https?:)?\/\/)?(?:www\.)?(twitter|x)\.com\/(?:\w+\/status|status)\/(\d{1,20})/i,
        fn: (src: string) => {
          if (!src) {
            return null;
          }
          const cleanSrc = src.replace(/^(@|https?:\/\/)/, "");
          const match = cleanSrc.match(
            /(?:twitter|x)\.com\/(?:\w+\/status|status)\/(\d{1,20})/i,
          );
          if (!match || match.length !== 2) {
            return null;
          }
          return `https://platform.twitter.com/embed/Tweet.html?id=${match[1]}`;
        },
      },
      {
        // eslint-disable-next-line security/detect-unsafe-regex
        re: /^(https?:)?\/\/player\.vimeo\.com\/video\/.*/i,
        fn: (src: string) => {
          // <iframe src="https://player.vimeo.com/video/179213493" width="640" height="360" frameborder="0" webkitallowfullscreen mozallowfullscreen allowfullscreen></iframe>
          if (!src) {
            return null;
          }
          const m = src.match(/https:\/\/player\.vimeo\.com\/video\/([0-9]+)/);
          if (!m || m.length !== 2) {
            return null;
          }
          return "https://player.vimeo.com/video/" + m[1];
        },
      },
      {
        // eslint-disable-next-line security/detect-unsafe-regex
        re: /^(?:https?:)?\/\/www\.youtube\.com\/embed\/[A-Za-z0-9_-]+(?:[?#]|$)/i,
        fn: (src: string) => {
          const m = src.match(
            /^(?:https?:)?\/\/www\.youtube\.com\/embed\/([A-Za-z0-9_-]{1,64})(?:[?#]|$)/i,
          );
          if (!m) {
            return null;
          }
          return `https://www.youtube.com/embed/${m[1]}`;
        },
      },
      {
        re: /^https:\/\/w\.soundcloud\.com\/player\/.*/i,
        fn: (src: string) => {
          if (!src) {
            return null;
          }
          // <iframe width="100%" height="450" scrolling="no" frameborder="no" src="https://w.soundcloud.com/player/?url=https%3A//api.soundcloud.com/tracks/257659076&amp;auto_play=false&amp;hide_related=false&amp;show_comments=true&amp;show_user=true&amp;show_reposts=false&amp;visual=true"></iframe>
          const m = src.match(/url=(.+?)&/);
          if (!m || m.length !== 2) {
            return null;
          }
          return `https://w.soundcloud.com/player/?url=${m[1]}&auto_play=false&hide_related=false&show_comments=true&show_user=true&show_reposts=false&visual=true`;
        },
      },
      {
        // eslint-disable-next-line security/detect-unsafe-regex
        re: /^(?:https?:)?\/\/player\.twitch\.tv\/\?/i,
        fn: (src: string) => {
          // <iframe src="https://player.twitch.tv/?channel=ninja" frameborder="0" allowfullscreen="true" scrolling="no" height="378" width="620">
          return build_twitch_player_url(src);
        },
      },
      {
        re: /^https:\/\/open\.spotify\.com\/(embed|embed-podcast)\/(playlist|show|episode|album|track|artist)\/(.*)/i,
        fn: (src: string) => {
          return src;
        },
      },
      {
        // eslint-disable-next-line security/detect-unsafe-regex
        re: /^(?:https?:)?\/\/(?:3speak\.(?:tv|online|co))\/embed\?v=([^&\s]+)/i,
        fn: (src: string) => {
          if (!src) return null;
          const match = src.match(
            /3speak\.(?:tv|online|co)\/embed\?v=([^&\s]+)/i,
          );
          if (!match || match.length !== 2) return null;
          return `https://3speak.tv/embed?v=${match[1]}`;
        },
      },
      {
        // eslint-disable-next-line security/detect-unsafe-regex
        re: /^(?:https?:)?\/\/(?:3speak\.(?:tv|online|co))\/watch\?v=([^&\s]+)/i,
        fn: (src: string) => {
          if (!src) return null;
          const match = src.match(
            /3speak\.(?:tv|online|co)\/watch\?v=([^&\s]+)/i,
          );
          if (!match || match.length !== 2) return null;
          return `https://3speak.tv/embed?v=${match[1]}`;
        },
      },
      {
        re: /^(?:https:)\/\/(?:www\.)?(twitter|x)\.com\/(?:\w+\/status|status)\/(\d{1,20})/i,
        fn: (src: string) => {
          if (!src) {
            return null;
          }
          const match = src.match(
            /(?:twitter|x)\.com\/(?:\w+\/status|status)\/(\d{1,20})/i,
          );
          if (!match || match.length !== 2) {
            return null;
          }
          return `https://platform.twitter.com/embed/Tweet.html?id=${match[1]}`;
        },
      },
    ],
    noImageText: "(Image not shown due to low ratings)",
    allowedTags: `
    div, iframe, del, span,
    a, p, b, i, q, br, ul, li, ol, img, h1, h2, h3, h4, h5, h6, hr,
    blockquote, pre, code, em, strong, center, table, thead, tbody, tr, th, td,
    strike, sup, sub, details, summary
`
      .trim()
      .split(/,\s*/),
  };
}
