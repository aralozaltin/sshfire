import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Sidebar } from "./Sidebar";

test("switches between the servers and files panels", async () => {
  const onChange = vi.fn();
  const { rerender } = render(<Sidebar active="servers" onChange={onChange} servers={<p>liste</p>} files={<p>dosyalar</p>} />);
  expect(screen.getByText("liste")).toBeVisible();
  expect(screen.queryByText("dosyalar")).not.toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Sunucular" })).toHaveAttribute("aria-selected", "true");
  await userEvent.click(screen.getByRole("tab", { name: "Dosyalar" }));
  expect(onChange).toHaveBeenCalledWith("files");
  rerender(<Sidebar active="files" onChange={onChange} servers={<p>liste</p>} files={<p>dosyalar</p>} />);
  expect(screen.getByText("dosyalar")).toBeVisible();
  expect(screen.queryByText("liste")).not.toBeInTheDocument();
});
