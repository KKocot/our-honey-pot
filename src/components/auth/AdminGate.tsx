// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createResource, Show, type Component, type JSX } from "solid-js";
import { currentUser, isAuthenticated } from "./auth-store";
import { fetch_community_roles } from "../../lib/queries";
import { parse_community_roles, get_user_role, can_access_admin, type CommunityRole } from "../../lib/community-roles";

interface AdminGateProps {
  children: JSX.Element;
  community_name: string;
}

export const AdminGate: Component<AdminGateProps> = (props) => {
  const community = () => props.community_name;

  const [roles] = createResource(community, async (name) => {
    if (!name) return [];
    const raw = await fetch_community_roles(name);
    return parse_community_roles(raw);
  });

  const user_role = (): CommunityRole => {
    const user = currentUser();
    const parsed = roles();
    if (!user || !parsed) return "guest";
    return get_user_role(parsed, user.username);
  };

  const has_access = () => isAuthenticated() && can_access_admin(user_role());

  return (
    <>
      <Show when={!isAuthenticated()}>
        <div class="text-center py-12 bg-bg-card rounded-xl shadow-sm border border-border">
          <p class="text-text mb-2">Please login to access the admin panel.</p>
          <p class="text-text-muted text-sm">You need a community role (owner, admin, or mod) to manage settings.</p>
        </div>
      </Show>

      <Show when={isAuthenticated() && roles.loading}>
        <div class="text-center py-12 bg-bg-card rounded-xl shadow-sm border border-border">
          <p class="text-text-muted">Checking permissions...</p>
        </div>
      </Show>

      <Show when={isAuthenticated() && !roles.loading && !has_access()}>
        <div class="text-center py-12 bg-bg-card rounded-xl shadow-sm border border-border">
          <p class="text-error mb-2">Access Denied</p>
          <p class="text-text-muted text-sm">
            You don't have permission to access the admin panel.
            Required role: owner, admin, or mod.
          </p>
        </div>
      </Show>

      <Show when={has_access()}>
        {props.children}
      </Show>
    </>
  );
};
