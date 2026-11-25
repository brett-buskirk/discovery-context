// Theme choice. The only thing this page stores in localStorage: the theme name. Never the API key, never
// conversation data. public/theme-init.js reads the same key before first paint.
import { el } from "./dom";

export const THEME_STORAGE_KEY = "discovery-context-v1-theme";

export const THEMES = [
  { id: "auto", label: "Auto (match system)" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "sepia", label: "Sepia" },
  { id: "contrast", label: "High contrast" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

const isTheme = (value: unknown): value is ThemeId => THEMES.some((t) => t.id === value);

export function currentTheme(root: HTMLElement = document.documentElement): ThemeId {
  const attr = root.getAttribute("data-theme");
  return isTheme(attr) ? attr : "auto";
}

export function applyTheme(theme: ThemeId, root: HTMLElement = document.documentElement): void {
  if (theme === "auto") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
  try {
    if (theme === "auto") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage blocked: the theme still applies for this visit.
  }
}

export function renderThemePicker(): HTMLElement {
  const select = el(
    "select",
    { id: "theme" },
    ...THEMES.map((t) => el("option", { value: t.id }, t.label)),
  );
  select.value = currentTheme();
  select.addEventListener("change", () => {
    if (isTheme(select.value)) applyTheme(select.value);
  });
  return el("div", { class: "theme-picker row" }, el("label", { for: "theme" }, "Theme"), select);
}
