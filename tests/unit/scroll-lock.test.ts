// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { afterEach, describe, expect, it } from "vitest";
import {
  lock_scroll,
  scroll_lock_count,
  unlock_scroll,
  type ScrollLockDocument,
} from "../../src/lib/scroll-lock";

function fake_document(overflow = ""): ScrollLockDocument {
  return { body: { style: { overflow } } };
}

afterEach(() => {
  const doc = fake_document();
  while (scroll_lock_count() > 0) unlock_scroll(doc);
});

describe("scroll lock", () => {
  it("hides overflow and restores the previous value on unlock", () => {
    const doc = fake_document("auto");
    lock_scroll(doc);
    expect(doc.body.style.overflow).toBe("hidden");
    unlock_scroll(doc);
    expect(doc.body.style.overflow).toBe("auto");
  });

  it("keeps the lock until the last holder releases it", () => {
    const doc = fake_document("scroll");
    lock_scroll(doc);
    lock_scroll(doc);
    unlock_scroll(doc);
    expect(doc.body.style.overflow).toBe("hidden");
    expect(scroll_lock_count()).toBe(1);
    unlock_scroll(doc);
    expect(doc.body.style.overflow).toBe("scroll");
    expect(scroll_lock_count()).toBe(0);
  });

  it("ignores unlock without a matching lock", () => {
    const doc = fake_document("clip");
    unlock_scroll(doc);
    expect(doc.body.style.overflow).toBe("clip");
    expect(scroll_lock_count()).toBe(0);
    lock_scroll(doc);
    unlock_scroll(doc);
    unlock_scroll(doc);
    expect(doc.body.style.overflow).toBe("clip");
    expect(scroll_lock_count()).toBe(0);
  });

  it("saves the overflow again for a new lock cycle", () => {
    const doc = fake_document("");
    lock_scroll(doc);
    unlock_scroll(doc);
    doc.body.style.overflow = "visible";
    lock_scroll(doc);
    unlock_scroll(doc);
    expect(doc.body.style.overflow).toBe("visible");
  });
});
