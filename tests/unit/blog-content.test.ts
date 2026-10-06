// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { describe, expect, it } from "vitest";
import {
  account_page_summary,
  can_go_next,
  can_go_previous,
  go_first,
  go_next,
  go_previous,
  tab_has_pagination,
  to_account_cursor,
} from "../../src/components/community/pagination";

function next_from(
  state: ReturnType<typeof go_first>,
  start_author: string,
  start_permlink: string,
) {
  const summary = account_page_summary({
    has_more: true,
    next_cursor: { startAuthor: start_author, startPermlink: start_permlink },
  });
  return go_next(state, summary.next_author, summary.next_permlink);
}

describe("blog pagination cursor stack", () => {
  it("starts on the first page without a bridge cursor", () => {
    const state = go_first();
    expect(to_account_cursor(state.cursor)).toBeUndefined();
    expect(can_go_previous(state)).toBe(false);
  });

  it("previous returns to the page before, not to the first page", () => {
    const page_2 = next_from(go_first(), "alice", "p10");
    const page_3 = next_from(page_2, "alice", "p20");
    expect(to_account_cursor(page_3.cursor)).toEqual({
      startAuthor: "alice",
      startPermlink: "p20",
    });

    const back = go_previous(page_3);
    expect(to_account_cursor(back.cursor)).toEqual({
      startAuthor: "alice",
      startPermlink: "p10",
    });
    expect(can_go_previous(back)).toBe(true);

    const first = go_previous(back);
    expect(to_account_cursor(first.cursor)).toBeUndefined();
    expect(can_go_previous(first)).toBe(false);
  });

  it("keeps the stack when the next page has no cursor (e.g. it failed to load)", () => {
    const page_2 = next_from(go_first(), "alice", "p10");
    const summary = account_page_summary(undefined);
    expect(can_go_next(summary)).toBe(false);
    expect(go_next(page_2, summary.next_author, summary.next_permlink)).toBe(
      page_2,
    );
    expect(can_go_previous(page_2)).toBe(true);
  });

  it("offers next only when the bridge page has more and a cursor", () => {
    expect(
      can_go_next(
        account_page_summary({
          has_more: true,
          next_cursor: { startAuthor: "alice", startPermlink: "p10" },
        }),
      ),
    ).toBe(true);
    expect(
      can_go_next(
        account_page_summary({
          has_more: false,
          next_cursor: { startAuthor: "alice", startPermlink: "p10" },
        }),
      ),
    ).toBe(false);
  });
});

describe("tab_has_pagination", () => {
  it("hides pagination on threads", () => {
    expect(tab_has_pagination("threads")).toBe(false);
  });

  it("shows pagination on posts, comments and category tabs", () => {
    expect(tab_has_pagination("posts")).toBe(true);
    expect(tab_has_pagination("comments")).toBe(true);
    expect(tab_has_pagination("category-hive")).toBe(true);
  });
});
