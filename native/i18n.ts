// Localization: the engine's string tables (assets/strings.json: English source
// strings as the keys, the nine StarHermit locales) in the interface language
// the runtime reports (the player's choice in Options › Language, else the
// account's preferred language or the device's). The runtime's Options replaced
// the game's own Language setting (sh-language.js) and the DOM re-labelling of
// the old ui.js: every string is drawn through T() each frame, so a change shows
// on the next frame without touching the round. The puzzle words stay English
// dictionary content in every language. The account lines are the engine's
// `starhermit.*` keys.
import { strings } from "starhermit:engine";
import * as ui from "starhermit:ui";

strings.load("assets/strings.json");
strings.defaultLocale = "en-US";
ui.setLanguage(strings.locale);
strings.onChange((locale) => ui.setLanguage(locale));

export type Vars = Record<string, string | number>;
/** An English source string in the player's language; `{name}` placeholders from vars. Text with no entry passes through. */
export function T(key: string, vars?: Vars | null): string {
  if (key == null) return "";
  const k = String(key);
  if (strings.has(k)) return strings.t(k, vars ?? undefined);
  return vars ? k.replace(/\{(\w+)\}/g, (m, n: string) => (vars[n] != null ? String(vars[n]) : m)) : k;
}
/** Marks an English key that is translated with T() where it is shown. */
export const N = (s: string): string => s;
/** An account or leaderboard line: the engine's `starhermit.*` strings. */
export function account(key: string, vars?: Vars): string { return strings.t(`starhermit.${key}`, vars); }
