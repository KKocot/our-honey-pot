// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { describe, expect, it } from "vitest";
import {
  BRAND_LOGO_HEIGHT_PX,
  createHeaderData,
  renderHeader,
  renderHeaderBottom,
  renderHeaderCompact,
  type HeaderBrand,
} from "../../src/shared/components/header";
import {
  expect_no_script_vectors,
  parse_fragment,
} from "./helpers/html-assert";

const LOGO_URL = "https://images.hive.blog/DQmLogo/logo.png";
const VARIANTS = [
  ["full", renderHeader],
  ["compact", renderHeaderCompact],
  ["bottom", renderHeaderBottom],
] as const;

function brand(overrides: Partial<HeaderBrand> = {}): HeaderBrand {
  return {
    mode: "logo",
    size: "md",
    logo: { url: LOGO_URL, alt: "Acme", w: 200, h: 50 },
    ...overrides,
  };
}

function heading(html: string): HTMLHeadingElement {
  const h1 = parse_fragment(html).querySelector("h1");
  expect(h1).not.toBeNull();
  return h1!;
}

describe.each(VARIANTS)("%s header branding", (_name, render) => {
  it("without brand renders the text heading as before", () => {
    const h1 = heading(render(createHeaderData("Site", "Desc")));
    expect(h1.textContent).toBe("Site");
    expect(h1.querySelector("img")).toBeNull();
  });

  it("mode text ignores the logo", () => {
    const html = render(createHeaderData("Site", "Desc", brand({ mode: "text" })));
    expect(heading(html).querySelector("img")).toBeNull();
    expect(heading(html).textContent).toBe("Site");
  });

  it("mode logo renders the logo with the brand name as alt", () => {
    const h1 = heading(render(createHeaderData("Site", "Desc", brand())));
    const img = h1.querySelector("img")!;
    expect(img.getAttribute("alt")).toBe("Acme");
    expect(img.getAttribute("src")).toContain("images.hive.blog/256x64/");
    expect(img.getAttribute("width")).toBe("128");
    expect(img.getAttribute("height")).toBe("32");
    expect(img.classList).toContain("h-8");
    expect(img.classList).toContain("w-auto");
    expect(img.hasAttribute("data-fallback")).toBe(false);
    expect(h1.querySelector("span")).toBeNull();
  });

  it("mode logo+text renders a decorative logo next to the name", () => {
    const h1 = heading(
      render(createHeaderData("Site", "Desc", brand({ mode: "logo+text" }))),
    );
    const img = h1.querySelector("img")!;
    expect(img.getAttribute("alt")).toBe("");
    expect(img.dataset.fallback).toBe("hide");
    expect(h1.querySelector("span")!.textContent).toBe("Site");
  });

  it("logo modes without a usable logo fall back to text", () => {
    for (const mode of ["logo", "logo+text"] as const) {
      for (const logo of [
        undefined,
        { url: "", alt: "Acme" },
        { url: "javascript:alert(1)", alt: "Acme" },
        { url: "https://evil.example/logo.png", alt: "Acme" },
      ]) {
        const h1 = heading(
          render(createHeaderData("Site", "Desc", brand({ mode, logo }))),
        );
        expect(h1.querySelector("img")).toBeNull();
        expect(h1.textContent).toBe("Site");
      }
    }
  });

  it("keeps the description in every mode", () => {
    for (const mode of ["text", "logo", "logo+text"] as const) {
      const root = parse_fragment(
        render(createHeaderData("Site", "Desc", brand({ mode }))),
      );
      expect(root.querySelector("p")!.textContent).toBe("Desc");
    }
  });
});

describe("logo size", () => {
  it.each([
    ["sm", "h-6", 24],
    ["md", "h-8", 32],
    ["lg", "h-10", 40],
  ] as const)("%s -> %s / %ipx", (size, cls, px) => {
    expect(BRAND_LOGO_HEIGHT_PX[size]).toBe(px);
    const img = heading(
      renderHeader(createHeaderData("Site", "Desc", brand({ size }))),
    ).querySelector("img")!;
    expect(img.classList).toContain(cls);
    expect(img.getAttribute("height")).toBe(String(px));
    expect(img.getAttribute("width")).toBe(String(px * 4));
  });

  it("unknown size falls back to md", () => {
    const img = heading(
      renderHeader(
        createHeaderData(
          "Site",
          "Desc",
          brand({ size: "xl" as HeaderBrand["size"] }),
        ),
      ),
    ).querySelector("img")!;
    expect(img.classList).toContain("h-8");
  });

  it("without w/h only the height is set", () => {
    const img = heading(
      renderHeader(
        createHeaderData(
          "Site",
          "Desc",
          brand({ logo: { url: LOGO_URL, alt: "Acme" } }),
        ),
      ),
    ).querySelector("img")!;
    expect(img.hasAttribute("width")).toBe(false);
    expect(img.getAttribute("height")).toBe("32");
    expect(img.getAttribute("src")).toContain("/0x64/");
  });
});

describe("logo alt", () => {
  it("uses the site name when the logo alt is empty or decorative", () => {
    for (const logo of [
      { url: LOGO_URL, alt: "  " },
      { url: LOGO_URL, alt: "Acme", decorative: true },
    ]) {
      const img = heading(
        renderHeader(createHeaderData("Site", "Desc", brand({ logo }))),
      ).querySelector("img")!;
      expect(img.getAttribute("alt")).toBe("Site");
    }
  });
});

describe("escaping", () => {
  const PAYLOAD = `"><script>alert(1)</script><img src=x onerror=alert(1)>`;

  it.each(VARIANTS)("%s escapes alt, name and description", (_name, render) => {
    for (const mode of ["text", "logo", "logo+text"] as const) {
      const html = render(
        createHeaderData(
          PAYLOAD,
          PAYLOAD,
          brand({ mode, logo: { url: LOGO_URL, alt: PAYLOAD } }),
        ),
      );
      expect_no_script_vectors(html);
      const root = parse_fragment(html);
      expect(root.querySelectorAll("img").length).toBe(mode === "text" ? 0 : 1);
      expect(root.querySelector("p")!.textContent).toBe(PAYLOAD);
    }
  });

  it("escapes the alt attribute value verbatim", () => {
    const img = heading(
      renderHeader(
        createHeaderData("Site", "Desc", brand({ logo: { url: LOGO_URL, alt: PAYLOAD } })),
      ),
    ).querySelector("img")!;
    expect(img.getAttribute("alt")).toBe(PAYLOAD);
  });
});

describe.each(VARIANTS)("%s header without the page H1", (_name, render) => {
  it("renders the site name as a paragraph when a hero owns the H1", () => {
    for (const mode of ["text", "logo", "logo+text"] as const) {
      const data = { ...createHeaderData("Site", "Desc", brand({ mode })), site_name_heading: false };
      const root = parse_fragment(render(data));
      expect(root.querySelector("h1")).toBeNull();
      expect(root.querySelector("p")!.textContent).toContain(mode === "logo" ? "" : "Site");
    }
  });
});
