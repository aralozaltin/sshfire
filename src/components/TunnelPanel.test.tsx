import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TunnelPanel } from "./TunnelPanel";
import type { RunningTunnel, TunnelSpec } from "../types";

const local: TunnelSpec = { kind: "local", listen_port: 8080, dest_host: "db.internal", dest_port: 5432 };
const socks: TunnelSpec = { kind: "dynamic", listen_port: 1080 };

function setup(over: Partial<React.ComponentProps<typeof TunnelPanel>> = {}) {
  const props = {
    tunnels: [local, socks],
    running: [] as RunningTunnel[],
    connected: true,
    hasSession: true,
    onStart: vi.fn(),
    onStop: vi.fn(),
    onChange: vi.fn(),
    ...over,
  };
  render(<TunnelPanel {...props} />);
  return props;
}

test("lists saved tunnels with a readable description", () => {
  setup();
  expect(screen.getByText("127.0.0.1:8080 → db.internal:5432")).toBeInTheDocument();
  expect(screen.getByText("SOCKS5 127.0.0.1:1080")).toBeInTheDocument();
  expect(screen.getAllByText("durdu")).toHaveLength(2);
});

test("start calls onStart with the spec, stop appears for running tunnels with their connection count", async () => {
  const props = setup({ running: [{ id: "r1", spec: socks, localPort: 1080, connections: 3 }] });
  await userEvent.click(within(screen.getByText("127.0.0.1:8080 → db.internal:5432").closest("li")!).getByRole("button", { name: "Başlat" }));
  expect(props.onStart).toHaveBeenCalledWith(local);
  const row = screen.getByText("SOCKS5 127.0.0.1:1080").closest("li")!;
  expect(within(row).getByText("çalışıyor · 3 bağlantı")).toBeInTheDocument();
  await userEvent.click(within(row).getByRole("button", { name: "Durdur" }));
  expect(props.onStop).toHaveBeenCalledWith("r1");
});

test("without a connection tunnels cannot be started and a hint is shown", () => {
  setup({ connected: false });
  expect(screen.getByText("Tünelleri başlatmak için bir sunucuya bağlan.")).toBeInTheDocument();
  for (const b of screen.getAllByRole("button", { name: "Başlat" })) expect(b).toBeDisabled();
});

test("without any session the add form is replaced by an explanation", () => {
  setup({ hasSession: false, tunnels: [], connected: false });
  expect(screen.getByText("Tünel tanımlamak için önce bir sunucuya bağlan.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Ekle" })).not.toBeInTheDocument();
});

test("deleting a tunnel reports the remaining list and stops it if it was running", async () => {
  const props = setup({ running: [{ id: "r1", spec: local, localPort: 8080, connections: 0 }] });
  const row = screen.getByText("127.0.0.1:8080 → db.internal:5432").closest("li")!;
  await userEvent.click(within(row).getByRole("button", { name: "Sil" }));
  expect(props.onStop).toHaveBeenCalledWith("r1");
  expect(props.onChange).toHaveBeenCalledWith([socks]);
});

test("adding a local tunnel validates the fields and reports the new list", async () => {
  const props = setup({ tunnels: [] });
  await userEvent.click(screen.getByRole("button", { name: "Ekle" }));
  expect(screen.getByText("Yerel port 1-65535 arasında olmalı")).toBeInTheDocument();
  expect(props.onChange).not.toHaveBeenCalled();
  await userEvent.type(screen.getByLabelText("Yerel port"), "5433");
  await userEvent.click(screen.getByRole("button", { name: "Ekle" }));
  expect(screen.getByText("Hedef adres boş olamaz")).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText("Hedef adres"), "10.0.0.9");
  await userEvent.type(screen.getByLabelText("Hedef port"), "5432");
  await userEvent.click(screen.getByRole("button", { name: "Ekle" }));
  expect(props.onChange).toHaveBeenCalledWith([{ kind: "local", listen_port: 5433, dest_host: "10.0.0.9", dest_port: 5432 }]);
});

test("a SOCKS tunnel only needs a local port", async () => {
  const props = setup({ tunnels: [] });
  await userEvent.selectOptions(screen.getByLabelText("Tür"), "dynamic");
  expect(screen.queryByLabelText("Hedef adres")).not.toBeInTheDocument();
  await userEvent.type(screen.getByLabelText("Yerel port"), "1081");
  await userEvent.click(screen.getByRole("button", { name: "Ekle" }));
  expect(props.onChange).toHaveBeenCalledWith([{ kind: "dynamic", listen_port: 1081 }]);
});

test("a remote tunnel is described from the server's point of view and can be added", async () => {
  const remote: TunnelSpec = { kind: "remote", listen_port: 9000, dest_host: "localhost", dest_port: 3000 };
  const props = setup({ tunnels: [remote] });
  expect(screen.getByText("sunucu:9000 → localhost:3000")).toBeInTheDocument();
  await userEvent.selectOptions(screen.getByLabelText("Tür"), "remote");
  expect(screen.getByLabelText("Sunucu portu")).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText("Sunucu portu"), "9100");
  await userEvent.type(screen.getByLabelText("Hedef adres"), "127.0.0.1");
  await userEvent.type(screen.getByLabelText("Hedef port"), "8000");
  await userEvent.click(screen.getByRole("button", { name: "Ekle" }));
  expect(props.onChange).toHaveBeenCalledWith([remote, { kind: "remote", listen_port: 9100, dest_host: "127.0.0.1", dest_port: 8000 }]);
});
