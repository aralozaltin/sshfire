import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IdleSelect } from "./IdleSelect";

test("offers never and the idle times, and reports the choice", async () => {
  const onChange = vi.fn();
  render(<IdleSelect minutes={0} onChange={onChange} />);
  const select = screen.getByLabelText("Boşta kalınca bağlantıyı kes") as HTMLSelectElement;
  expect(select.value).toBe("0");
  expect(screen.getByRole("option", { name: "Hiçbir zaman" })).toBeInTheDocument();
  await userEvent.selectOptions(select, "30");
  expect(onChange).toHaveBeenCalledWith(30);
  expect(screen.getByRole("option", { name: "2 saat" })).toBeInTheDocument();
});
