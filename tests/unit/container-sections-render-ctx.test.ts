// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { describe, expect, it } from "vitest";
import type {
  LayoutTemplate,
  PageLayoutConfig,
} from "../../src/components/admin/types/layout";
import type { HomeSection } from "../../src/components/admin/types/settings";
import { render_section_html } from "../../src/shared/components/sections/render";
import type { SectionRenderSettings } from "../../src/shared/components/sections/types";

const CONTENT: Record<string, Record<string, unknown>> = {
  hero: { headline: "Welcome" },
  quote: { text: "Slow is smooth." },
  "text-media": {
    title: "About me",
    image: { url: "https://images.hive.blog/photo.jpg", alt: "Me" },
  },
};

function layout(template: LayoutTemplate): PageLayoutConfig {
  const empty = { elements: [] };
  return {
    template,
    containers: {
      top: empty,
      sidebarLeft: empty,
      sidebarRight: empty,
      bottom: empty,
    },
  } as unknown as PageLayoutConfig;
}

function section(
  type: string,
  container: string | null,
  style: Record<string, unknown> = {},
): HomeSection {
  return {
    id: `${type}-1`,
    type,
    content: CONTENT[type] ?? {},
    style,
    ...(container ? { placement: { container, index: 0 } } : {}),
  } as unknown as HomeSection;
}

function shell_classes(
  item: HomeSection,
  template: LayoutTemplate = "both-sidebars",
): string[] {
  const settings: SectionRenderSettings = {
    pageLayoutConfig: layout(template),
    home: { sections: [item] },
  };
  const html = render_section_html(item, settings);
  const match = /^<section[^>]*\sclass="([^"]*)"/.exec(html);
  expect(match, html).not.toBeNull();
  return match![1].split(" ");
}

describe("section shell in a layout container", () => {
  it.each(["top", "bottom", "sidebarLeft", "sidebarRight"])(
    "drops width: full and marks the shell in %s",
    (container) => {
      const classes = shell_classes(
        section("quote", container, { width: "full", bg: "card" }),
      );
      expect(classes).not.toContain("section-full");
      expect(classes).toContain("section-boxed");
      expect(classes).toContain("section-in-container");
    },
  );

  it("keeps width: full in the main column without sidebars", () => {
    const classes = shell_classes(
      section("quote", null, { width: "full" }),
      "no-sidebar",
    );
    expect(classes).toContain("section-full");
    expect(classes).not.toContain("section-in-container");
  });

  it("keeps width: full for a leading main section of a sidebar template", () => {
    const classes = shell_classes(section("quote", null, { width: "full" }));
    expect(classes).toContain("section-full");
    expect(classes).not.toContain("section-in-container");
  });

  it("renders a section of a hidden sidebar in main, full width kept", () => {
    const classes = shell_classes(
      section("quote", "sidebarLeft", { width: "full" }),
      "no-sidebar",
    );
    expect(classes).toContain("section-full");
    expect(classes).not.toContain("section-in-container");
  });

  it.each(["top", "bottom"])(
    "marks a tall hero in %s so CSS caps its height",
    (container) => {
      const classes = shell_classes(
        section("hero", container, { height: "lg" }),
      );
      expect(classes).toContain("section-height-lg");
      expect(classes).toContain("section-in-container");
    },
  );

  it("renders a hero in main without the container class", () => {
    const classes = shell_classes(section("hero", null, { height: "md" }));
    expect(classes).toContain("section-height-md");
    expect(classes).not.toContain("section-in-container");
  });

  it("stacks text-media in a sidebar and keeps the side grid in top", () => {
    expect(shell_classes(section("text-media", "sidebarRight"))).toContain(
      "section-tm-stacked",
    );
    const top = shell_classes(section("text-media", "top"));
    expect(top).toContain("section-tm-has-media");
    expect(top).not.toContain("section-tm-stacked");
  });
});
