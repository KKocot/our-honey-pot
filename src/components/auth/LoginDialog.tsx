// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createSignal, type Component, type Accessor } from "solid-js";
import { DialogContent, DialogHeader, DialogTitle, DialogBody } from "../ui/Dialog";
import { HBAuthLogin } from "./HBAuthLogin";
import { KeychainLogin } from "./KeychainLogin";
import { WifLogin } from "./WifLogin";
import { login, type AuthUser } from "./auth-store";
import { is_not_mainnet } from "../../lib/config";

interface LoginDialogProps {
  open: Accessor<boolean>;
  on_close: () => void;
}

type LoginTab = "hbauth" | "keychain" | "wif";

const TAB_BASE = "px-4 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer";
const TAB_ACTIVE = "bg-primary text-primary-text";
const TAB_INACTIVE = "text-text-muted hover:text-text hover:bg-bg-secondary";

export const LoginDialog: Component<LoginDialogProps> = (props) => {
  const is_testnet = is_not_mainnet();
  const [tab, set_tab] = createSignal<LoginTab>(is_testnet ? "wif" : "hbauth");

  function handle_login_success(user: {
    username: string;
    privateKey: string;
    keyType: "posting" | "active";
    loginType: "hbauth" | "keychain" | "wif";
  }) {
    login(user as AuthUser);
    props.on_close();
  }

  return (
    <DialogContent open={props.open} onClose={props.on_close}>
      <DialogHeader>
        <DialogTitle>Login to Hive</DialogTitle>
      </DialogHeader>
      <DialogBody>
        {/* Tab selector */}
        <div class="flex gap-2 mb-4">
          {!is_testnet && (
            <button type="button" class={`${TAB_BASE} ${tab() === "hbauth" ? TAB_ACTIVE : TAB_INACTIVE}`} onClick={() => set_tab("hbauth")}>
              HB-Auth
            </button>
          )}
          <button type="button" class={`${TAB_BASE} ${tab() === "keychain" ? TAB_ACTIVE : TAB_INACTIVE}`} onClick={() => set_tab("keychain")}>
            Keychain
          </button>
          {is_testnet && (
            <button type="button" class={`${TAB_BASE} ${tab() === "wif" ? TAB_ACTIVE : TAB_INACTIVE}`} onClick={() => set_tab("wif")}>
              WIF Key
            </button>
          )}
        </div>

        {/* Tab content */}
        {tab() === "hbauth" && !is_testnet && (
          <HBAuthLogin mode="login" onSuccess={handle_login_success} />
        )}
        {tab() === "keychain" && (
          <KeychainLogin onSuccess={handle_login_success} />
        )}
        {tab() === "wif" && is_testnet && (
          <WifLogin onSuccess={handle_login_success} />
        )}
      </DialogBody>
    </DialogContent>
  );
};
