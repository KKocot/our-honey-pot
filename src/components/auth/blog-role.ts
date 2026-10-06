// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createResource, type Accessor } from "solid-js";
import { currentUser, isAuthenticated } from "./auth-store";
import { get_blog_role } from "../../lib/config-account";
import type { BlogRole } from "../../lib/community-roles";

interface ResolvedRole {
  username: string;
  role: BlogRole;
}

/**
 * Role of the logged-in user on `blog`; "none" while logged out, while loading and on network errors.
 * The result carries its username so a previous account's role never shows after switching users.
 */
export function create_blog_role(
  blog: Accessor<string | undefined>,
): Accessor<BlogRole> {
  const username = () =>
    isAuthenticated() ? (currentUser()?.username ?? null) : null;

  const [resolved] = createResource(
    () => {
      const name = username();
      const blog_name = blog();
      return name && blog_name ? { blog: blog_name, username: name } : null;
    },
    async ({ blog, username }): Promise<ResolvedRole> => ({
      username,
      role: await get_blog_role(blog, username).catch(() => "none" as const),
    }),
  );

  return () => {
    const name = username();
    const value = resolved.latest;
    return name && value?.username === name ? value.role : "none";
  };
}

export function is_staff_role(role: BlogRole): boolean {
  return role === "owner" || role === "admin" || role === "mod";
}
