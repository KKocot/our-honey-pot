// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { Show, type Component, type JSX } from "solid-js";
import { create_blog_role, is_staff_role } from "./blog-role";

interface AdminGateProps {
  children: JSX.Element;
  /** HIVE_USERNAME of the blog */
  blog: string;
}

/**
 * Renders children only for blog staff (owner, admin, mod). UX only: saving is guarded by the config account check.
 * An unknown role (network error) counts as "none".
 */
export const AdminGate: Component<AdminGateProps> = (props) => {
  const role = create_blog_role(() => props.blog);

  return <Show when={is_staff_role(role())}>{props.children}</Show>;
};
