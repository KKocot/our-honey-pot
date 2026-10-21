// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// jsdom has no ResizeObserver or matchMedia, which the image field relies on.
vi.hoisted(() => {
  globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
  window.matchMedia ??= (query: string) =>
    ({
      matches: true,
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }) as unknown as MediaQueryList;
});

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
import { SiteIdentitySettings } from "../../src/components/admin/settings/SiteSettings/SiteIdentity";
import { SiteSettings } from "../../src/components/admin/settings/SiteSettings";
import {
  FieldEditProvider,
  type EditedField,
  type FieldEdit,
} from "../../src/components/admin/canvas/popovers/field-edit";
import {
  getSettingsSnapshot,
  updateSettingsImmediate,
} from "../../src/components/admin/queries";

const disposers: Array<() => void> = [];

beforeEach(() => {
  updateSettingsImmediate({
    siteName: "Old name",
    siteDescription: "Old description",
    brand: { mode: "text", size: "md" },
  });
});

afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  document.body.innerHTML = "";
});

function mount_identity(): HTMLElement {
  const container = document.createElement("div");
  document.body.append(container);
  disposers.push(solid_render(() => <SiteIdentitySettings />, container));
  return container;
}

function field_by_label<T extends HTMLElement>(
  root: HTMLElement,
  text: string,
): T {
  const label = [...root.querySelectorAll("label")].find(
    (el) => el.textContent?.trim() === text,
  );
  const target = label?.htmlFor
    ? root.querySelector<T>(`#${CSS.escape(label.htmlFor)}`)
    : null;
  if (!target) throw new Error(`no field labelled ${text}`);
  return target;
}

function group(root: HTMLElement, legend: string): HTMLFieldSetElement {
  const fieldset = [...root.querySelectorAll("fieldset")].find(
    (el) => el.querySelector("legend")?.textContent === legend,
  );
  if (!fieldset) throw new Error(`no group ${legend}`);
  return fieldset;
}

function radio(
  root: HTMLElement,
  legend: string,
  value: string,
): HTMLInputElement {
  const input = group(root, legend).querySelector<HTMLInputElement>(
    `input[value="${value}"]`,
  );
  if (!input) throw new Error(`no ${value} option in ${legend}`);
  return input;
}

function type_and_blur(
  field: HTMLInputElement | HTMLTextAreaElement,
  value: string,
) {
  field.value = value;
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(new FocusEvent("blur"));
}

describe("SiteIdentitySettings", () => {
  it("edits the site name on blur", () => {
    const root = mount_identity();
    const name = field_by_label<HTMLInputElement>(root, "Site name");
    expect(name.value).toBe("Old name");
    type_and_blur(name, "Bee Blog");
    expect(getSettingsSnapshot().siteName).toBe("Bee Blog");
  });

  it("edits the site description on blur", () => {
    const root = mount_identity();
    const description = field_by_label<HTMLTextAreaElement>(
      root,
      "Description",
    );
    type_and_blur(description, "Honey all day");
    expect(getSettingsSnapshot().siteDescription).toBe("Honey all day");
  });

  it("has a logo field in the Brand group", () => {
    const root = mount_identity();
    const brand = [...root.querySelectorAll("section")].find(
      (el) => el.querySelector("h4")?.textContent === "Brand",
    );
    expect(brand?.textContent).toContain("Logo");
  });

  it("switches the brand mode and warns when a logo mode has no image", () => {
    const root = mount_identity();
    expect(root.textContent).not.toContain("Add a logo image");
    radio(root, "Show in top bar", "logo").click();
    expect(getSettingsSnapshot().brand).toEqual({ mode: "logo", size: "md" });
    expect(root.textContent).toContain("Add a logo image");
  });

  it("enables the logo size only outside text mode", () => {
    const root = mount_identity();
    expect(group(root, "Logo size").disabled).toBe(true);
    radio(root, "Show in top bar", "logo+text").click();
    expect(group(root, "Logo size").disabled).toBe(false);
    radio(root, "Logo size", "lg").click();
    expect(getSettingsSnapshot().brand).toEqual({
      mode: "logo+text",
      size: "lg",
    });
  });
});

describe("SiteIdentitySettings: labelled undo steps", () => {
  function mount_recorded(): { root: HTMLElement; steps: EditedField[] } {
    const steps: EditedField[] = [];
    const record: FieldEdit = (field, edit) => {
      steps.push(field);
      edit();
    };
    const container = document.createElement("div");
    document.body.append(container);
    disposers.push(
      solid_render(
        () => (
          <FieldEditProvider value={record}>
            <SiteIdentitySettings />
          </FieldEditProvider>
        ),
        container,
      ),
    );
    return { root: container, steps };
  }

  it("records the site name and description as per-field steps", () => {
    const { root, steps } = mount_recorded();
    type_and_blur(field_by_label(root, "Site name"), "Bee Blog");
    type_and_blur(field_by_label(root, "Description"), "Honey all day");
    expect(steps).toEqual([
      { key: "site:name", label: "Edited site name" },
      { key: "site:description", label: "Edited site description" },
    ]);
    expect(getSettingsSnapshot().siteName).toBe("Bee Blog");
  });

  it("records brand picks as discrete steps", () => {
    const { root, steps } = mount_recorded();
    radio(root, "Show in top bar", "logo+text").click();
    radio(root, "Logo size", "lg").click();
    expect(steps).toEqual([
      { label: "Changed brand top bar display" },
      { label: "Changed brand logo size" },
    ]);
    expect(getSettingsSnapshot().brand).toEqual({
      mode: "logo+text",
      size: "lg",
    });
  });
});

describe("SiteSettings after the split", () => {
  it("keeps only global settings: no identity or footer fields", () => {
    const container = document.createElement("div");
    document.body.append(container);
    disposers.push(solid_render(() => <SiteSettings />, container));
    const headings = [...container.querySelectorAll("h4")].map(
      (el) => el.textContent,
    );
    expect(headings).toEqual(["SEO", "Language", "Top bar"]);
    const labels = [...container.querySelectorAll("label, legend")].map((el) =>
      el.textContent?.trim(),
    );
    for (const gone of [
      "Site name",
      "Description",
      "Footer text",
      "Show in top bar",
      "Logo size",
    ]) {
      expect(labels).not.toContain(gone);
    }
  });
});
