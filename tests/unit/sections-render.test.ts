// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { describe, expect, it } from "vitest";
import {
  home_hero_shown,
  home_lead_section_ids,
  home_priority_section_id,
  render_section_html,
  render_section_markdown,
  split_home_sections,
  type HomeSection,
  type SectionRenderSettings,
} from "../../src/shared/components/sections";
import { HomeSectionSchema } from "../../src/components/admin/types/settings-schema";
import { get_default_settings } from "../../src/components/admin/types/settings";
import type { LayoutTemplate } from "../../src/components/admin/types/layout";
import { t } from "../../src/lib/i18n";
import { parse_fragment } from "./helpers/html-assert";

const IMAGE = "https://images.hive.blog/DQm/portrait.jpg";

function section(raw: Record<string, unknown>): HomeSection {
  return HomeSectionSchema.parse(raw);
}

function base_settings(
  overrides: Partial<SectionRenderSettings> = {},
): SectionRenderSettings {
  const defaults = get_default_settings(true);
  return {
    ...defaults,
    footer: {
      ...defaults.footer,
      privacy: { label: "Privacy", kind: "page", target: "privacy" },
    },
    ...overrides,
  };
}

function render(
  raw: Record<string, unknown>,
  settings: SectionRenderSettings = base_settings(),
  locale?: string,
): HTMLElement {
  return parse_fragment(render_section_html(section(raw), settings, locale));
}

const hero = (overrides: Record<string, unknown> = {}) => ({
  id: "hero0001",
  type: "hero",
  content: {
    headline: "Hello world",
    subheadline: "Short pitch",
    cta: [
      { label: "Start", url: "https://example.com/start" },
      { label: "Mail me", url: "mailto:me@example.com" },
    ],
    image: { url: IMAGE, alt: "Portrait", w: 1200, h: 1500 },
    ...((overrides.content as object) ?? {}),
  },
  style: { ...((overrides.style as object) ?? {}) },
});

const text_media = (overrides: Record<string, unknown> = {}) => ({
  id: "about001",
  type: "text-media",
  content: {
    title: "About me",
    body_md:
      "First **bold** and *em*.\n\n- one\n- two\n\n1. a\n2. b\n\n[site](https://example.com)",
    image: { url: IMAGE, alt: "Me" },
    ...((overrides.content as object) ?? {}),
  },
  style: { ...((overrides.style as object) ?? {}) },
});

const cta_band = (overrides: Record<string, unknown> = {}) => ({
  id: "newsl001",
  type: "cta-band",
  content: {
    title: "Join the newsletter",
    body: "Once a month",
    button: { label: "Subscribe", url: "https://newsletter.example/join" },
    ...((overrides.content as object) ?? {}),
  },
  style: { ...((overrides.style as object) ?? {}) },
});

