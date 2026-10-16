import { render, screen } from "@testing-library/react";
import App from "./App";

test("renders the servers navigation", () => {
  render(<App />);
  expect(screen.getByRole("navigation", { name: "Sunucular" })).toBeInTheDocument();
});
