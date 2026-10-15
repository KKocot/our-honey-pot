// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { describe, expect, it } from "vitest";
import {
  ADD_SECTION_OPTIONS,
  HOME_SECTION_LABELS,
  add_option_state,
  add_section_index,
  build_home_stack,
  canvas_section_html,
  has_placeholder_content,
  home_save_errors,
  home_sortable_id,
  home_swap_op,
  home_zone_id,
  neighbor_after_delete,
  parse_home_sortable_id,
  parse_home_zone_id,
} from "../../src/components/admin/canvas/home-sections/model";
import {
  add_home_section,
  home_section_popover_key,
} from "../../src/components/admin/canvas/home-section-ops";
import {
  POSTS_SECTION_FALLBACK_ID,
  SECTION_STYLE_DEFAULTS,
  get_default_settings,
  type HomeSection,
  type SettingsData,
} from "../../src/components/admin/types/settings";
import { render_section_html } from "../../src/shared/components/sections";

const common = SECTION_STYLE_DEFAULTS.common;

function hero(id = "hero0001", extra: Partial<HomeSection> = {}): HomeSection {
  return {
    id,
    type: "hero",
    content: { headline: "Welcome to the hive" },
    style: { ...common, ...SECTION_STYLE_DEFAULTS.hero },
    ...extra,
  } as HomeSection;
}

function text_media(id: string): HomeSection {
  return {
    id,
    type: "text-media",
    content: { title: "About me", body_md: "I write about **bees**." },
    style: { ...common, ...SECTION_STYLE_DEFAULTS["text-media"] },
  };
}

function cta(id: string): HomeSection {
  return {
    id,
    type: "cta-band",
    content: {
      title: "Get the newsletter",
      button: { label: "Join", url: "https://example.com/join" },
      consent_mode: "notice",
    },
    style: { ...common, ...SECTION_STYLE_DEFAULTS["cta-band"] },
  };
}

function posts(id = "posts001"): HomeSection {
  return { id, type: "posts", content: {}, style: { ...common } };
}

function with_sections(sections: HomeSection[]): SettingsData {
  const defaults = get_default_settings(true);
  return {
    ...defaults,
    footer: {
      ...defaults.footer,
      privacy: { label: "Privacy", kind: "page", target: "privacy" },
    },
    home: { sections },
  };
}

describe("build_home_stack", () => {
  it("splits the stack around posts like the public page", () => {
    const stack = build_home_stack(
      with_sections([hero(), posts(), text_media("text0001"), cta("ctab0001")]),
    );
    expect(stack.before.map((item) => item.section.id)).toEqual(["hero0001"]);
    expect(stack.posts?.section.id).toBe("posts001");
    expect(stack.after.map((item) => item.section.id)).toEqual([
      "text0001",
      "ctab0001",
    ]);
    expect(stack.items.map((item) => item.index)).toEqual([0, 1, 2, 3]);
  });

  it("shows the virtual posts section when home is absent", () => {
    const stack = build_home_stack({ home: undefined });
    expect(stack.items).toHaveLength(1);
    expect(stack.posts?.section.id).toBe(POSTS_SECTION_FALLBACK_ID);
    expect(stack.before).toEqual([]);
    expect(stack.after).toEqual([]);
  });

  it("offers move only where a neighbour exists", () => {
    const { items } = build_home_stack(
      with_sections([hero(), posts(), text_media("text0001")]),
    );
    expect(items.map((item) => [item.can_move_up, item.can_move_down])).toEqual(
      [
        [false, true],
        [true, true],
        [true, false],
      ],
    );
  });

  it("never lets posts be deleted, duplicated or hidden", () => {
    const { posts: item } = build_home_stack(with_sections([posts()]));
    expect(item?.removable).toBe(false);
    expect(item?.can_duplicate).toBe(false);
    expect(item?.label).toBe(HOME_SECTION_LABELS.posts);
  });

  it("disables duplicate at the type limit", () => {
    const { items } = build_home_stack(
      with_sections([hero(), text_media("text0001"), posts()]),
    );
    expect(items[0].can_duplicate).toBe(false);
    expect(items[1].can_duplicate).toBe(true);
  });

  it("flags hidden and placeholder sections", () => {
    const fresh = add_home_section(with_sections([posts()]), "hero", {
      index: 0,
    });
    const settings = with_sections([
      ...(fresh?.home?.sections ?? []),
      hero("hero0002", { hidden: true }),
    ]);
    const { items } = build_home_stack(settings);
    expect(items[0].placeholder).toBe(true);
    expect(items[0].hidden).toBe(false);
    expect(items[2].hidden).toBe(true);
    expect(items[2].placeholder).toBe(false);
  });
});

