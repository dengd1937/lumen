/**
 * Lumen Design Tokens — TypeScript Runtime References
 *
 * Source: tokens.w3c.json (DTCG spec, SSOT)
 * Values are `var(--xxx)` references so that runtime theme switching (data-theme="light")
 * via tokens.css stays the single source of mutation.
 *
 * Typical consumer:
 *   import { color, space } from "@/designs/tokens";
 *   <div style={{ background: color.surface, padding: space[4] }} />
 */

export const color = {
  bg: "var(--bg)",
  surface: "var(--surface)",
  surfaceElevated: "var(--surface-elevated)",
  border: "var(--border)",
  borderSubtle: "var(--border-subtle)",
  fg: "var(--fg)",
  fgMuted: "var(--fg-muted)",
  fgSubtle: "var(--fg-subtle)",
  ring: "var(--ring)",

  primary: "var(--primary)",
  primaryFg: "var(--primary-fg)",
  primaryHover: "var(--primary-hover)",

  trackWebFg: "var(--track-web-fg)",
  trackWebBg: "var(--track-web-bg)",
  trackWebBorder: "var(--track-web-border)",
  trackWebMuted: "var(--track-web-muted)",

  trackKbFg: "var(--track-kb-fg)",
  trackKbBg: "var(--track-kb-bg)",
  trackKbBorder: "var(--track-kb-border)",
  trackKbMuted: "var(--track-kb-muted)",

  nodeStatePlanning: "var(--node-state-planning)",
  nodeStateRetrieving: "var(--node-state-retrieving)",
  nodeStateCompleted: "var(--node-state-completed)",
  nodeStateError: "var(--node-state-error)",

  conflictFg: "var(--conflict-fg)",
  conflictBg: "var(--conflict-bg)",
  conflictBorder: "var(--conflict-border)",

  citationBadge: "var(--citation-badge)",
  citationHighlight: "var(--citation-highlight)",

  shadowColor: "var(--color-shadow)",
} as const;

export const space = {
  0: "var(--space-0)",
  "0_5": "var(--space-0_5)",
  1: "var(--space-1)",
  "1_5": "var(--space-1_5)",
  2: "var(--space-2)",
  "2_5": "var(--space-2_5)",
  3: "var(--space-3)",
  "3_5": "var(--space-3_5)",
  4: "var(--space-4)",
  5: "var(--space-5)",
  6: "var(--space-6)",
  8: "var(--space-8)",
  10: "var(--space-10)",
  12: "var(--space-12)",
  16: "var(--space-16)",
  20: "var(--space-20)",
} as const;

export const radius = {
  xs: "var(--radius-xs)",
  sm: "var(--radius-sm)",
  md: "var(--radius-md)",
  lg: "var(--radius-lg)",
  xl: "var(--radius-xl)",
  full: "var(--radius-full)",
} as const;

export const fontSize = {
  xs: "var(--font-size-xs)",
  sm: "var(--font-size-sm)",
  base: "var(--font-size-base)",
  md: "var(--font-size-md)",
  lg: "var(--font-size-lg)",
  xl: "var(--font-size-xl)",
  "2xl": "var(--font-size-2xl)",
  "3xl": "var(--font-size-3xl)",
  "4xl": "var(--font-size-4xl)",
} as const;

export const lineHeight = {
  tight: "var(--line-height-tight)",
  normal: "var(--line-height-normal)",
  loose: "var(--line-height-loose)",
} as const;

export const fontFamily = {
  sans: "var(--font-sans)",
  mono: "var(--font-mono)",
} as const;

export const duration = {
  fast: "var(--duration-fast)",
  base: "var(--duration-base)",
  slow: "var(--duration-slow)",
} as const;

export const easing = {
  out: "var(--easing-out)",
  inOut: "var(--easing-in-out)",
} as const;

export const shadow = {
  sm: "var(--shadow-sm)",
  md: "var(--shadow-md)",
  lg: "var(--shadow-lg)",
} as const;

export const zIndex = {
  base: "var(--z-base)",
  drawer: "var(--z-drawer)",
  modal: "var(--z-modal)",
  tooltip: "var(--z-tooltip)",
} as const;

export const tokens = {
  color,
  space,
  radius,
  fontSize,
  lineHeight,
  fontFamily,
  duration,
  easing,
  shadow,
  zIndex,
} as const;

export type ColorToken = keyof typeof color;
export type SpaceToken = keyof typeof space;
export type RadiusToken = keyof typeof radius;
export type FontSizeToken = keyof typeof fontSize;