describe("render_section_html: hero", () => {
  it("split (default) renders H1, CTAs and an LCP image with zero-CLS sizing", () => {
    const root = parse_fragment(
      render_section_html(section(hero()), base_settings(), undefined, {
        priority: true,
      }),
    );
    const el = root.querySelector("section")!;
    expect(el.id).toBe("s-hero0001");
    expect(el.classList).toContain("section-hero-split");
    expect(el.classList).toContain("section-media-end");
    expect(el.getAttribute("aria-labelledby")).toBe("s-hero0001-title");
    expect(root.querySelector("h1")?.textContent).toBe("Hello world");

    const img = root.querySelector("img")!;
    expect(img.getAttribute("loading")).toBe("eager");
    expect(img.getAttribute("fetchpriority")).toBe("high");
    expect(img.getAttribute("width")).toBe("640");
    expect(img.getAttribute("height")).toBe("800");
    expect(img.getAttribute("style")).toBe("aspect-ratio: 1200 / 1500;");
    expect(img.getAttribute("src")).toContain(
      "/640x0/https://images.hive.blog/",
    );
    expect(img.getAttribute("srcset")).toContain("/1280x0/");
    expect(img.getAttribute("alt")).toBe("Portrait");
  });

  it("first CTA is primary, second secondary; https opens in a new tab with an sr-only hint", () => {
    const links = Array.from(render(hero()).querySelectorAll("a"));
    expect(links).toHaveLength(2);
    expect(links[0].classList).toContain("section-btn-primary");
    expect(links[0].getAttribute("target")).toBe("_blank");
    expect(links[0].getAttribute("rel")).toBe("noopener noreferrer");
    expect(links[0].querySelector(".sr-only")?.textContent?.trim()).toBe(
      t("en", "section.opens_new_tab"),
    );
    expect(links[1].classList).toContain("section-btn-secondary");
    expect(links[1].getAttribute("href")).toBe("mailto:me@example.com");
    expect(links[1].hasAttribute("target")).toBe(false);
  });

  it("image_side start, height and align map to classes", () => {
    const el = render(
      hero({ style: { image_side: "start", height: "lg", align: "center" } }),
    ).querySelector("section")!;
    expect(el.classList).toContain("section-media-start");
    expect(el.classList).toContain("section-height-lg");
    expect(el.classList).toContain("section-align-center");
  });

  it("variants needing an image fall back to text-centric without one", () => {
    const root = render({
      ...hero({ style: { variant: "stacked", align: "start" } }),
      content: { headline: "No image" },
    });
    const el = root.querySelector("section")!;
    expect(el.classList).toContain("section-hero-text-centric");
    expect(el.classList).toContain("section-align-center");
    expect(root.querySelector("img")).toBeNull();
  });

  it("text-centric ignores the image", () => {
    const root = render(hero({ style: { variant: "text-centric" } }));
    expect(root.querySelector("img")).toBeNull();
  });

  it("stacked puts the image above the text with a 16:9 fallback ratio", () => {
    const root = render(
      hero({
        style: { variant: "stacked" },
        content: { image: { url: IMAGE, alt: "Wide" } },
      }),
    );
    const body = root.querySelector(".section-hero-body")!;
    expect(body.firstElementChild?.classList).toContain("section-hero-media");
    const img = root.querySelector("img")!;
    expect(img.getAttribute("style")).toBe("aspect-ratio: 16 / 9;");
    expect(img.getAttribute("width")).toBe("1280");
    expect(img.getAttribute("height")).toBe("720");
  });

  it("hero image without priority loads lazily", () => {
    const img = render(hero()).querySelector("img")!;
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.hasAttribute("fetchpriority")).toBe(false);
  });

  it("overlay uses the image as an eager backdrop and enforces at least dark-50", () => {
    const root = parse_fragment(
      render_section_html(
        section(hero({ style: { variant: "overlay", overlay: "dark-30" } })),
        base_settings(),
        undefined,
        { priority: true },
      ),
    );
    const backdrop = root.querySelector("img.section-backdrop")!;
    expect(backdrop.getAttribute("fetchpriority")).toBe("high");
    expect(root.querySelector(".section-overlay-dark-50")).not.toBeNull();
    expect(root.querySelector("section")!.classList).toContain(
      "section-tone-image-dark",
    );
  });

  it("empty headline renders nothing", () => {
    const raw = hero();
    const broken = {
      ...section(raw),
      content: { headline: "   " },
    } as unknown as HomeSection;
    expect(render_section_html(broken, base_settings())).toBe("");
  });
});

