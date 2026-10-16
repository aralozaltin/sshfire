import "@testing-library/jest-dom/vitest";

beforeEach(() => {
  Object.defineProperty(window.navigator, "language", { value: "tr-TR", configurable: true });
});

afterEach(() => {
  try {
    localStorage.clear();
  } catch {
    // Depolama bu testte bilerek bozulmuş olabilir.
  }
  delete document.documentElement.dataset.theme;
});