describe("canvas_section_html (parity with the public renderer)", () => {
  const settings = with_sections([]);

  it.each([
    ["hero", hero()],
    ["text-media", text_media("text0001")],
    ["cta-band", cta("ctab0001")],
  ])("renders a visible %s section 1:1", (_type, section) => {
    const html = canvas_section_html(section, settings);
    expect(html.length).toBeGreaterThan(0);
    expect(html).toBe(render_section_html(section, settings));
  });

  it("renders a hidden section as shown, while the public page skips it", () => {
    const hidden = hero("hero0001", { hidden: true });
    expect(render_section_html(hidden, settings)).toBe("");
    expect(canvas_section_html(hidden, settings)).toBe(
      render_section_html(hero("hero0001"), settings),
    );
  });

  it("renders nothing for posts (the posts island stays the canvas content)", () => {
    expect(canvas_section_html(posts(), settings)).toBe("");
  });
});

describe("has_placeholder_content", () => {
  it.each(["hero", "text-media", "cta-band"] as const)(
    "marks a new %s section",
    (type) => {
      const patch = add_home_section(with_sections([posts()]), type);
      const added = patch?.home?.sections.find(
        (section) => section.type === type,
      );
      expect(added && has_placeholder_content(added)).toBe(true);
    },
  );

  it("does not mark filled sections", () => {
    expect(has_placeholder_content(hero())).toBe(false);
    expect(has_placeholder_content(text_media("text0001"))).toBe(false);
    expect(has_placeholder_content(cta("ctab0001"))).toBe(false);
    expect(has_placeholder_content(posts())).toBe(false);
  });
});

describe("add_option_state", () => {
  it("lists hero, text + media and call to action", () => {
    expect(ADD_SECTION_OPTIONS.map((option) => option.type)).toEqual([
      "hero",
      "text-media",
      "cta-band",
    ]);
  });

  it("shows the counter while the type fits", () => {
    expect(add_option_state(with_sections([posts()]), "hero")).toEqual({
      disabled: false,
      status: "0/1",
    });
    expect(
      add_option_state(with_sections([posts(), cta("ctab0001")]), "cta-band"),
    ).toEqual({ disabled: false, status: "1/2" });
  });

  it("disables a type at its limit with 'Limit reached (1/1)'", () => {
    expect(add_option_state(with_sections([hero(), posts()]), "hero")).toEqual({
      disabled: true,
      status: "Limit reached (1/1)",
    });
  });
});

describe("drag and drop ids", () => {
  it("round-trips sortable and zone ids", () => {
    expect(parse_home_sortable_id(home_sortable_id("hero0001"))).toBe(
      "hero0001",
    );
    expect(parse_home_zone_id(home_zone_id("hero0001"))).toBe("hero0001");
    expect(parse_home_sortable_id("page-el:top:header")).toBeNull();
    expect(parse_home_zone_id("top")).toBeNull();
    expect(parse_home_sortable_id("home-sec:")).toBeNull();
  });

  it("does not clash with layout or popover keys", () => {
    expect(home_sortable_id("hero0001")).not.toBe(
      home_section_popover_key("hero0001"),
    );
    expect(home_zone_id("hero0001")).not.toBe(
      home_section_popover_key("hero0001"),
    );
  });

  it("swaps two sections on a drop on another section's zone", () => {
    const settings = with_sections([hero(), posts(), cta("ctab0001")]);
    const op = home_swap_op(
      home_sortable_id("hero0001"),
      home_zone_id("ctab0001"),
    );
    expect(op?.(settings)?.home?.sections.map((s) => s.id)).toEqual([
      "ctab0001",
      "posts001",
      "hero0001",
    ]);
  });

  it("rejects drops on itself and on layout slots", () => {
    expect(
      home_swap_op(home_sortable_id("hero0001"), home_zone_id("hero0001")),
    ).toBeNull();
    expect(home_swap_op(home_sortable_id("hero0001"), "main")).toBeNull();
    expect(home_swap_op("page-sec:top", home_zone_id("hero0001"))).toBeNull();
  });
});

