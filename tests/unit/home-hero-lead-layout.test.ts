// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot
// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { PageLayoutConfig } from "../../src/components/admin/types/layout";
import type { HomeSection } from "../../src/components/admin/types/settings";
import {
  home_lead_section_ids,
  render_section_html,
} from "../../src/shared/components/sections/render";
import type { SectionRenderSettings } from "../../src/shared/components/sections/types";

const VARIANTS = ["text-centric", "split", "stacked", "overlay"] as const;

function lead_hero(variant: string, align: string): HomeSection {
  return {
    id: "hero-lead",
    type: "hero",
    content: {
      headline: "Your headline",
      image: {
        url: "https://images.hive.blog/p/photo.jpg",
        alt: "Photo",
        width: 1200,
        height: 800,
      },
    },
    style: { variant, align, width: "full", bg: "primary", height: "lg" },
  } as unknown as HomeSection;
}

function settings_with(section: HomeSection): SectionRenderSettings {
  const empty = { elements: [] };
  return {
    pageLayoutConfig: {
      template: "both-sidebars",
      containers: {
        top: empty,
        sidebarLeft: empty,
        sidebarRight: empty,
        bottom: empty,
      },
    } as unknown as PageLayoutConfig,
    home: { sections: [section, { id: "posts001", type: "posts" }] },
  } as unknown as SectionRenderSettings;
}

function render_shell(section: HomeSection): HTMLElement {
  const html = render_section_html(section, settings_with(section));
  const shell = new DOMParser()
    .parseFromString(html, "text/html")
    .querySelector("section");
  expect(shell, html).not.toBeNull();
  return shell as HTMLElement;
}

const SECTIONS_CSS = readFileSync(
  resolve(process.cwd(), "src/styles/sections.css"),
  "utf8",
).replace(/\/\*[\s\S]*?\*\//g, "");

function declarations(selector: string): Record<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\>]/g, "\\$&");
  const match = new RegExp(`^${escaped}\\s*\\{([^}]*)\\}`, "m").exec(
    SECTIONS_CSS,
  );
  expect(match, selector).not.toBeNull();
  return Object.fromEntries(
    match![1]
      .split(";")
      .map((declaration) => declaration.split(":").map((part) => part.trim()))
      .filter(([property, value]) => property && value),
  );
}

describe("full-width hero leading the main column", () => {
  it("is lifted above the sidebars", () => {
    const hero = lead_hero("text-centric", "center");
    expect(home_lead_section_ids(settings_with(hero))).toEqual(["hero-lead"]);
  });

  it.each(
    VARIANTS.flatMap((variant) => [
      [variant, "start"],
      [variant, "center"],
    ]),
  )(
    "%s / %s bleeds full width with the headline inside .section-inner",
    (variant, align) => {
      const shell = render_shell(lead_hero(variant, align));
      expect([...shell.classList]).toEqual(
        expect.arrayContaining([
          "section-hero",
          "section-full",
          `section-hero-${variant}`,
        ]),
      );
      expect(shell.classList.contains("section-in-container")).toBe(false);
      const inner = shell.querySelector(":scope > .section-inner");
      expect(inner).not.toBeNull();
      expect(inner!.querySelector(".section-hero-text > h1")?.textContent).toBe(
        "Your headline",
      );
    },
  );

  it("gives the inner box an explicit width, which a flex hero with auto margins would size to 0 under containment", () => {
    expect(declarations(".home-section > .section-inner")).toMatchObject({
      container: "home-section / inline-size",
    });
    expect(declarations(".section-hero")).toMatchObject({
      display: "flex",
      "flex-direction": "column",
    });
    expect(declarations(".section-full > .section-inner")).toMatchObject({
      width: "100%",
      "max-width": "var(--container-content)",
      "margin-inline": "auto",
    });
  });
});
