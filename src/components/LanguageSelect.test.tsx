import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LanguageSelect } from "./LanguageSelect";

test("shows the setting and reports changes", async () => {
  const onChange = vi.fn();
  render(<LanguageSelect setting="system" onChange={onChange} />);
  const select = screen.getByLabelText("Dil") as HTMLSelectElement;
  expect(select.value).toBe("system");
  await userEvent.selectOptions(select, "en");
  expect(onChange).toHaveBeenCalledWith("en");
});

test("language names are written in their own language", () => {
  render(<LanguageSelect setting="tr" onChange={() => {}} />);
  expect(screen.getByRole("option", { name: "Türkçe" })).toBeInTheDocument();
  expect(screen.getByRole("option", { name: "English" })).toBeInTheDocument();
  expect(screen.getByRole("option", { name: "Sistem" })).toBeInTheDocument();
});
