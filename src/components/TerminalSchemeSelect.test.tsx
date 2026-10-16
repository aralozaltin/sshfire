import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TerminalSchemeSelect } from "./TerminalSchemeSelect";

test("lists the schemes and reports the choice", async () => {
  const onChange = vi.fn();
  render(<TerminalSchemeSelect scheme="default" onChange={onChange} />);
  const select = screen.getByLabelText("Terminal renkleri") as HTMLSelectElement;
  expect(select.value).toBe("default");
  expect(screen.getByRole("option", { name: "Dracula" })).toBeInTheDocument();
  await userEvent.selectOptions(select, "nord");
  expect(onChange).toHaveBeenCalledWith("nord");
});
