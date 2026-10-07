// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

export interface ScrollLockDocument {
  body: { style: { overflow: string } };
}

let lock_count = 0;
let previous_overflow = "";

/** Block body scroll; nested locks share one saved overflow value. */
export function lock_scroll(doc: ScrollLockDocument = document): void {
  if (lock_count === 0) {
    previous_overflow = doc.body.style.overflow;
    doc.body.style.overflow = "hidden";
  }
  lock_count += 1;
}

/** Release one lock; the saved overflow comes back only when the last lock is released. */
export function unlock_scroll(doc: ScrollLockDocument = document): void {
  if (lock_count === 0) return;
  lock_count -= 1;
  if (lock_count === 0) doc.body.style.overflow = previous_overflow;
}

export function scroll_lock_count(): number {
  return lock_count;
}