describe("neighbor_after_delete", () => {
  const sections = [hero(), posts(), cta("ctab0001")];

  it("prefers the next section, then the previous one", () => {
    expect(neighbor_after_delete(sections, "hero0001")).toBe("posts001");
    expect(neighbor_after_delete(sections, "ctab0001")).toBe("posts001");
  });

  it("returns null for unknown ids", () => {
    expect(neighbor_after_delete(sections, "missing0")).toBeNull();
  });
});

describe("home_save_errors", () => {
  it("blocks Save while a new section keeps its placeholders", () => {
    const fresh = add_home_section(with_sections([posts()]), "hero", {
      index: 0,
    });
    const errors = home_save_errors({ ...with_sections([posts()]), ...fresh! });
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("Hero (section 1)");
    expect(errors[0].message).toContain("placeholder headline");
  });

  it("reports a missing button link and stays empty for filled sections", () => {
    const no_link = cta("newsl001");
    if (no_link.type === "cta-band")
      no_link.content.button = { label: "Join", url: "" };
    const errors = home_save_errors(with_sections([posts(), no_link]));
    expect(errors.map((error) => error.section_id)).toEqual(["newsl001"]);
    expect(errors[0].message).toContain("add a button link");
    expect(
      home_save_errors(
        with_sections([
          hero(),
          text_media("about001"),
          posts(),
          cta("newsl002"),
        ]),
      ),
    ).toEqual([]);
  });
});

describe("home_save_errors: hero CTAs", () => {
  it("accepts a hero without CTAs and reports an added empty one", () => {
    expect(home_save_errors(with_sections([hero(), posts()]))).toEqual([]);
    const with_empty = hero("hero0001");
    if (with_empty.type === "hero")
      with_empty.content.cta = [
        { label: "Read", url: "https://a.io" },
        { label: "", url: "" },
      ];
    const errors = home_save_errors(with_sections([with_empty, posts()]));
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("add a label to the secondary link");
    expect(errors[0].message).toContain("add a URL to the secondary link");
    expect(errors[0].message).not.toContain("primary button");
  });
});

describe("home_save_errors: optional section buttons", () => {
  it("accepts text-media without a button and reports an added empty one", () => {
    expect(
      home_save_errors(with_sections([text_media("about001"), posts()])),
    ).toEqual([]);
    const with_empty = text_media("about001");
    if (with_empty.type === "text-media")
      with_empty.content.cta = { label: "", url: "" };
    const errors = home_save_errors(with_sections([with_empty, posts()]));
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("add a label to the button");
    expect(errors[0].message).toContain("add a URL to the button");
  });

  it("keeps the required cta-band button check unchanged", () => {
    const band = cta("newsl001");
    if (band.type === "cta-band")
      band.content.button = { label: "Join", url: "" };
    const errors = home_save_errors(with_sections([posts(), band]));
    expect(errors[0].message).toContain("add a button link");
    expect(errors[0].message).not.toContain("add a URL to the button");
  });
});

describe("add_section_index", () => {
  it("inserts at the clicked slot, including the new top slot", () => {
    expect(add_section_index("text-media", 0)).toBe(0);
    expect(add_section_index("cta-band", 3)).toBe(3);
  });

  it("always puts a hero at the top", () => {
    expect(add_section_index("hero", 2)).toBe(0);
    const added = add_home_section(
      with_sections([posts(), text_media("text0001")]),
      "hero",
      { index: add_section_index("hero", 2) },
    );
    expect(added?.home?.sections.map((section) => section.type)).toEqual([
      "hero",
      "posts",
      "text-media",
    ]);
  });
});

describe("build_home_stack: LCP priority", () => {
  it("marks only the hero that opens the page", () => {
    const first = build_home_stack(with_sections([hero(), posts()]));
    expect(
      first.items.find((item) => item.section.id === "hero0001")?.priority,
    ).toBe(true);
    const below = build_home_stack(
      with_sections([text_media("about001"), hero(), posts()]),
    );
    expect(below.items.some((item) => item.priority)).toBe(false);
  });

  it("without posts keeps every section above the posts content, like split_home_sections", () => {
    const stack = build_home_stack(
      with_sections([hero(), text_media("about001")]),
    );
    expect(stack.before.map((item) => item.section.id)).toEqual([
      "hero0001",
      "about001",
    ]);
    expect(stack.after).toEqual([]);
  });
});
