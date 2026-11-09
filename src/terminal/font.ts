const KEY = "ssh-istemci.fontFamily";
export const FONT_EVENT = "sshfire:term-font";
export const BASE_FONTS = 'Menlo, "SF Mono", Consolas, monospace';

/** Yazı tipi adından tırnak, virgül ve kontrol karakterlerini atar; CSS yığınını bozamasın. */
export function cleanFontName(raw: string): string {
  return raw.replace(/["'`\;{}<>,\u0000-\u001f]/g, "").trim().slice(0, 80);
}

/** Kullanıcının seçtiği yazı tipi (varsa) önce gelir; yoksa ya da yüklü değilse sistem tipleri devreye girer. */
export function fontStack(userFont: string): string {
  const name = cleanFontName(userFont);
  return name ? `"${name}", ${BASE_FONTS}` : BASE_FONTS;
}

export function loadFontFamily(): string {
  try {
    return cleanFontName(localStorage.getItem(KEY) ?? "");
  } catch {
    return "";
  }
}

export function saveFontFamily(name: string): void {
  const clean = cleanFontName(name);
  try {
    if (clean) localStorage.setItem(KEY, clean);
    else localStorage.removeItem(KEY);
  } catch {
    // Depolama kapalıysa yazı tipi yalnızca bu oturumda geçerli olur.
  }
  window.dispatchEvent(new Event(FONT_EVENT));
}
