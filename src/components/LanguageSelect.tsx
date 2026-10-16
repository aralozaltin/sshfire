import { useT, type LocaleSetting } from "../i18n";

export interface LanguageSelectProps {
  setting: LocaleSetting;
  onChange: (setting: LocaleSetting) => void;
}

export function LanguageSelect({ setting, onChange }: LanguageSelectProps) {
  const t = useT();
  return (
    <label className="theme-toggle">
      {t.language.label}
      <select value={setting} onChange={(e) => onChange(e.target.value as LocaleSetting)}>
        <option value="system">{t.language.system}</option>
        <option value="tr">{t.language.tr}</option>
        <option value="en">{t.language.en}</option>
      </select>
    </label>
  );
}
