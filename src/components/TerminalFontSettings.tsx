import { useState } from "react";
import { useT } from "../i18n";
import { cleanFontName, loadFontFamily, saveFontFamily } from "../terminal/font";
import { clampFontSize, DEFAULT_FONT_SIZE, loadFontSize, saveFontSize } from "../terminal/fontSize";

const SUGGESTIONS = ["JetBrainsMono Nerd Font", "FiraCode Nerd Font", "MesloLGS NF", "Hack Nerd Font", "CaskaydiaCove Nerd Font"];

export function TerminalFontSettings() {
  const t = useT();
  const s = t.termFont;
  const [family, setFamily] = useState(loadFontFamily);
  const [size, setSize] = useState(loadFontSize);

  return (
    <div className="term-font">
      <label className="theme-toggle">
        {s.family}
        <input
          type="text"
          list="term-font-suggestions"
          placeholder={s.placeholder}
          value={family}
          onChange={(e) => {
            setFamily(e.target.value);
            saveFontFamily(e.target.value);
          }}
          onBlur={() => setFamily(cleanFontName(family))}
        />
        <datalist id="term-font-suggestions">
          {SUGGESTIONS.map((n) => <option key={n} value={n} />)}
        </datalist>
      </label>
      <label className="theme-toggle">
        {s.size}
        <input
          type="number"
          min={8}
          max={32}
          value={size}
          onChange={(e) => {
            const n = clampFontSize(Number(e.target.value));
            setSize(n);
            saveFontSize(n);
          }}
        />
      </label>
      <p className="term-font__hint">{s.hint}</p>
      <button
        type="button"
        onClick={() => {
          setFamily("");
          setSize(DEFAULT_FONT_SIZE);
          saveFontFamily("");
          saveFontSize(DEFAULT_FONT_SIZE);
        }}
      >
        {s.reset}
      </button>
    </div>
  );
}