describe("render_section_html: text-media", () => {
  it("renders title, minimal markdown, lazy image with the default 4:5 ratio", () => {
    const root = render(text_media());
    expect(root.querySelector("h2")?.textContent).toBe("About me");
    expect(root.querySelector(".section-md strong")?.textContent).toBe("bold");
    expect(root.querySelector(".section-md em")?.textContent).toBe("em");
    expect(root.querySelectorAll(".section-md ul li")).toHaveLength(2);
    expect(root.querySelectorAll(".section-md ol li")).toHaveLength(2);
    expect(root.querySelector(".section-md a")?.getAttribute("href")).toBe(
      "https://example.com/",
    );
    const img = root.querySelector("img")!;
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.hasAttribute("fetchpriority")).toBe(false);
    expect(img.getAttribute("style")).toBe("aspect-ratio: 4 / 5;");
    expect(img.classList).toContain("section-shape-rounded");
    const el = root.querySelector("section")!;
    expect(el.classList).toContain("section-media-start");
    expect(
      el.querySelector(".section-tm-body")!.firstElementChild?.classList,
    ).toContain("section-tm-media");
  });

  it("circle shape forces 1:1, ratio and image_side map through", () => {
    const circle = render(
      text_media({ style: { image_shape: "circle", ratio: "16:9" } }),
    ).querySelector("img")!;
    expect(circle.getAttribute("style")).toBe("aspect-ratio: 1 / 1;");
    expect(circle.classList).toContain("section-shape-circle");

    const wide = render(
      text_media({ style: { ratio: "3:2", image_side: "end" } }),
    );
    expect(wide.querySelector("img")!.getAttribute("style")).toBe(
      "aspect-ratio: 3 / 2;",
    );
    expect(wide.querySelector("section")!.classList).toContain(
      "section-media-end",
    );
  });

  it("without an image renders a text-only section", () => {
    const root = render({
      ...text_media(),
      content: { title: "Only text", body_md: "Hello" },
    });
    expect(root.querySelector("img")).toBeNull();
    expect(root.querySelector("section")!.classList).toContain(
      "section-tm-text-only",
    );
  });

  it("empty content renders nothing", () => {
    expect(
      render_section_html(
        section({ id: "empty001", type: "text-media", content: {}, style: {} }),
      ),
    ).toBe("");
  });
});

describe("render_section_html: cta-band", () => {
  it("notice mode: button, default consent text and the footer privacy link", () => {
    const root = render(cta_band());
    const el = root.querySelector("section")!;
    expect(el.classList).toContain("section-cta-band");
    expect(el.classList).toContain("section-align-center");
    expect(root.querySelector("h2")?.textContent).toBe("Join the newsletter");
    const button = root.querySelector("a.section-btn-primary")!;
    expect(button.getAttribute("href")).toBe("https://newsletter.example/join");
    expect(button.getAttribute("target")).toBe("_blank");
    const consent = root.querySelector(".section-consent-text")!;
    expect(consent.textContent).toContain(t("en", "cta.consent_default"));
    const privacy = consent.querySelector("a")!;
    expect(privacy.getAttribute("href")).toBe("/p/privacy");
    expect(privacy.textContent).toBe(t("en", "cta.privacy_link"));
    expect(root.querySelector("input")).toBeNull();
  });

  it("checkbox mode locks the button behind a labelled checkbox without script", () => {
    const html = render_section_html(
      section(
        cta_band({
          content: { consent_mode: "checkbox", consent_text: "Custom consent" },
        }),
      ),
      base_settings(),
    );
    const root = parse_fragment(html);
    const input = root.querySelector("label input[type=checkbox]")!;
    expect(input).not.toBeNull();
    expect(input.closest("label")?.textContent).toContain(
      t("en", "cta.consent_checkbox"),
    );
    expect(root.querySelector(".section-consent-unlocked a")).not.toBeNull();
    const locked = root.querySelector("span.section-consent-locked")!;
    expect(locked.getAttribute("aria-disabled")).toBe("true");
    expect(locked.getAttribute("role")).toBe("link");
    expect(locked.textContent).toBe("Subscribe");
    const required = root.querySelector("#s-newsl001-consent-required");
    expect(required?.textContent).toBe(t("en", "section.consent_required"));
    expect(input.getAttribute("aria-describedby")).toBe(
      "s-newsl001-consent-required",
    );
    expect(locked.getAttribute("aria-describedby")).toBe(
      "s-newsl001-consent-required",
    );
    expect(root.textContent).toContain(t("en", "section.consent_required"));
    expect(root.querySelector(".section-consent-text")?.textContent).toContain(
      "Custom consent",
    );
    expect(html).not.toMatch(/<script|<form|<iframe/i);
  });

  it("variants and align map to classes", () => {
    for (const variant of ["band", "card", "split"]) {
      const el = render(
        cta_band({ style: { variant, align: "start" } }),
      ).querySelector("section")!;
      expect(el.classList).toContain(`section-cta-${variant}`);
      expect(el.classList).toContain("section-align-start");
    }
  });

  it("without footer.privacy the consent text stays, the link is omitted", () => {
    const settings = base_settings();
    settings.footer = { ...settings.footer!, privacy: undefined };
    const root = render(cta_band(), settings);
    expect(root.querySelector(".section-consent-text a")).toBeNull();
    expect(root.querySelector(".section-consent-text")).not.toBeNull();
  });
});

