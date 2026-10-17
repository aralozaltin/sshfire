const KEY = "ssh-istemci.openTabs";

export interface SavedTab {
  sessionId: string;
  title: string;
}

export function loadSavedTabs(): SavedTab[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t): t is SavedTab => !!t && typeof t === "object" && typeof (t as SavedTab).sessionId === "string" && typeof (t as SavedTab).title === "string",
    ).map((t) => ({ sessionId: t.sessionId, title: t.title }));
  } catch {
    return [];
  }
}

export function saveTabs(tabs: SavedTab[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(tabs));
  } catch {
    // Depolama kapalıysa sekmeler bir sonraki açılışta geri gelmez; başka bir şey bozulmaz.
  }
}
