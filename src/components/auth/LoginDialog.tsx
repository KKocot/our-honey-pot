// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createSignal, type Component, type Accessor } from "solid-js";
import {
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
} from "../ui/Dialog";
import { HBAuthLogin, type HBAuthMode } from "./HBAuthLogin";
import { KeychainLogin } from "./KeychainLogin";
import { WifLogin } from "./WifLogin";
import { login, type AuthUser } from "./auth-store";
import { is_not_mainnet } from "../../lib/config";

interface LoginDialogProps {
  open: Accessor<boolean>;
  on_close: () => void;
}

type LoginTab = "hbauth" | "keychain" | "wif";

const TAB_BASE =
  "px-4 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer";
const TAB_ACTIVE = "bg-primary text-primary-text";
const TAB_INACTIVE = "text-text-muted hover:text-text hover:bg-bg-secondary";

const MODE_BASE =
  "flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer";
const MODE_ACTIVE = "bg-bg-card text-text shadow-sm";
const MODE_INACTIVE = "text-text-muted hover:text-text";

export const LoginDialog: Component<LoginDialogProps> = (props) => {
  const is_testnet = is_not_mainnet();
  const [tab, set_tab] = createSignal<LoginTab>(is_testnet ? "wif" : "hbauth");
  const [hbauth_mode, set_hbauth_mode] = createSignal<HBAuthMode>("login");

  function handle_login_success(user: {
    username: string;
    privateKey: string;
    keyType: "posting" | "active";
    loginType: "hbauth" | "keychain" | "wif";
  }) {
    login(user as AuthUser);
    props.on_close();
  }

  function tab_button(id: LoginTab, label: string) {
    return (
      <button
        type="button"
        aria-pressed={tab() === id}
        class={`${TAB_BASE} ${tab() === id ? TAB_ACTIVE : TAB_INACTIVE}`}
        onClick={() => set_tab(id)}
      >
        {label}
      </button>
    );
  }

  function mode_button(id: HBAuthMode, label: string) {
    return (
      <button
        type="button"
        aria-pressed={hbauth_mode() === id}
        class={`${MODE_BASE} ${hbauth_mode() === id ? MODE_ACTIVE : MODE_INACTIVE}`}
        onClick={() => set_hbauth_mode(id)}
      >
        {label}
      </button>
    );
  }

  return (
    <DialogContent open={props.open} onClose={props.on_close}>
      <DialogHeader>
        <DialogTitle>Login to Hive</DialogTitle>
      </DialogHeader>
      <DialogBody>
        <div class="flex gap-2 mb-4" role="group" aria-label="Login method">
          {!is_testnet && tab_button("hbauth", "HB-Auth")}
          {tab_button("keychain", "Keychain")}
          {tab_button("wif", "WIF Key")}
        </div>

        {tab() === "hbauth" && !is_testnet && (
          <>
            <div
              class="flex gap-1 p-1 mb-4 rounded-lg bg-bg-secondary border border-border"
              role="group"
              aria-label="HB-Auth mode"
            >
              {mode_button("login", "Log in")}
              {mode_button("register", "Add key")}
            </div>
            <HBAuthLogin
              mode={hbauth_mode()}
              onModeChange={set_hbauth_mode}
              onSuccess={handle_login_success}
            />
          </>
        )}
        {tab() === "keychain" && (
          <KeychainLogin onSuccess={handle_login_success} />
        )}
        {tab() === "wif" && <WifLogin onSuccess={handle_login_success} />}
      </DialogBody>
    </DialogContent>
  );
};
