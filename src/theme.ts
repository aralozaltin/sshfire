export type ThemeMode = "system" | "light" | "dark";

const KEY = "ssh-istemci.theme";

export function resolveTheme(mode: ThemeMode, systemDark: boolean): "light" | "dark" {
  if (mode === "system") return systemDark ? "dark" : "light";
  return mode;
}

export function loadThemeMode(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" || v === "system" ? v : "system";
  } catch {
    return "system";
  }
}

export function saveThemeMode(mode: ThemeMode): void {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    // Depolama kapalıysa tema yalnızca bu oturumda geçerli olur.
  }
}

export function applyTheme(resolved: "light" | "dark"): void {
  document.documentElement.dataset.theme = resolved;
}
