// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

export const LOCALES = ["en", "pl"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

const en = {
  "posts.empty": "No posts found",
  "posts.none": "No posts",
  "posts.load_more": "Load more posts",
  "posts.pinned": "Pinned",
  "post.not_found": "Post not found.",
  "post.title_fallback": "Post",
  "post.invalid_address": "Invalid post address.",
  "post.fetch_error": "Error fetching post from Hive blockchain.",
  "post.muted": "This post has been muted by community moderators",
  "error.label": "Error:",
  "common.retry": "Retry",
  "community.not_configured": "Hive community name is not configured.",
  "posts.empty_tag": "No posts with tag #{tag}",
  "posts.empty_user": "No posts found for @{user}",
  "posts.category_limit":
    "Showing posts with tag #{tag} from the latest {count}. More matching posts may exist.",
  "count.replies.one": "{count} reply",
  "count.replies.few": "{count} replies",
  "count.replies.many": "{count} replies",
  "count.replies.other": "{count} replies",
  "count.votes.one": "{count} vote",
  "count.votes.few": "{count} votes",
  "count.votes.many": "{count} votes",
  "count.votes.other": "{count} votes",
  "count.comments.one": "{count} comment",
  "count.comments.few": "{count} comments",
  "count.comments.many": "{count} comments",
  "count.comments.other": "{count} comments",
  "site.default_blog_name": "{user} Blog",
  "site.default_hive_blog_name": "Hive Blog",
  "site.default_blog_description": "Posts from Hive blockchain",
  "site.default_community_name": "Hive Community",
  "site.default_community_description": "Hive community",
  "new_post.page_title": "New Post - {name}",
  "new_post.default_name": "Community",
  "new_post.back": "Back to community",
  "new_post.heading": "Create New Post",
  "new_post.not_configured":
    "Community is not configured. Set the HIVE_USERNAME environment variable of the container",
  "pagination.first": "First page",
  "threads.empty": "No threads found",
  "threads.empty_hint":
    'Create a post titled "My Threads" on your profile and write comments under it.',
  "comments.empty": "No comments found",
  "comments.none": "No comments",
  "comments.load_more": "Load more comments",
  "comments.view": "View",
  "tabs.posts": "Posts",
  "tabs.threads": "Threads",
  "tabs.comments": "Comments",
  "profile.posts": "Posts",
  "profile.followers": "Followers",
  "profile.following": "Following",
  "profile.voting_power": "Voting Power",
  "community.loading": "Loading community...",
  "image.failed": "Image failed to load",
  "topbar.login": "Log in",
  "nav.menu_open": "Open menu",
  "nav.menu_close": "Close menu",
  "a11y.skip_to_content": "Skip to content",
  "footer.built_by": "Built by",
  "footer.kofi_aria": "Support on Ko-fi",
  "footer.kofi_alt": "Buy Me a Coffee at ko-fi.com",
  "footer.powered_by": "Powered by {platform}",
  "footer.copyright_default": "© {year} {site}",
  "cta.consent_default":
    "By subscribing you agree to the processing of your data by the newsletter provider.",
  "cta.consent_checkbox": "I agree to the terms above",
  "cta.privacy_link": "Privacy policy",
  "section.opens_new_tab": "(opens in a new tab)",
  "section.consent_required": "Accept the terms above to continue",
  "page.not_found": "Page not found",
} as const satisfies Record<string, string>;

export type I18nKey = keyof typeof en;
export type Dictionary = Readonly<Record<I18nKey, string>>;

const pl: Dictionary = {
  "posts.empty": "Brak wpisów",
  "posts.none": "Brak wpisów",
  "posts.load_more": "Załaduj więcej wpisów",
  "posts.pinned": "Przypięty",
  "post.not_found": "Nie znaleziono wpisu.",
  "post.title_fallback": "Wpis",
  "post.invalid_address": "Nieprawidłowy adres wpisu.",
  "post.fetch_error": "Błąd pobierania wpisu z blockchaina Hive.",
  "post.muted": "Ten wpis został wyciszony przez moderatorów społeczności",
  "error.label": "Błąd:",
  "common.retry": "Spróbuj ponownie",
  "community.not_configured": "Nazwa społeczności Hive nie jest skonfigurowana.",
  "posts.empty_tag": "Brak wpisów z tagiem #{tag}",
  "posts.empty_user": "Brak wpisów użytkownika @{user}",
  "posts.category_limit":
    "Wpisy z tagiem #{tag} spośród ostatnich {count}. Pasujących wpisów może być więcej.",
  "count.replies.one": "{count} odpowiedź",
  "count.replies.few": "{count} odpowiedzi",
  "count.replies.many": "{count} odpowiedzi",
  "count.replies.other": "{count} odpowiedzi",
  "count.votes.one": "{count} głos",
  "count.votes.few": "{count} głosy",
  "count.votes.many": "{count} głosów",
  "count.votes.other": "{count} głosu",
  "count.comments.one": "{count} komentarz",
  "count.comments.few": "{count} komentarze",
  "count.comments.many": "{count} komentarzy",
  "count.comments.other": "{count} komentarza",
  "site.default_blog_name": "Blog {user}",
  "site.default_hive_blog_name": "Blog Hive",
  "site.default_blog_description": "Wpisy z blockchaina Hive",
  "site.default_community_name": "Społeczność Hive",
  "site.default_community_description": "Społeczność Hive",
  "new_post.page_title": "Nowy wpis - {name}",
  "new_post.default_name": "Społeczność",
  "new_post.back": "Wróć do społeczności",
  "new_post.heading": "Utwórz nowy wpis",
  "new_post.not_configured":
    "Społeczność nie jest skonfigurowana. Ustaw zmienną środowiskową HIVE_USERNAME kontenera",
  "pagination.first": "Pierwsza strona",
  "threads.empty": "Brak wątków",
  "threads.empty_hint":
    "Utwórz na swoim profilu wpis o tytule „My Threads” i pisz pod nim komentarze.",
  "comments.empty": "Brak komentarzy",
  "comments.none": "Brak komentarzy",
  "comments.load_more": "Załaduj więcej komentarzy",
  "comments.view": "Zobacz",
  "tabs.posts": "Wpisy",
  "tabs.threads": "Wątki",
  "tabs.comments": "Komentarze",
  "profile.posts": "Wpisy",
  "profile.followers": "Obserwujący",
  "profile.following": "Obserwowani",
  "profile.voting_power": "Moc głosu",
  "community.loading": "Ładowanie społeczności...",
  "image.failed": "Nie udało się załadować obrazu",
  "topbar.login": "Zaloguj się",
  "nav.menu_open": "Otwórz menu",
  "nav.menu_close": "Zamknij menu",
  "a11y.skip_to_content": "Przejdź do treści",
  "footer.built_by": "Wykonanie:",
  "footer.kofi_aria": "Wesprzyj na Ko-fi",
  "footer.kofi_alt": "Postaw mi kawę na ko-fi.com",
  "footer.powered_by": "Działa na {platform}",
  "footer.copyright_default": "© {year} {site}",
  "cta.consent_default":
    "Zapisując się, zgadzasz się na przetwarzanie danych przez dostawcę newslettera.",
  "cta.consent_checkbox": "Akceptuję powyższe warunki",
  "cta.privacy_link": "Polityka prywatności",
  "section.opens_new_tab": "(otwiera się w nowej karcie)",
  "section.consent_required": "Zaakceptuj powyższe warunki, aby kontynuować",
  "page.not_found": "Nie znaleziono strony",
};

export const DICTIONARIES: Readonly<Record<Locale, Dictionary>> = Object.freeze(
  {
    en: Object.freeze({ ...en }),
    pl: Object.freeze({ ...pl }),
  },
);

const INTL_TAGS: Readonly<Record<Locale, string>> = Object.freeze({
  en: "en-US",
  pl: "pl-PL",
});

export type I18nParams = Readonly<Record<string, string | number>>;

export function is_locale(value: unknown): value is Locale {
  return (
    typeof value === "string" && (LOCALES as readonly string[]).includes(value)
  );
}

/** Unknown or missing locale resolves to the default (en). */
export function resolve_locale(value: unknown): Locale {
  return is_locale(value) ? value : DEFAULT_LOCALE;
}

export function intl_locale(locale: unknown): string {
  return INTL_TAGS[resolve_locale(locale)];
}

/** Params are substituted verbatim; HTML escaping stays with the caller. */
export function t(locale: unknown, key: I18nKey, params?: I18nParams): string {
  const lookup_key: string = key;
  const localized: Readonly<Record<string, string>> =
    DICTIONARIES[resolve_locale(locale)];
  const fallback: Readonly<Record<string, string>> =
    DICTIONARIES[DEFAULT_LOCALE];
  const template = localized[lookup_key] ?? fallback[lookup_key] ?? lookup_key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : match,
  );
}

