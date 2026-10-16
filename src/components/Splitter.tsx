import { useEffect, useRef, type KeyboardEvent, type MouseEvent } from "react";
import { useT } from "../i18n";
import { clampWidth, DEFAULT_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH, MIN_SIDEBAR_WIDTH } from "../layout/sidebarWidth";

export interface SplitterProps {
  width: number;
  onChange: (width: number) => void;
}

export function Splitter({ width, onChange }: SplitterProps) {
  const t = useT();
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);
  const latest = useRef({ onChange });
  latest.current = { onChange };

  useEffect(() => {
    const move = (e: globalThis.MouseEvent) => {
      if (drag.current) latest.current.onChange(clampWidth(drag.current.startWidth + e.clientX - drag.current.startX));
    };
    const up = () => {
      drag.current = null;
      document.body.classList.remove("is-resizing");
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, []);

  function onMouseDown(e: MouseEvent) {
    e.preventDefault();
    drag.current = { startX: e.clientX, startWidth: width };
    document.body.classList.add("is-resizing");
  }

  function onKeyDown(e: KeyboardEvent) {
    const step = e.shiftKey ? 64 : 16;
    if (e.key === "ArrowRight") onChange(clampWidth(width + step));
    else if (e.key === "ArrowLeft") onChange(clampWidth(width - step));
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={t.layout.sidebarResize}
      aria-valuenow={width}
      aria-valuemin={MIN_SIDEBAR_WIDTH}
      aria-valuemax={MAX_SIDEBAR_WIDTH}
      tabIndex={0}
      className="splitter"
      onMouseDown={onMouseDown}
      onKeyDown={onKeyDown}
      onDoubleClick={() => onChange(DEFAULT_SIDEBAR_WIDTH)}
    />
  );
}