describe("render_section_html: posts, hidden, common style", () => {
  it("posts and hidden sections render ''", () => {
    expect(
      render_section_html(
        section({ id: "posts001", type: "posts", content: {}, style: {} }),
      ),
    ).toBe("");
    expect(render_section_html(section({ ...hero(), hidden: true }))).toBe("");
  });

  it("width full bleeds only without sidebars", () => {
    const raw = hero({ style: { width: "full", bg: "bg-secondary" } });
    const no_sidebar = base_settings();
    no_sidebar.pageLayoutConfig = {
      ...no_sidebar.pageLayoutConfig!,
      template: "no-sidebar",
    };
    const full = render(raw, no_sidebar).querySelector("section")!;
    expect(full.classList).toContain("section-full");

    const settings = base_settings();
    settings.pageLayoutConfig = {
      ...settings.pageLayoutConfig!,
      template: "sidebar-right",
    };
    const boxed = render(raw, settings).querySelector("section")!;
    expect(boxed.classList).not.toContain("section-full");
    expect(boxed.classList).toContain("section-boxed");
  });

  it("spacing and background tokens map to classes, primary derives its text tone", () => {
    const el = render(
      hero({ style: { spacing: "lg", bg: "primary" } }),
    ).querySelector("section")!;
    expect(el.classList).toContain("section-space-lg");
    expect(el.classList).toContain("section-bg-primary");
    expect(el.classList).toContain("section-tone-primary");
  });

  it("accent picks the readable token or falls back to bg-secondary below 4.5:1", () => {
    const palette = {
      bg: "#ffffff",
      bgSecondary: "#eeeeee",
      bgCard: "#ffffff",
      text: "#111111",
      textMuted: "#555555",
      primary: "#0044aa",
      primaryHover: "#003388",
      primaryText: "#ffffff",
      accent: "#ffe066",
      border: "#cccccc",
      success: "#22aa55",
      error: "#cc2222",
      warning: "#aa6600",
      info: "#2266aa",
    };
    const readable = render(
      hero({ style: { bg: "accent" } }),
      base_settings({ customColors: palette }),
    ).querySelector("section")!;
    expect(readable.classList).toContain("section-bg-accent");
    expect(readable.classList).toContain("section-tone-accent-text");

    const unreadable = render(
      hero({ style: { bg: "accent" } }),
      base_settings({
        customColors: {
          ...palette,
          accent: "#888888",
          text: "#777777",
          bg: "#999999",
        },
      }),
    ).querySelector("section")!;
    expect(unreadable.classList).toContain("section-bg-bg-secondary");
    expect(unreadable.classList).toContain("section-tone-default");
  });

  it("bg image renders a lazy decorative backdrop; overlay light-50 gives dark text", () => {
    const root = render(
      text_media({
        style: {
          bg: "image",
          overlay: "light-50",
          bg_image: { url: IMAGE, alt: "" },
        },
      }),
    );
    const backdrop = root.querySelector("img.section-backdrop")!;
    expect(backdrop.getAttribute("loading")).toBe("lazy");
    expect(backdrop.getAttribute("alt")).toBe("");
    expect(root.querySelector("section")!.classList).toContain(
      "section-tone-image-light",
    );
  });

  it("bg image without a usable image falls back to no background", () => {
    const el = render(text_media({ style: { bg: "image" } })).querySelector(
      "section",
    )!;
    expect(el.classList).toContain("section-bg-none");
    expect(el.querySelector(".section-backdrop")).toBeNull();
  });
});