function to_date(value: Date | string | number): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const DEFAULT_DATE_OPTIONS: Intl.DateTimeFormatOptions = Object.freeze({
  year: "numeric",
  month: "short",
  day: "numeric",
});

/** Returns "" for invalid dates. */
export function format_date(
  locale: unknown,
  value: Date | string | number,
  options: Intl.DateTimeFormatOptions = DEFAULT_DATE_OPTIONS,
): string {
  const date = to_date(value);
  if (!date) return "";
  return new Intl.DateTimeFormat(intl_locale(locale), options).format(date);
}

const RELATIVE_UNITS: ReadonlyArray<
  readonly [Intl.RelativeTimeFormatUnit, number]
> = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
  ["second", 1],
];

/** Relative time against `now` (past = negative, e.g. "5 min ago"); "" for invalid dates. */
export function format_relative_time(
  locale: unknown,
  value: Date | string | number,
  now: Date | number = Date.now(),
  style: Intl.RelativeTimeFormatStyle = "long",
): string {
  const date = to_date(value);
  if (!date) return "";
  const now_ms = now instanceof Date ? now.getTime() : now;
  const diff_seconds = (date.getTime() - now_ms) / 1000;
  const abs_seconds = Math.abs(diff_seconds);
  const [unit, unit_seconds] = RELATIVE_UNITS.find(
    ([, seconds]) => abs_seconds >= seconds,
  ) ?? ["second", 1];
  const amount = Math.trunc(diff_seconds / unit_seconds);
  return new Intl.RelativeTimeFormat(intl_locale(locale), {
    numeric: "auto",
    style,
  }).format(amount === 0 ? 0 : amount, unit);
}

const PLURAL_FORMS = ["one", "few", "many", "other"] as const;
type PluralForm = (typeof PLURAL_FORMS)[number];
export type PluralKey = "count.replies" | "count.votes" | "count.comments";

function plural_form(locale: unknown, count: number): PluralForm {
  const category = new Intl.PluralRules(intl_locale(locale)).select(count);
  return (PLURAL_FORMS as readonly string[]).includes(category)
    ? (category as PluralForm)
    : "other";
}

/** "{count} <noun>" with the noun form picked by Intl.PluralRules (pl: one/few/many). */
export function t_count(
  locale: unknown,
  key: PluralKey,
  count: number,
): string {
  return t(locale, `${key}.${plural_form(locale, count)}`, { count });
}
