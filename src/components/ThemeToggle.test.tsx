import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeToggle } from "./ThemeToggle";

test("shows the current mode and reports changes", async () => {
  const onChange = vi.fn();
  render(<ThemeToggle mode="system" onChange={onChange} />);
  const select = screen.getByLabelText("Tema") as HTMLSelectElement;
  expect(select.value).toBe("system");
  await userEvent.selectOptions(select, "dark");
  expect(onChange).toHaveBeenCalledWith("dark");
});

test("offers system, light and dark in Turkish", () => {
  render(<ThemeToggle mode="light" onChange={() => {}} />);
  expect(screen.getByRole("option", { name: "Sistem" })).toBeInTheDocument();
  expect(screen.getByRole("option", { name: "Açık" })).toBeInTheDocument();
  expect(screen.getByRole("option", { name: "Koyu" })).toBeInTheDocument();
});
