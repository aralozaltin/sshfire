/** Terminalde tıklanan bağlantılardan yalnızca http(s) açılır; file:, javascript: gibi şemalar reddedilir. */
export function isSafeUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