describe("render_section_html: locale", () => {
  it("pl translates fixed UI strings, author content stays as written", () => {
    const html = render_section_html(
      section(cta_band()),
      base_settings(),
      "pl",
    );
    const root = parse_fragment(html);
    expect(root.querySelector(".section-consent-text a")?.textContent).toBe(
      "Polityka prywatności",
    );
    expect(root.textContent).toContain(t("pl", "cta.consent_default"));
    expect(root.textContent).toContain(t("pl", "section.opens_new_tab"));
    expect(root.querySelector("h2")?.textContent).toBe("Join the newsletter");
  });

  it("locale defaults to settings.locale and is deterministic (SSR = canvas)", () => {
    const settings = base_settings({ locale: "pl" });
    const implicit = render_section_html(section(cta_band()), settings);
    expect(implicit).toBe(
      render_section_html(section(cta_band()), settings, "pl"),
    );
    expect(implicit).not.toBe(
      render_section_html(section(cta_band()), settings, "en"),
    );
  });

  it("checkbox labels follow the locale", () => {
    const root = render(
      cta_band({ content: { consent_mode: "checkbox" } }),
      base_settings(),
      "pl",
    );
    expect(root.querySelector("label")?.textContent).toContain(
      t("pl", "cta.consent_checkbox"),
    );
    expect(root.textContent).toContain(t("pl", "section.consent_required"));
  });
});

describe("split_home_sections", () => {
  const sections = [
    section(hero()),
    section(text_media()),
    section({ id: "posts001", type: "posts", content: {}, style: {} }),
    section(cta_band()),
  ];

  it("keeps config order around the posts section", () => {
    const split = split_home_sections({ sections });
    expect(split.before.map((s) => s.id)).toEqual(["hero0001", "about001"]);
    expect(split.after.map((s) => s.id)).toEqual(["newsl001"]);
  });

  it("rendered HTML follows the same order", () => {
    const { before } = split_home_sections({
      sections: [sections[1], sections[0], sections[2]],
    });
    const html = before
      .map((s) => render_section_html(s, base_settings()))
      .join("");
    const ids = Array.from(
      parse_fragment(html).querySelectorAll("section"),
    ).map((el) => el.id);
    expect(ids).toEqual(["s-about001", "s-hero0001"]);
  });

  it("missing home keeps today's layout", () => {
    expect(split_home_sections(undefined)).toEqual({
      lead: [],
      before: [],
      after: [],
    });
  });

  it("without a posts section every section goes above the posts island, like the canvas", () => {
    expect(
      split_home_sections({ sections: [section(hero())] }).before.map(
        (s) => s.id,
      ),
    ).toEqual(["hero0001"]);
  });
});

describe("lead sections above the sidebars", () => {
  const full_hero = section(hero({ style: { width: "full" } }));
  const about = section(text_media());
  const full_about = section({
    ...text_media({ style: { width: "full" } }),
    id: "about002",
  });
  const posts = section({
    id: "posts001",
    type: "posts",
    content: {},
    style: {},
  });
  const full_band = section(cta_band({ style: { width: "full" } }));

  const with_template = (
    template: LayoutTemplate,
    sections: HomeSection[],
  ): SectionRenderSettings => {
    const settings = base_settings({ home: { sections } });
    settings.pageLayoutConfig = {
      ...settings.pageLayoutConfig!,
      template,
    };
    return settings;
  };

  it("lifts only the leading width:full sections in a sidebar template", () => {
    const split = split_home_sections(
      { sections: [full_hero, about, full_about, posts, full_band] },
      { sidebars: true },
    );
    expect(split.lead.map((s) => s.id)).toEqual(["hero0001"]);
    expect(split.before.map((s) => s.id)).toEqual(["about001", "about002"]);
    expect(split.after.map((s) => s.id)).toEqual(["newsl001"]);
  });

  it("keeps everything in the column without sidebars or with a content-width first section", () => {
    expect(split_home_sections({ sections: [full_hero, posts] }).lead).toEqual(
      [],
    );
    expect(
      split_home_sections(
        { sections: [about, full_hero, posts] },
        { sidebars: true },
      ).lead,
    ).toEqual([]);
  });

  it("never lifts sections below the posts", () => {
    expect(
      split_home_sections({ sections: [posts, full_hero] }, { sidebars: true })
        .lead,
    ).toEqual([]);
  });

  it("lead ids follow the layout template", () => {
    expect(
      home_lead_section_ids(with_template("sidebar-left", [full_hero, posts])),
    ).toEqual(["hero0001"]);
    expect(
      home_lead_section_ids(with_template("no-sidebar", [full_hero, posts])),
    ).toEqual([]);
    expect(home_lead_section_ids(base_settings({ home: undefined }))).toEqual(
      [],
    );
  });

  it("a lead hero bleeds full width in a sidebar template, a column section stays boxed", () => {
    const settings = with_template("sidebar-left", [
      full_hero,
      posts,
      full_band,
    ]);
    const lead_html = parse_fragment(
      render_section_html(full_hero, settings),
    ).querySelector("section")!;
    expect(lead_html.classList).toContain("section-full");
    const column = parse_fragment(
      render_section_html(full_band, settings),
    ).querySelector("section")!;
    expect(column.classList).not.toContain("section-full");
  });

  it("the lead hero stays the LCP candidate", () => {
    const settings = with_template("sidebar-left", [full_hero, posts]);
    expect(home_priority_section_id(settings)).toBe("hero0001");
    expect(home_hero_shown(settings)).toBe(true);
  });
});

