import { useT } from "../i18n";
import { formatMode, formatModified, formatOctal, formatSize } from "../files/format";
import type { FileEntry } from "../files/types";

export function FileInfoDialog({ entry, onClose }: { entry: FileEntry; onClose: () => void }) {
  const t = useT();
  const f = t.files;
  const type = entry.isSymlink ? f.typeLink : entry.isDir ? f.typeFolder : f.typeFile;
  const rows: [string, string][] = [
    [f.infoName, entry.name],
    [f.infoPath, entry.path],
    [f.infoType, type],
    [f.infoSize, `${formatSize(entry.size)} (${entry.size} B)`],
    [f.infoPermissions, entry.permissions == null ? "—" : `${formatMode(entry.permissions)} (${formatOctal(entry.permissions)})`],
    [f.infoOwner, entry.owner ?? "—"],
    [f.infoGroup, entry.group ?? "—"],
    [f.infoModified, formatModified(entry.modified, f.dateLocale)],
  ];
  return (
    <div role="dialog" aria-label={f.info} className="hostkey-dialog file-info">
      <h2>{f.info}</h2>
      <dl>
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <div className="hostkey-dialog__actions">
        <button type="button" autoFocus onClick={onClose}>{f.close}</button>
      </div>
    </div>
  );
}
