import { render, screen } from "@testing-library/react";
import { MetricsBar } from "./MetricsBar";
import type { Metrics } from "../metrics/types";

const GB = 1024 ** 3;
const base: Metrics = {
  cpuPercent: 12.4, memUsed: 3 * GB, memTotal: 16 * GB, swapUsed: 0, swapTotal: 2 * GB,
  diskUsed: 40 * GB, diskTotal: 200 * GB, load: [0.42, 0.31, 0.25], uptimeSecs: 3 * 86400 + 4 * 3600,
  netRxBps: 1.2 * 1024 * 1024, netTxBps: 40 * 1024,
};

test("formats every field", () => {
  render(<MetricsBar metrics={base} />);
  expect(screen.getByLabelText("İşlemci")).toHaveTextContent("12%");
  expect(screen.getByLabelText("Bellek")).toHaveTextContent("3.0 GB / 16 GB");
  expect(screen.getByLabelText("Disk")).toHaveTextContent("40 GB / 200 GB");
  expect(screen.getByLabelText("Yük")).toHaveTextContent("0.42 0.31 0.25");
  expect(screen.getByLabelText("Açık kalma")).toHaveTextContent("3g 4s");
  expect(screen.getByLabelText("Ağ")).toHaveTextContent("↓ 1.2 MB/s");
  expect(screen.getByLabelText("Ağ")).toHaveTextContent("↑ 40 KB/s");
});

test("shows dashes for every field when metrics are unavailable", () => {
  render(<MetricsBar metrics={null} />);
  for (const label of ["İşlemci", "Bellek", "Disk", "Yük", "Açık kalma", "Ağ"]) {
    expect(screen.getByLabelText(label)).toHaveTextContent("—");
  }
});

test("the first sample has no cpu or network rate yet and shows dashes for those only", () => {
  render(<MetricsBar metrics={{ ...base, cpuPercent: null, netRxBps: null, netTxBps: null }} />);
  expect(screen.getByLabelText("İşlemci")).toHaveTextContent("—");
  expect(screen.getByLabelText("Ağ")).toHaveTextContent("—");
  expect(screen.getByLabelText("Bellek")).toHaveTextContent("3.0 GB");
});

test("high usage gets warning and critical classes", () => {
  const { rerender } = render(<MetricsBar metrics={{ ...base, cpuPercent: 85 }} />);
  expect(screen.getByLabelText("İşlemci")).toHaveClass("metric--warn");
  rerender(<MetricsBar metrics={{ ...base, cpuPercent: 95, memUsed: 15 * GB }} />);
  expect(screen.getByLabelText("İşlemci")).toHaveClass("metric--crit");
  expect(screen.getByLabelText("Bellek")).toHaveClass("metric--crit");
  expect(screen.getByLabelText("Disk")).not.toHaveClass("metric--warn");
});

const fillWidth = (label: string) => (screen.getByLabelText(label).querySelector(".metric__fill") as HTMLElement | null)?.style.width;

test("CPU, memory and disk show a small usage bar sized to their percentage", () => {
  render(<MetricsBar metrics={base} />);
  expect(fillWidth("İşlemci")).toBe("12%");
  expect(fillWidth("Bellek")).toBe("19%");
  expect(fillWidth("Disk")).toBe("20%");
  expect(screen.getByLabelText("Yük").querySelector(".metric__fill")).toBeNull();
});

test("the usage bars are decorative and carry the severity class", () => {
  render(<MetricsBar metrics={{ ...base, cpuPercent: 95 }} />);
  const bar = screen.getByLabelText("İşlemci").querySelector(".metric__bar") as HTMLElement;
  expect(bar).toHaveAttribute("aria-hidden", "true");
  expect(screen.getByLabelText("İşlemci")).toHaveClass("metric--crit");
});

test("bars are empty when a value is unknown and never exceed 100 percent", () => {
  const { rerender } = render(<MetricsBar metrics={{ ...base, cpuPercent: null }} />);
  expect(fillWidth("İşlemci")).toBe("0%");
  rerender(<MetricsBar metrics={{ ...base, cpuPercent: 250 }} />);
  expect(fillWidth("İşlemci")).toBe("100%");
  rerender(<MetricsBar metrics={null} />);
  expect(fillWidth("Bellek")).toBe("0%");
});

test("network speeds show separate download and upload parts", () => {
  render(<MetricsBar metrics={base} />);
  const net = screen.getByLabelText("Ağ");
  expect(net.querySelector(".metric__down")).toHaveTextContent("↓ 1.2 MB/s");
  expect(net.querySelector(".metric__up")).toHaveTextContent("↑ 40 KB/s");
});

describe("hover details", () => {
  test("every metric explains itself in a tooltip", () => {
    render(<MetricsBar metrics={base} />);
    expect(screen.getByLabelText("İşlemci")).toHaveAttribute("title", "İşlemci kullanımı: %12");
    expect(screen.getByLabelText("Bellek")).toHaveAttribute("title", "Bellek: 3.0 GB / 16 GB (%19), boş 13 GB. Takas: 0 B / 2.0 GB");
    expect(screen.getByLabelText("Disk")).toHaveAttribute("title", "Disk: 40 GB / 200 GB (%20), boş 160 GB");
    expect(screen.getByLabelText("Yük")).toHaveAttribute("title", "Yük ortalaması. 1 dk: 0.42, 5 dk: 0.31, 15 dk: 0.25");
    expect(screen.getByLabelText("Açık kalma")).toHaveAttribute("title", "Açık kalma: 3 gün 4 saat 0 dk");
    expect(screen.getByLabelText("Ağ")).toHaveAttribute("title", "İndirme: 1.2 MB/s, yükleme: 40 KB/s");
  });

  test("a server without swap says so", () => {
    render(<MetricsBar metrics={{ ...base, swapTotal: 0 }} />);
    expect(screen.getByLabelText("Bellek").getAttribute("title")).toContain("Takas yok");
  });

  test("before the first sample the tooltips explain the dashes instead of showing numbers", () => {
    render(<MetricsBar metrics={{ ...base, cpuPercent: null, netRxBps: null, netTxBps: null }} />);
    expect(screen.getByLabelText("İşlemci")).toHaveAttribute("title", "İşlemci: ilk ölçüm bekleniyor");
    expect(screen.getByLabelText("Ağ")).toHaveAttribute("title", "Ağ: ilk ölçüm bekleniyor");
  });

  test("without metrics there is no tooltip to show", () => {
    render(<MetricsBar metrics={null} />);
    expect(screen.getByLabelText("İşlemci")).not.toHaveAttribute("title");
  });
});
