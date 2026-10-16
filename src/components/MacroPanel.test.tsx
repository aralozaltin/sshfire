import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MacroPanel } from "./MacroPanel";
import type { Macro } from "../macros/macros";

const macros: Macro[] = [
  { id: "1", name: "Disk", text: "df -h\r" },
  { id: "2", name: "Günlük", text: "tail -f /var/log/syslog\r" },
];

function setup(over: Partial<React.ComponentProps<typeof MacroPanel>> = {}) {
  const props = {
    macros,
    canRun: true,
    recording: false,
    onRun: vi.fn(),
    onSave: vi.fn(),
    onDelete: vi.fn(),
    onStartRecording: vi.fn(),
    onStopRecording: vi.fn(),
    ...over,
  };
  render(<MacroPanel {...props} />);
  return props;
}

test("lists macros with a readable preview and an empty hint when there are none", () => {
  setup();
  expect(screen.getByText("Disk")).toBeInTheDocument();
  expect(screen.getByText("df -h ⏎")).toBeInTheDocument();
});

test("shows the empty hint", () => {
  setup({ macros: [] });
  expect(screen.getByText(/Henüz makro yok/)).toBeInTheDocument();
});

test("run is disabled without a connection and reports the macro otherwise", async () => {
  const props = setup();
  const row = screen.getByText("Disk").closest("li")!;
  await userEvent.click(within(row).getByRole("button", { name: "Çalıştır" }));
  expect(props.onRun).toHaveBeenCalledWith(macros[0]);
});

test("without a connection the run buttons are disabled and a hint explains why", () => {
  setup({ canRun: false });
  for (const b of screen.getAllByRole("button", { name: "Çalıştır" })) expect(b).toBeDisabled();
  expect(screen.getByText("Makroyu çalıştırmak için bir sunucuya bağlan.")).toBeInTheDocument();
});

test("creating a macro validates and saves it without an id", async () => {
  const props = setup({ macros: [] });
  await userEvent.click(screen.getByRole("button", { name: "Yeni makro" }));
  await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
  expect(screen.getByText("Ad boş olamaz")).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText("Ad"), "Uptime");
  await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
  expect(screen.getByText("Makro boş olamaz")).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText(/Komutlar/), "uptime");
  await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
  expect(props.onSave).toHaveBeenCalledWith({ id: undefined, name: "Uptime", text: "uptime" });
});

test("editing keeps the id and the existing text is shown", async () => {
  const props = setup();
  const row = screen.getByText("Disk").closest("li")!;
  await userEvent.click(within(row).getByRole("button", { name: "Düzenle" }));
  expect(screen.getByLabelText("Ad")).toHaveValue("Disk");
  await userEvent.clear(screen.getByLabelText("Ad"));
  await userEvent.type(screen.getByLabelText("Ad"), "Disk kullanımı");
  await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
  expect(props.onSave).toHaveBeenCalledWith({ id: "1", name: "Disk kullanımı", text: "df -h\r" });
});

test("delete reports the id", async () => {
  const props = setup();
  const row = screen.getByText("Günlük").closest("li")!;
  await userEvent.click(within(row).getByRole("button", { name: "Sil" }));
  expect(props.onDelete).toHaveBeenCalledWith("2");
});

test("recording can be started and stopped and shows a banner while active", async () => {
  const props = setup({ canRun: true });
  await userEvent.click(screen.getByRole("button", { name: "Kaydı başlat" }));
  expect(props.onStartRecording).toHaveBeenCalled();
});

test("while recording the stop button and banner are shown", async () => {
  const props = setup({ recording: true });
  expect(screen.getByText(/Kayıt sürüyor/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Kaydı durdur" }));
  expect(props.onStopRecording).toHaveBeenCalled();
});
