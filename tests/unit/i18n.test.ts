// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCALE,
  DICTIONARIES,
  format_date,
  format_relative_time,
  type I18nKey,
  intl_locale,
  resolve_locale,
  t,
  t_count,
} from "../../src/lib/i18n";

describe("dictionaries", () => {
  it("pl has exactly the same keys as en", () => {
    expect(Object.keys(DICTIONARIES.pl).sort()).toEqual(
      Object.keys(DICTIONARIES.en).sort(),
    );
  });

  it("has no empty values", () => {
    for (const dictionary of Object.values(DICTIONARIES)) {
      for (const value of Object.values(dictionary)) {
        expect(value.trim()).not.toBe("");
      }
    }
  });

  it("keeps the same placeholders in every locale", () => {
    const placeholders = (value: string) =>
      (value.match(/\{\w+\}/g) ?? []).sort();
    for (const key of Object.keys(DICTIONARIES.en) as I18nKey[]) {
      expect(placeholders(DICTIONARIES.pl[key])).toEqual(
        placeholders(DICTIONARIES.en[key]),
      );
    }
  });

  it("is frozen so tenants cannot mutate shared state", () => {
    expect(Object.isFrozen(DICTIONARIES)).toBe(true);
    expect(Object.isFrozen(DICTIONARIES.en)).toBe(true);
    expect(Object.isFrozen(DICTIONARIES.pl)).toBe(true);
    expect(() => {
      (DICTIONARIES.en as Record<string, string>)["posts.empty"] = "hacked";
    }).toThrow();
    expect(t("en", "posts.empty")).toBe("No posts found");
  });
});

describe("resolve_locale", () => {
  it("defaults to en", () => {
    expect(DEFAULT_LOCALE).toBe("en");
    expect(resolve_locale(undefined)).toBe("en");
    expect(resolve_locale("de")).toBe("en");
    expect(resolve_locale(42)).toBe("en");
    expect(resolve_locale("pl")).toBe("pl");
  });

  it("maps to Intl tags", () => {
    expect(intl_locale("pl")).toBe("pl-PL");
    expect(intl_locale("xx")).toBe("en-US");
  });
});

describe("t", () => {
  it("returns localized strings", () => {
    expect(t("en", "cta.privacy_link")).toBe("Privacy policy");
    expect(t("pl", "cta.privacy_link")).toBe("Polityka prywatności");
    expect(t("pl", "posts.load_more")).toBe("Załaduj więcej wpisów");
    expect(t("en", "footer.kofi_alt")).toBe("Buy Me a Coffee at ko-fi.com");
  });

  it("falls back to en for unknown locale", () => {
    expect(t("de", "posts.pinned")).toBe("Pinned");
  });

  it("returns the key itself for an unknown key", () => {
    expect(t("pl", "missing.key" as I18nKey)).toBe("missing.key");
  });

  it("substitutes params and leaves unknown placeholders intact", () => {
    expect(
      t("en", "footer.copyright_default", { year: 2026, site: "My Blog" }),
    ).toBe("© 2026 My Blog");
    expect(t("pl", "footer.powered_by", { platform: "Hive" })).toBe(
      "Działa na Hive",
    );
    expect(t("en", "footer.copyright_default", { year: 2026 })).toBe(
      "© 2026 {site}",
    );
  });

  it("does not resolve inherited properties as params", () => {
    expect(t("en", "footer.powered_by", {})).toBe("Powered by {platform}");
  });
});

describe("format_date", () => {
  const date = new Date(Date.UTC(2026, 2, 15, 12));

  it("formats per locale", () => {
    const options = {
      timeZone: "UTC",
      year: "numeric",
      month: "long",
      day: "numeric",
    } as const;
    expect(format_date("en", date, options)).toBe("March 15, 2026");
    expect(format_date("pl", date, options)).toBe("15 marca 2026");
    expect(format_date("xx", date, options)).toBe("March 15, 2026");
  });

  it("returns empty string for invalid input", () => {
    expect(format_date("en", "not a date")).toBe("");
  });
});

describe("format_relative_time", () => {
  const now = new Date(Date.UTC(2026, 9, 14, 12));
  const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000);

  it("picks the largest fitting unit", () => {
    expect(format_relative_time("en", ago(5 * 60), now)).toBe("5 minutes ago");
    expect(format_relative_time("en", ago(3 * 3600), now)).toBe("3 hours ago");
    expect(format_relative_time("en", ago(2 * 86400), now)).toBe("2 days ago");
    expect(format_relative_time("pl", ago(5 * 60), now)).toBe("5 minut temu");
    expect(format_relative_time("pl", ago(86400), now)).toBe("wczoraj");
  });

  it("handles the present and the future", () => {
    expect(format_relative_time("en", now, now)).toBe("now");
    expect(format_relative_time("en", ago(-3600), now)).toBe("in 1 hour");
  });

  it("supports short style", () => {
    const short = format_relative_time("en", ago(5 * 60), now, "short");
    expect(short).toMatch(/^5 min/);
    expect(short).not.toBe("5 minutes ago");
  });

  it("returns empty string for invalid input", () => {
    expect(format_relative_time("pl", "nope", now)).toBe("");
  });
});

