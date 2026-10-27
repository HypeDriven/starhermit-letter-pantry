// Localization: the browser build's tables (i18n.js + locales/, English
// source strings as the keys; sh-strings.js for the StarHermit account
// lines) in the nine StarHermit locales, in the interface language the
// runtime reports (preferences().language: the player's choice in Options ›
// Language, else the account's preferred language or the device's). The
// runtime's Options replaced the game's own Language setting (sh-language.js)
// and the DOM re-labelling of the old ui.js: every string is drawn through
// T() each frame, so a change shows on the next frame without touching the
// round. The puzzle words stay English dictionary content in every language.
import { onPreferencesChange, preferences } from "starhermit:engine";
import * as ui from "starhermit:ui";
import * as I18n from "../i18n.js";
import { SH_STRINGS } from "../sh-strings.js";

export interface AccountStrings {
  signIn: string; invite: string; copied: string; copyFailed: string; signedOut: string; playingAs: string;
  lbPosting: string; lbRank: string; lbPosted: string; lbNotPosted: string;
}
const I = I18n as unknown as {
  LOCALES: string[];
  T(key: string, vars?: Record<string, unknown> | null): string;
  setLocale(tag: string): string;
  pickLocale(tag: string): string;
};
const SH = SH_STRINGS as unknown as Record<string, AccountStrings>;

export const LOCALES = I.LOCALES;
export type Vars = Record<string, string | number>;
/** An English source string in the player's language; `{name}` placeholders from vars. */
export function T(key: string, vars?: Vars | null): string { return I.T(key, vars ?? null); }
/** Marks an English key that is translated with T() where it is shown. */
export const N = (s: string): string => s;
let locale = "en-US";
/** The account strings (sign-in, invite, toasts, leaderboard line) in the game language. */
export function account(): AccountStrings { return SH[locale] ?? SH["en-US"]!; }
export function currentLocale(): string { return locale; }

function apply(tag: string): void {
  locale = I.setLocale(I.pickLocale(tag));
  ui.setLanguage(locale);
}
apply(preferences().language);
onPreferencesChange((p) => { if (I.pickLocale(p.language) !== locale) apply(p.language); });
