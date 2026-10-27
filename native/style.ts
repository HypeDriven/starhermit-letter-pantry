// The look of the menus, HUD and dialogs: the browser build's style.css,
// rewritten class-based in tools/ui-style.css and converted once with
// `starhermit css` into assets/ui-style.json (`npm run css`), registered at
// start with the theme the runtime's own widgets (checkboxes, selects,
// dialogs, scroll bars) take, in the recipe-card serif. The browser build's
// body.lp-high-contrast and body.lp-cvd-palette palettes are token sets
// here, applied while the runtime's high-contrast option or the game's
// colour-vision-safe palette is on.
import { files } from "starhermit:engine";
import * as ui from "starhermit:ui";

type Tokens = Record<string, string | number>;
let base: Tokens = {};
/** style.css body.lp-high-contrast: black panels, white text, a gold accent, cyan focus (photographic backdrops off). */
const HIGH_CONTRAST: Tokens = {
  bg: "#000000", panel: "#000000f2", text: "#ffffff", dim: "#ffffff", accent: "#ffd700", focus: "#00ffff",
  btn: "#000000", "btn-hover": "#1a1a1a", card: "#000000", slot: "#1a1a1a", biscuit: "#ffffff", "biscuit-ink": "#000000", "biscuit-edge": "#ffd700",
};
/** style.css body.lp-cvd-palette: the accent moves to blue, found slots to a deep teal, danger to orange. */
const CVD: Tokens = { accent: "#4dd2ff", danger: "#ff9f1c", found: "#1c6a8a" };

export function initStyles(): void {
  const css = files.readJson("assets/ui-style.json") as unknown as ui.CssStyles;
  base = { ...(css.tokens as Tokens) };
  ui.setFont({ family: "serif" });
  ui.setTheme({
    fontSize: 16, smallSize: 13.6, headingSize: 24, padding: 8, spacing: 8, radius: 10,
    text: "#f5e9d5", muted: "#f5e9d5bf", panel: "#261a10", control: "#4a3520", hovered: "#5a4228",
    pressed: "#3a2a18", field: "#1c130b", accent: "#ffc978", focus: "#ffe2b0", outline: "#8a5f36",
  });
  ui.setTokens(css.tokens);
  ui.setAnimations(css.animations);
  ui.setStyles({
    ...css.styles,
    label: { text: { color: "$text" } },
    paragraph: { text: { color: "$text" } },
    heading: { text: { color: "$text" } },
    widget: { focusRing: { color: "$focus", width: 3, offset: 2 } },
    checkbox: {
      text: { color: "$text" }, minHeight: 44,
      parts: { box: { background: "#1c130b", border: { width: 2, color: "$accent-dark" }, radius: 4 }, mark: { background: "$accent" } },
    },
    textField: { background: "#1c130bcc", border: { width: 2, color: "$accent-dark" }, radius: 10, text: { color: "$text" }, minHeight: 40 },
    dialog: {
      background: "$panel", radius: 14, padding: 24, border: { width: 2, color: "$accent-dark" },
      parts: { backdrop: { background: "#00000099" } },
    },
    scrollArea: { parts: { bar: { background: "$accent-dark", radius: 4 } } },
    tooltip: { background: "$panel", text: { color: "$text" }, radius: 6, padding: 6 },
  });
}

let key = "";
/** The high-contrast and colour-vision-safe tokens over the sheet's while those options are on. */
export function applyPalette(highContrast: boolean, cvd: boolean): void {
  const k = `${highContrast}:${cvd}`;
  if (k === key) return;
  key = k;
  ui.setTokens({ ...base, ...(cvd ? CVD : {}), ...(highContrast ? HIGH_CONTRAST : {}) });
}