describe("t_count", () => {
  it("uses English one/other", () => {
    expect(t_count("en", "count.replies", 1)).toBe("1 reply");
    expect(t_count("en", "count.replies", 2)).toBe("2 replies");
    expect(t_count("en", "count.votes", 1)).toBe("1 vote");
    expect(t_count("en", "count.votes", 5)).toBe("5 votes");
    expect(t_count(undefined, "count.votes", 21)).toBe("21 votes");
  });

  it("uses Polish one/few/many", () => {
    expect(t_count("pl", "count.votes", 1)).toBe("1 głos");
    expect(t_count("pl", "count.votes", 3)).toBe("3 głosy");
    expect(t_count("pl", "count.votes", 5)).toBe("5 głosów");
    expect(t_count("pl", "count.votes", 22)).toBe("22 głosy");
    expect(t_count("pl", "count.votes", 25)).toBe("25 głosów");
    expect(t_count("pl", "count.replies", 1)).toBe("1 odpowiedź");
    expect(t_count("pl", "count.replies", 4)).toBe("4 odpowiedzi");
  });

  it("picks Polish comment forms for the post page counter", () => {
    expect(
      [1, 2, 5, 22, 1.5].map((count) => t_count("pl", "count.comments", count)),
    ).toEqual([
      "1 komentarz",
      "2 komentarze",
      "5 komentarzy",
      "22 komentarze",
      "1.5 komentarza",
    ]);
    expect(t_count("en", "count.comments", 1)).toBe("1 comment");
    expect(t_count("en", "count.comments", 0)).toBe("0 comments");
  });

  it("labels collapsed comment threads in en and pl", () => {
    expect(
      [1, 3].map((count) => t_count("en", "count.hidden_comments", count)),
    ).toEqual(["1 comment hidden", "3 comments hidden"]);
    expect(
      [1, 2, 5, 22].map((count) =>
        t_count("pl", "count.hidden_comments", count),
      ),
    ).toEqual([
      "1 ukryty komentarz",
      "2 ukryte komentarze",
      "5 ukrytych komentarzy",
      "22 ukryte komentarze",
    ]);
  });
});

describe("template params", () => {
  it("fills the SlotRenderer and site default strings", () => {
    expect(t("en", "posts.category_limit", { tag: "photo", count: 20 })).toBe(
      "Showing posts with tag #photo from the latest 20. More matching posts may exist.",
    );
    expect(t("en", "posts.empty_tag", { tag: "photo" })).toBe(
      "No posts with tag #photo",
    );
    expect(t("en", "posts.empty_user", { user: "alice" })).toBe(
      "No posts found for @alice",
    );
    expect(t("en", "site.default_blog_name", { user: "alice" })).toBe(
      "alice Blog",
    );
    expect(t("pl", "new_post.back")).toBe("Wróć do społeczności");
  });
});

describe("post page, section and status keys", () => {
  const KEYS: readonly I18nKey[] = [
    "post.title_fallback",
    "post.invalid_address",
    "post.not_found",
    "post.fetch_error",
    "post.muted",
    "error.label",
    "image.failed",
    "common.retry",
    "community.not_configured",
    "cta.consent_default",
    "cta.privacy_link",
    "section.opens_new_tab",
    "section.consent_required",
    "page.not_found",
    "page.load_error",
  ];

  it("has a distinct Polish translation for every key", () => {
    for (const key of KEYS) {
      expect(DICTIONARIES.pl[key].trim()).not.toBe("");
      expect(DICTIONARIES.pl[key]).not.toBe(DICTIONARIES.en[key]);
    }
  });

  it("keeps the post page strings it replaced", () => {
    expect(t("en", "post.invalid_address")).toBe("Invalid post address.");
    expect(t("en", "post.fetch_error")).toBe(
      "Error fetching post from Hive blockchain.",
    );
    expect(t("en", "error.label")).toBe("Error:");
    expect(t("pl", "error.label")).toBe("Błąd:");
    expect(t("pl", "common.retry")).toBe("Spróbuj ponownie");
    expect(t("pl", "post.title_fallback")).toBe("Wpis");
  });
});