describe("home_priority_section_id", () => {
  const posts = section({
    id: "posts001",
    type: "posts",
    content: {},
    style: {},
  });
  const with_home = (sections: HomeSection[]) =>
    base_settings({ home: { sections } } as Partial<SectionRenderSettings>);

  it("is the hero when it is the first rendered section above posts", () => {
    const hidden_about = section(text_media({ id: "about001" }));
    hidden_about.hidden = true;
    expect(
      home_priority_section_id(
        with_home([hidden_about, section(hero()), posts]),
      ),
    ).toBe("hero0001");
  });

  it("is null when the hero sits below another section or below posts", () => {
    expect(
      home_priority_section_id(
        with_home([section(text_media()), section(hero()), posts]),
      ),
    ).toBeNull();
    expect(
      home_priority_section_id(with_home([posts, section(hero())])),
    ).toBeNull();
  });
});

describe("home_hero_shown", () => {
  const posts = section({
    id: "posts001",
    type: "posts",
    content: {},
    style: {},
  });
  const with_home = (sections: HomeSection[]) =>
    base_settings({ home: { sections } } as Partial<SectionRenderSettings>);

  it("is true for a rendered hero above or below posts", () => {
    expect(home_hero_shown(with_home([posts, section(hero())]))).toBe(true);
  });

  it("is false for a hidden hero, an empty headline or no hero", () => {
    const hidden = section(hero());
    hidden.hidden = true;
    expect(home_hero_shown(with_home([hidden, posts]))).toBe(false);
    const blank = { ...hero(), content: { ...hero().content, headline: "  " } };
    expect(
      home_hero_shown(with_home([blank as unknown as HomeSection, posts])),
    ).toBe(false);
    expect(home_hero_shown(with_home([posts]))).toBe(false);
    expect(home_hero_shown(base_settings())).toBe(false);
  });
});

describe("render_section_markdown", () => {
  it("renders paragraphs with line breaks and ordered list start", () => {
    const html = render_section_markdown(
      "line one\nline two\n\n3. three\n4. four",
    );
    const root = parse_fragment(html);
    expect(root.querySelector("p")?.innerHTML).toBe("line one<br>line two");
    expect(root.querySelector("ol")?.getAttribute("start")).toBe("3");
  });

  it("empty input renders ''", () => {
    expect(render_section_markdown("")).toBe("");
    expect(render_section_markdown("   ")).toBe("");
    expect(render_section_markdown(undefined)).toBe("");
  });

  it("mailto links stay in the tab, without the new-tab hint", () => {
    const link = parse_fragment(
      render_section_markdown("[mail](mailto:me@example.com)"),
    ).querySelector("a")!;
    expect(link.getAttribute("href")).toBe("mailto:me@example.com");
    expect(link.hasAttribute("target")).toBe(false);
    expect(link.querySelector(".sr-only")).toBeNull();
  });
});
