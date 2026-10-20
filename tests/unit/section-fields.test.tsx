// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { afterEach, describe, expect, it, vi } from "vitest";

// lucide-solid runs client-only code at import; the icons are irrelevant here.
vi.mock(
  "lucide-solid",
  () =>
    new Proxy(
      {},
      {
        get: (_target, key) => (key === "then" ? undefined : () => null),
        has: () => true,
      },
    ),
);

import { render as solid_render } from "solid-js/web";
import { createSignal, type JSX } from "solid-js";
import {
  ListField,
  SectionFields,
  UrlField,
  type FieldEdit,
} from "../../src/components/admin/canvas/popovers/section-fields";
import {
  list_add,
  list_move,
  list_remove,
  url_field_error,
} from "../../src/components/admin/canvas/popovers/section-fields/field-utils";
import type {
  FieldDescriptor,
  FieldKind,
  ListFieldDescriptor,
} from "../../src/shared/components/sections/registry-types";

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

const LIST: ListFieldDescriptor = {
  kind: "list",
  key: "items",
  label: "Item",
  max: 2,
  item_fields: [
    { kind: "text", key: "title", label: "Title", max_len: 40, required: true },
  ],
};

function add_button(root: Element): HTMLButtonElement {
  const button = root.querySelector<HTMLButtonElement>("[data-list-add]");
  if (!button) throw new Error("no add button");
  return button;
}

function input_by_label(root: Element, label: string): HTMLInputElement {
  const target = [...root.querySelectorAll("label")].find((el) =>
    el.textContent?.startsWith(label),
  );
  const input =
    target && root.querySelector<HTMLInputElement>(`#${target.htmlFor}`);
  if (!input) throw new Error(`no input labelled ${label}`);
  return input;
}

describe("ListField", () => {
  it("adds an empty item through on_change while below max", () => {
    const on_change = vi.fn();
    const root = render(() => (
      <ListField
        field={LIST}
        value={[{ title: "One" }]}
        path="items"
        on_change={on_change}
      />
    ));
    add_button(root).click();
    expect(on_change).toHaveBeenCalledWith([{ title: "One" }, { title: "" }], {
      path: "items",
      label: "Item",
      action: "add",
    });
  });

  it("blocks adding past max", () => {
    const on_change = vi.fn();
    const [value, set_value] = createSignal<unknown>([{ title: "One" }]);
    const root = render(() => (
      <ListField
        field={LIST}
        value={value()}
        path="items"
        on_change={(next) => {
          on_change(next);
          set_value(next);
        }}
      />
    ));
    add_button(root).click();
    expect(root.querySelectorAll("[data-list-item]")).toHaveLength(2);
    expect(add_button(root).disabled).toBe(true);
    expect(root.textContent).toContain("Limit reached (2/2)");

    add_button(root).dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(on_change).toHaveBeenCalledTimes(1);
    expect(root.querySelectorAll("[data-list-item]")).toHaveLength(2);
    expect(list_add([{}, {}], LIST)).toBeNull();
  });

  it("removes and moves items", () => {
    const on_change = vi.fn();
    const root = render(() => (
      <ListField
        field={LIST}
        value={[{ title: "A" }, { title: "B" }]}
        path="items"
        on_change={on_change}
      />
    ));
    root
      .querySelector<HTMLButtonElement>('[aria-label="Move Item 2 up"]')
      ?.click();
    expect(on_change).toHaveBeenLastCalledWith(
      [{ title: "B" }, { title: "A" }],
      {
        path: "items.1",
        label: "Item 2",
        action: "move",
      },
    );
    expect(
      root.querySelector<HTMLButtonElement>('[aria-label="Move Item 1 up"]')
        ?.disabled,
    ).toBe(true);

    root
      .querySelector<HTMLButtonElement>('[aria-label="Remove Item 1"]')
      ?.click();
    expect(on_change).toHaveBeenLastCalledWith([{ title: "B" }], {
      path: "items.0",
      label: "Item 1",
      action: "remove",
    });
    expect(list_remove([{ title: "A" }], 0, false)).toBeUndefined();
    expect(list_remove([{ title: "A" }], 0, true)).toEqual([]);
    expect(list_move([{ title: "A" }], 0, 1)).toBeNull();
  });

  it("writes an item field edit back as the whole list", () => {
    const on_change = vi.fn<(value: unknown, edit: FieldEdit) => void>();
    const root = render(() => (
      <ListField
        field={LIST}
        value={[{ title: "A" }]}
        path="items"
        on_change={on_change}
      />
    ));
    const input = input_by_label(root, "Title");
    input.value = "Changed";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    expect(on_change).toHaveBeenCalledWith([{ title: "Changed" }], {
      path: "items.0.title",
      label: "Title",
      action: "edit",
    });
  });
});

