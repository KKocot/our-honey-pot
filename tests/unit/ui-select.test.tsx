// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { afterEach, describe, expect, it, vi } from "vitest";
import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { Select } from "../../src/components/ui/Select";

const OPTIONS = [
  { value: "top", label: "Top (Header Area)" },
  { value: "left", label: "Left Sidebar" },
  { value: "right", label: "Right Sidebar" },
];

let dispose: (() => void) | undefined;

function mount(ui: () => ReturnType<typeof Select>) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  dispose = render(ui, host);
  return host.querySelector("select") as HTMLSelectElement;
}

afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.innerHTML = "";
});

describe("Select", () => {
  it("shows a non-first value from the first render", () => {
    const select = mount(() => (
      <Select label="Slot" options={OPTIONS} value="left" />
    ));

    expect(select.value).toBe("left");
    expect(select.selectedOptions[0]?.textContent).toBe("Left Sidebar");
  });

  it("follows value changes made from outside", () => {
    const [value, setValue] = createSignal("left");
    const select = mount(() => <Select options={OPTIONS} value={value()} />);

    setValue("right");
    expect(select.value).toBe("right");

    setValue("top");
    expect(select.value).toBe("top");
  });

  it("fires onChange when the first option is picked while another value is current", () => {
    const onChange = vi.fn(
      (e: Event) => (e.currentTarget as HTMLSelectElement).value,
    );
    const select = mount(() => (
      <Select options={OPTIONS} value="left" onChange={onChange} />
    ));

    select.value = "top";
    select.dispatchEvent(new Event("change", { bubbles: true }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.results[0]?.value).toBe("top");
  });

  it("keeps the label linked to the select", () => {
    const select = mount(() => (
      <Select label="Slot" options={OPTIONS} value="left" />
    ));
    const label = document.querySelector("label") as HTMLLabelElement;

    expect(label.htmlFor).toBe(select.id);
  });
});
