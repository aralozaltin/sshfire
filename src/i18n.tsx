import { createContext, useContext, type ReactNode } from "react";
import { en } from "./locales/en";
import { tr, type Messages } from "./locales/tr";

export type Locale = "tr" | "en";
export type LocaleSetting = "system" | Locale;

const KEY = "ssh-istemci.locale";
const catalogs: Record<Locale, Messages> = { tr, en };

export function detectLocale(language: string | undefined): Locale {
  return language?.toLowerCase().startsWith("tr") ? "tr" : "en";
}

export function resolveLocale(setting: LocaleSetting, language: string | undefined): Locale {
  return setting === "system" ? detectLocale(language) : setting;
}

export function loadLocaleSetting(): LocaleSetting {
  try {
    const v = localStorage.getItem(KEY);
    return v === "tr" || v === "en" || v === "system" ? v : "system";
  } catch {
    return "system";
  }
}

export function saveLocaleSetting(setting: LocaleSetting): void {
  try {
    localStorage.setItem(KEY, setting);
  } catch {
    // Depolama kapalıysa dil yalnızca bu oturumda geçerli olur.
  }
}

export function messagesFor(locale: Locale): Messages {
  return catalogs[locale];
}

const I18nContext = createContext<Messages>(tr);

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <I18nContext.Provider value={catalogs[locale]}>{children}</I18nContext.Provider>;
}

export function useT(): Messages {
  return useContext(I18nContext);
}

export interface BackendError {
  code: string;
  detail?: string;
  previous?: string;
  current?: string;
}

function isBackendError(e: unknown): e is BackendError {
  return typeof e === "object" && e !== null && typeof (e as BackendError).code === "string";
}

export function errorText(t: Messages, e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  if (!isBackendError(e)) return t.errors.unknown;
  const d = e.detail ?? "";
  switch (e.code) {
    case "host_key_rejected": return t.errors.hostKeyRejected;
    case "host_key_changed": return t.errors.hostKeyChanged(e.previous ?? "?", e.current ?? "?");
    case "auth_failed": return t.errors.authFailed;
    case "unreachable": return t.errors.unreachable(d);
    case "secret_denied": return t.errors.secretDenied;
    case "secret_unavailable": return t.errors.secretUnavailable(d);
    case "secret_other": return t.errors.secretOther;
    case "key_unreadable": return t.errors.keyUnreadable(d);
    case "ssh_other": return t.errors.sshOther(d);
    case "session_not_found": return t.errors.sessionNotFound;
    case "tab_not_found": return t.errors.tabNotFound;
    case "invalid_session": return t.errors.invalidSession(d);
    case "store_error": return t.errors.storeError(d);
    case "file_not_found": return t.errors.fileNotFound;
    case "permission_denied": return t.errors.permissionDenied;
    case "already_exists": return t.errors.alreadyExists;
    case "cancelled": return t.errors.cancelled;
    case "file_too_large": return t.errors.fileTooLarge;
    case "not_text": return t.errors.notText;
    case "password_cancelled": return t.errors.passwordCancelled;
    case "port_in_use": return t.errors.portInUse;
    case "local_shell": return t.errors.localShell(d);
    case "invalid_tunnel": return t.errors.invalidTunnel(d);
    case "tunnel_other": return t.errors.tunnelOther(d);
    case "sftp_other": return t.errors.sftpOther(d);
    default: return t.errors.unknownCode(e.code, d);
  }
}