describe("UrlField", () => {
  it.each(["javascript:alert(1)", "http://example.com", "data:text/html,x"])(
    "rejects %s with an inline error",
    (url) => {
      expect(url_field_error(url, true)).not.toBeNull();
      const root = render(() => (
        <UrlField
          label="Link"
          value={url}
          allow_contact={false}
          on_change={() => {}}
        />
      ));
      const input = input_by_label(root, "Link");
      expect(input.getAttribute("aria-invalid")).toBe("true");
      expect(root.textContent).toContain("Use an https:// link.");
    },
  );

  it("accepts https, and mailto/tel only with allow_contact", () => {
    expect(url_field_error("https://example.com", false)).toBeNull();
    expect(url_field_error("mailto:a@b.co", false)).not.toBeNull();
    expect(url_field_error("mailto:a@b.co", true)).toBeNull();
    const root = render(() => (
      <UrlField
        label="Link"
        value="https://example.com"
        allow_contact={false}
        on_change={() => {}}
      />
    ));
    expect(input_by_label(root, "Link").hasAttribute("aria-invalid")).toBe(
      false,
    );
  });

  it("removes an emptied optional link", () => {
    const on_change = vi.fn();
    const root = render(() => (
      <UrlField
        label="Link"
        value="https://a.co"
        allow_contact={false}
        on_change={on_change}
      />
    ));
    const input = input_by_label(root, "Link");
    input.value = "  ";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    expect(on_change).toHaveBeenCalledWith(undefined);
  });
});

const EVERY_KIND: readonly FieldDescriptor[] = [
  { kind: "text", key: "headline", label: "Headline", max_len: 10 },
  { kind: "textarea", key: "body", label: "Body text", max_len: 200 },
  { kind: "markdown", key: "body_md", label: "Markdown body", max_bytes: 500 },
  { kind: "url", key: "link", label: "Link", allow_contact: true },
  { kind: "image", key: "image", label: "Picture" },
  {
    kind: "select",
    key: "tone",
    label: "Tone",
    options: [
      { value: "calm", label: "Calm" },
      { value: "loud", label: "Loud" },
    ],
  },
  { kind: "date", key: "when", label: "Date" },
  { kind: "boolean", key: "featured", label: "Featured" },
  LIST,
  {
    kind: "group",
    key: "button",
    label: "Button",
    required: true,
    fields: [
      { kind: "text", key: "label", label: "Button label", max_len: 20 },
    ],
  },
];

describe("SectionFields", () => {
  it("covers every FieldKind of registry-types", () => {
    const kinds: Record<FieldKind, true> = {
      text: true,
      textarea: true,
      markdown: true,
      url: true,
      image: true,
      select: true,
      date: true,
      boolean: true,
      list: true,
      group: true,
    };
    expect(new Set(EVERY_KIND.map((field) => field.kind))).toEqual(
      new Set(Object.keys(kinds)),
    );
  });

  it("renders an editor for every kind", () => {
    const root = render(() => (
      <SectionFields
        fields={EVERY_KIND}
        values={{
          headline: "Hi",
          tone: "loud",
          when: "2026-10-20",
          featured: true,
          items: [{ title: "First" }],
          button: { label: "Go" },
        }}
        on_change={() => {}}
      />
    ));
    expect(input_by_label(root, "Headline").type).toBe("text");
    expect(input_by_label(root, "Body text").tagName).toBe("TEXTAREA");
    expect(input_by_label(root, "Markdown body").tagName).toBe("TEXTAREA");
    expect(root.textContent).toContain("0/500");
    expect(input_by_label(root, "Link").type).toBe("url");
    expect(root.querySelector("legend")?.textContent).toBe("Picture");
    expect(input_by_label(root, "Tone").tagName).toBe("SELECT");
    expect(
      (input_by_label(root, "Tone") as unknown as HTMLSelectElement).value,
    ).toBe("loud");
    expect(input_by_label(root, "Date").type).toBe("date");
    expect(input_by_label(root, "Featured").checked).toBe(true);
    expect(root.querySelectorAll("[data-list-item]")).toHaveLength(1);
    expect(input_by_label(root, "Title").value).toBe("First");
    expect(root.querySelector("[data-section-group]")).not.toBeNull();
    expect(input_by_label(root, "Button label").value).toBe("Go");
  });

  it("reports the key, value and edit path of a change", () => {
    const on_change = vi.fn();
    const root = render(() => (
      <SectionFields
        fields={EVERY_KIND}
        values={{ button: { label: "Go" } }}
        on_change={on_change}
      />
    ));
    const headline = input_by_label(root, "Headline");
    headline.value = "Hello world, too long";
    headline.dispatchEvent(new InputEvent("input", { bubbles: true }));
    expect(on_change).toHaveBeenLastCalledWith("headline", "Hello worl", {
      path: "headline",
      label: "Headline",
      action: "edit",
    });

    const featured = input_by_label(root, "Featured");
    featured.click();
    expect(on_change).toHaveBeenLastCalledWith(
      "featured",
      true,
      expect.objectContaining({ path: "featured" }),
    );

    const label = input_by_label(root, "Button label");
    label.value = "Buy";
    label.dispatchEvent(new InputEvent("input", { bubbles: true }));
    expect(on_change).toHaveBeenLastCalledWith(
      "button",
      { label: "Buy" },
      {
        path: "button.label",
        label: "Button label",
        action: "edit",
      },
    );
  });

  it("adds an optional group as a whole", () => {
    const on_change = vi.fn();
    const group: FieldDescriptor = {
      kind: "group",
      key: "cta",
      label: "Button",
      fields: [
        {
          kind: "url",
          key: "url",
          label: "Link",
          allow_contact: true,
          required: true,
        },
      ],
    };
    const root = render(() => (
      <SectionFields fields={[group]} values={{}} on_change={on_change} />
    ));
    root.querySelector<HTMLButtonElement>("[data-group-add]")?.click();
    expect(on_change).toHaveBeenCalledWith(
      "cta",
      { url: "" },
      { path: "cta", label: "Button", action: "add" },
    );
  });
});
