// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// jsdom has no ResizeObserver, no Popover API and no matchMedia (Popover placement, image field).
vi.hoisted(() => {
  globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
  HTMLElement.prototype.showPopover ??= () => {};
  HTMLElement.prototype.hidePopover ??= () => {};
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

type TestUser = import("../../src/components/auth/auth-store").AuthUser;

const auth = vi.hoisted(() => ({
  set_user: (_user: TestUser | null): void => {},
}));

vi.mock("../../src/components/auth/auth-store", async (import_original) => {
  const actual =
    await import_original<
      typeof import("../../src/components/auth/auth-store")
    >();
  const { createSignal } = await import("solid-js");
  const [user, set_user] = createSignal<TestUser | null>(null);
  auth.set_user = set_user;
  return {
    ...actual,
    currentUser: user,
    isAuthenticated: () => user() !== null,
  };
});

import { render as solid_render } from "solid-js/web";
import { HeaderPopover } from "../../src/components/admin/canvas/popovers/HeaderPopover";
import {
  getSettingsSnapshot,
  setConfigSource,
  updateSettingsImmediate,
} from "../../src/components/admin/queries";

const disposers: Array<() => void> = [];

function wif_user(username: string): TestUser {
  return {
    username,
    privateKey: "",
    keyType: "posting",
    loginType: "wif",
  };
}

beforeEach(() => {
  auth.set_user(null);
  setConfigSource({ account: "owner", error: null });
  updateSettingsImmediate({
    siteName: "Old name",
    siteDescription: "Old description",
    brand: { mode: "text", size: "md" },
  });
  const container = document.createElement("div");
  document.body.append(container);
  disposers.push(
    solid_render(
      () => (
        <HeaderPopover
          section_id="page-sec-header"
          element_id="header"
          slot="top"
          anchor={undefined}
          on_close={() => {}}
        />
      ),
      container,
    ),
  );
});

afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  document.body.innerHTML = "";
});

function field_by_label<T extends HTMLElement>(text: string): T {
  const label = [...document.querySelectorAll("label")].find(
    (el) => el.textContent?.trim() === text,
  );
  const target = label?.htmlFor
    ? document.querySelector<T>(`#${CSS.escape(label.htmlFor)}`)
    : null;
  if (!target) throw new Error(`no field labelled ${text}`);
  return target;
}

function logo_field(): HTMLFieldSetElement {
  const fieldset = [...document.querySelectorAll("fieldset")].find(
    (el) => el.querySelector("legend")?.textContent === "Logo",
  );
  if (!fieldset) throw new Error("no Logo field");
  return fieldset;
}

function upload_button(): HTMLButtonElement | undefined {
  return [...logo_field().querySelectorAll("button")].find(
    (el) => el.textContent?.trim() === "Upload",
  );
}

function type_and_blur(
  field: HTMLInputElement | HTMLTextAreaElement,
  value: string,
) {
  field.value = value;
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(new FocusEvent("blur"));
}

describe("header popover: site identity", () => {
  it("renders the site name, description and logo fields", () => {
    expect(field_by_label<HTMLInputElement>("Site name").value).toBe(
      "Old name",
    );
    expect(field_by_label<HTMLTextAreaElement>("Description").value).toBe(
      "Old description",
    );
    expect(logo_field()).toBeDefined();
  });

  it("no longer links to the settings drawer", () => {
    expect(document.body.textContent).not.toContain(
      "Edit name and description",
    );
  });

  it("commits the site name on blur", () => {
    type_and_blur(field_by_label<HTMLInputElement>("Site name"), "Bee Blog");
    expect(getSettingsSnapshot().siteName).toBe("Bee Blog");
  });

  it("commits the site description on blur", () => {
    type_and_blur(
      field_by_label<HTMLTextAreaElement>("Description"),
      "Honey all day",
    );
    expect(getSettingsSnapshot().siteDescription).toBe("Honey all day");
  });
});

describe("header popover: logo upload gate", () => {
  it("asks to log in when signed out", () => {
    expect(upload_button()?.disabled).toBe(true);
    expect(logo_field().textContent).toContain("Log in to upload images.");
  });

  it("offers upload to the config account", () => {
    auth.set_user(wif_user("owner"));
    expect(upload_button()?.disabled).toBe(false);
  });

  it("hides upload for an account that may not write the config", () => {
    auth.set_user(wif_user("visitor"));
    expect(upload_button()).toBeUndefined();
    expect(logo_field().querySelector("input[type=url]")).not.toBeNull();
  });

  it("hides upload while the config could not be read", () => {
    setConfigSource({ account: "owner", error: "read failed" });
    auth.set_user(wif_user("owner"));
    expect(upload_button()).toBeUndefined();
  });
});
