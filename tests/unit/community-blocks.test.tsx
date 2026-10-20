// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { afterEach, describe, expect, it } from "vitest";
import { render as solid_render } from "solid-js/web";
import type { JSX } from "solid-js";
import {
  CommunityDescriptionBlock,
  CommunityLanguageBlock,
  CommunityRulesBlock,
  CommunityTeamBlock,
} from "../../src/components/community/blocks";
import { CommunitySidebarCard } from "../../src/components/community/CommunitySidebar";
import { get_language_name } from "../../src/components/community/sidebar-blocks";
import type { HiveCommunity } from "../../src/lib/types/community";

const FULL = {
  description: "About <us>\nline two",
  flag_text: "Be nice\n\nNo spam",
  team: [
    ["alice", "owner", ""],
    ["bob", "mod", ""],
    ["carol", "member", ""],
  ],
  lang: "pl",
} as unknown as HiveCommunity;

const EMPTY = {
  description: "",
  flag_text: "  \n ",
  team: [["carol", "member", ""]],
  lang: "",
} as unknown as HiveCommunity;

const disposers: Array<() => void> = [];

afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  document.body.innerHTML = "";
});

function render(view: () => JSX.Element): HTMLDivElement {
  const container = document.createElement("div");
  document.body.append(container);
  disposers.push(solid_render(view, container));
  return container;
}

function headings(root: Element): string[] {
  return [...root.querySelectorAll("h3")].map((h) => h.textContent ?? "");
}

describe.each([
  ["description", CommunityDescriptionBlock, "Description", "Opis"],
  ["rules", CommunityRulesBlock, "Rules", "Zasady"],
  ["team", CommunityTeamBlock, "Team", "Zespół"],
  ["language", CommunityLanguageBlock, "Language", "Język"],
] as const)("%s block", (_name, Block, en_label, pl_label) => {
  it("renders nothing without community data", () => {
    expect(
      render(() => <Block community={EMPTY} locale="en" />).innerHTML,
    ).toBe("");
  });

  it("renders nothing when its toggle is off", () => {
    expect(
      render(() => <Block community={FULL} locale="en" show={false} />)
        .innerHTML,
    ).toBe("");
  });

  it("renders one self-contained card with a localized heading", () => {
    const en = render(() => <Block community={FULL} locale="en" />);
    expect(en.children).toHaveLength(1);
    expect(en.firstElementChild?.classList.contains("@container")).toBe(true);
    expect(headings(en)).toEqual([en_label]);
    expect(
      headings(render(() => <Block community={FULL} locale="pl" />)),
    ).toEqual([pl_label]);
  });

  it("falls back to English for a missing or unknown locale", () => {
    expect(headings(render(() => <Block community={FULL} />))).toEqual([
      en_label,
    ]);
    expect(
      headings(render(() => <Block community={FULL} locale="xx" />)),
    ).toEqual([en_label]);
  });
});

describe("block content", () => {
  it("description escapes HTML and keeps line breaks", () => {
    const body = render(() => (
      <CommunityDescriptionBlock community={FULL} />
    )).querySelector("h3 + div");
    expect(body?.innerHTML).toBe("About &lt;us&gt;<br>line two");
  });

  it("rules list skips blank lines", () => {
    const items = render(() => (
      <CommunityRulesBlock community={FULL} />
    )).querySelectorAll("li");
    expect([...items].map((li) => li.textContent)).toEqual([
      "Be nice",
      "No spam",
    ]);
  });

  it("team lists leadership only, with localized role labels", () => {
    const root = render(() => (
      <CommunityTeamBlock community={FULL} locale="pl" />
    ));
    const links = [...root.querySelectorAll("a")];
    expect(links.map((a) => a.textContent)).toEqual(["@alice", "@bob"]);
    expect(links[0]?.getAttribute("href")).toMatch(/\/@alice$/);
    expect(
      [...root.querySelectorAll("span")].map((s) => s.textContent),
    ).toEqual(["Właściciel", "Moderator"]);
  });

  it("language name follows the UI locale", () => {
    expect(get_language_name("pl", "en")).toBe("Polish");
    expect(get_language_name("pl", "pl")).toBe("polski");
    expect(get_language_name("qqq", "en")).toBe("QQQ");
    expect(get_language_name("not a tag", "en")).toBe("NOT A TAG");
  });
});

interface TreeNode {
  tag: string;
  text?: string;
  href?: unknown;
  children: TreeNode[];
}

function structure(element: Element): TreeNode {
  const children = [...element.children].map(structure);
  return {
    tag: element.tagName.toLowerCase(),
    ...(children.length === 0 ? { text: element.textContent ?? "" } : {}),
    ...(element.tagName === "A" ? { href: element.getAttribute("href") } : {}),
    children,
  };
}

const leaf = (tag: string, text: string): TreeNode => ({
  tag,
  text,
  children: [],
});

const card = (title: string, body: TreeNode): TreeNode => ({
  tag: "div",
  children: [leaf("h3", title), body],
});

const member = (name: string, role: string): TreeNode => ({
  tag: "div",
  children: [
    { ...leaf("a", `@${name}`), href: expect.stringMatching(`/@${name}$`) },
    leaf("span", role),
  ],
});

describe("CommunitySidebarCard aggregate", () => {
  it("keeps the pre-split structure and width cap", () => {
    const container = render(() => (
      <CommunitySidebarCard community={FULL} locale="en" />
    ));
    expect(container.children).toHaveLength(1);
    const root = container.firstElementChild!;
    expect(root.className).toBe("space-y-4 max-w-xs");
    expect(structure(root)).toEqual({
      tag: "div",
      children: [
        card("Description", { tag: "div", children: [leaf("br", "")] }),
        card("Rules", {
          tag: "ol",
          children: [leaf("li", "Be nice"), leaf("li", "No spam")],
        }),
        card("Team", {
          tag: "div",
          children: [member("alice", "Owner"), member("bob", "Moderator")],
        }),
        card("Language", leaf("p", "Polish")),
      ],
    });
  });

  it("localizes every block label", () => {
    expect(
      headings(
        render(() => <CommunitySidebarCard community={FULL} locale="pl" />),
      ),
    ).toEqual(["Opis", "Zasady", "Zespół", "Język"]);
  });

  it("skips blocks that are disabled", () => {
    const root = render(() => (
      <CommunitySidebarCard
        community={FULL}
        show_description={false}
        show_leadership={false}
      />
    ));
    expect(headings(root)).toEqual(["Rules", "Language"]);
  });

  it("renders nothing when no block is visible", () => {
    expect(
      render(() => <CommunitySidebarCard community={EMPTY} />).innerHTML,
    ).toBe("");
    expect(
      render(() => (
        <CommunitySidebarCard
          community={FULL}
          show_description={false}
          show_rules={false}
          show_leadership={false}
          show_language={false}
        />
      )).innerHTML,
    ).toBe("");
  });
});
