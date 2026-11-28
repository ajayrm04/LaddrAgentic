# Laddr Dashboard — Design System

Every component/page must follow this spec. Do not invent new colors, radii, or button styles.

## 1. Color tokens (already defined in `tailwind.config.js`)

| Token | Value | Use |
|---|---|---|
| `bg-canvas` | `#121313` | Page background (set globally on `body`) |
| `bg-surface` | `#191A1A` | Sidebar, header, default card |
| `bg-surface-raised` | `#1F2121` | Cards needing lift, inputs |
| `bg-surface-overlay` | `#252727` | Hover states, chips, icon tiles |
| `border-line` | `#252727` | Default border (set on `*`) |
| `border-line-strong` | `#2E3030` | Hover/emphasized border |
| `text-ink` | `#E9EAEA` | Primary text |
| `text-ink-muted` | `#9CA1A1` | Secondary text |
| `text-ink-subtle` | `#707676` | Labels, captions |
| `text-ink-faint` | `#565B5B` | Disabled, hints |
| `text-primary-300/400` | `#35C9DA` / `#1FB8CD` | Accent (icons on dark) |
| `bg-primary-400` | `#1FB8CD` | Accent fills, progress |
| `bg-primary-500` | `#1FB8CD` | Primary button |

**Banned:** raw hex in JSX, `text-cyan-400`/`bg-cyan-600` (use `primary-*`), `gray-700/800`
borders (use `border-line`), blue accents, `#1f1f1f`/`#1a1a1a`/`#1F2121` literals
(use `surface-*`).

Status: `success`, `warning`, `danger`/`error`, `info` — each has `DEFAULT`, `subtle`,
`border`. Use `bg-success/10 text-success border-success/20` style tints.

## 2. Typography

- Font: Inter (global), fallback system.
- Page title: `.page-title` or `<PageHeader>` — `text-xl font-semibold`, tracking `-0.02em`.
- Section title: `.section-title` — `text-base font-semibold`.
- Card heading: `section-title` inside `<CardHeader>`.
- Label/caption: `.caption` — `text-xs uppercase tracking-wider text-ink-subtle`.
- Body: default `text-sm`. Numbers: add `tabular-nums`.
- **Never** `text-2xl`/`text-3xl` for titles (except stat values, which use `text-3xl font-semibold`).

## 3. Spacing & layout

- Page = `<PageHeader>` + `space-y-6` sections. **Do not add a page-level
  `<div className="p-6 bg-[#191A1A]">` wrapper** — `Layout` already provides
  `px-4 py-6 sm:px-6 lg:px-8` and a `max-w-[1600px]` container.
- Card padding: `p-5` (default), compact `p-4`.
- Grid gaps: `gap-4` (cards/stats), `gap-6` (large sections).
- Vertical rhythm between sections: `space-y-6`.

## 4. Radius & shadow

- Cards/inputs/buttons: `rounded-lg` (8px) via component classes.
- Chips/inline: `rounded-md`. Badges/avatars: `rounded-full`.
- Shadows: `shadow-card` default, `shadow-card-hover` on hover, `shadow-pop` for
  floating layers (modals, popovers). Never heavy shadows.

## 5. Components (use these — do not hand-roll)

From `src/components/ui` (`index.tsx`):

```tsx
import { Card, CardHeader, CardBody, StatCard, Badge, PageHeader,
         Skeleton, CardSkeleton, EmptyState } from '../components/ui';
```

| Need | Use |
|---|---|
| Page heading | `<PageHeader title description actions />` |
| Generic card | `<Card>` / `<CardHeader title subtitle action icon />` + `<CardBody>` |
| KPI tile | `<StatCard label value hint icon tone loading />` |
| Status pill | `<Badge tone="neutral\|primary\|success\|warning\|danger\|info" dot>` |
| Loading | `<Skeleton className="h-4 w-40" />`, `<Skeleton lines={3} />`, `<CardSkeleton rows={4} />` |
| No data | `<EmptyState icon title description action />` |

Global CSS classes (in `src/index.css`): `.input`, `.btn-primary`, `.btn-secondary`,
`.btn-ghost`, `.btn-danger`, `.surface`, `.surface-raised`, `.badge`, `.data-table`,
`.page-title`, `.section-title`, `.caption`, `.skeleton`.

## 6. Tables

```tsx
<div className="surface overflow-hidden">
  <div className="overflow-x-auto">        {/* REQUIRED — tables must scroll on narrow viewports */}
    <table className="data-table min-w-[640px]">
      <thead><tr><th>Col</th><th className="text-right">Num</th></tr></thead>
      <tbody><tr>…</tr></tbody>
    </table>
  </div>
</div>
```

`.data-table` supplies cell padding, header styling, hover rows and dividers.
Add `min-w-[Npx]` so columns don't crush. Align numeric columns `text-right tabular-nums`.
Clickable rows: `cursor-pointer` + `tabIndex={0}` + Enter/Space handler +
`focus-visible:ring-2 focus-visible:ring-primary-400/50`.

## 7. Buttons

`.btn-primary` (accent, one per view max), `.btn-secondary`, `.btn-ghost`,
`.btn-danger`. Height is 9px-based (`h-9` default; `h-8` for compact toolbars).
Icon-only buttons **must** have `aria-label`. Focus is handled globally via
`:focus-visible` — do not add `focus:outline-none`.

## 8. Forms

Use `.input` on text inputs, selects and textareas. Wrap in a `<label>` or provide
`aria-label`. Field layout: `label` (`block text-xs font-medium text-ink-muted mb-1.5`)
+ `.input`. Error text: `text-xs text-danger mt-1.5`.

## 9. States — every async view needs all four

1. **Loading** → skeletons (never bare "Loading…" text).
2. **Error** → consistent banner:
   ```tsx
   <div className="flex items-start gap-3 rounded-lg border border-danger-border bg-danger-subtle px-4 py-3 text-sm text-danger">
     <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
     <div className="flex-1">{message}</div>
     {onRetry && <button className="btn-ghost h-7 px-2" onClick={onRetry}>Retry</button>}
   </div>
   ```
   **One style only** — replace `border-red-800 bg-red-950/40` and `red-500/10 border-red-500/30` variants.
2. **Empty** → `<EmptyState />`.
3. **Success** → normal content.

## 10. Destructive confirms

Replace every `window.confirm()` with an inline confirm UI or a shared modal.
Minimum viable: a `<Card>`-style dialog `fixed inset-0 z-50 flex items-center
justify-center bg-black/70 backdrop-blur-sm` with `role="dialog" aria-modal="true"`,
Escape-to-close, title/description/cancel/confirm. Never use `window.confirm`.

## 11. Modals (general)

```tsx
<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
     role="dialog" aria-modal="true" aria-labelledby="modal-title"
     onKeyDown={(e) => e.key === 'Escape' && onClose()}>
  <div className="w-full max-w-lg surface shadow-pop animate-fade-up max-h-[90vh] overflow-y-auto">
    …header (title + X button) / body (p-5) / footer (border-t p-4 flex justify-end gap-2)…
  </div>
</div>
```
Lock body scroll while open. Trap focus at minimum by focusing the panel on mount.

## 12. Responsive rules

- **Every table** gets `overflow-x-auto` + `min-w-[…]`.
- Page headers: `flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`.
- Action clusters: `flex flex-wrap items-center gap-2`.
- Stat grids: `grid-cols-1 sm:grid-cols-2 xl:grid-cols-4`.
- Sidebar/list+detail splits: single column below `lg`, detail as full-width or
  bottom sheet. Fixed widths like `w-1/4`, `w-[38%]`, `h-[600px]` must be made
  responsive (`w-full sm:w-72`, `lg:w-[38%]`, `h-[60vh] lg:h-[70vh]`).
- Never rely on a single breakpoint.

## 13. Icons & imagery

- `lucide-react` only. **No emoji as UI icons.** Stroke `1.75` for decorative, default
  for meaningful. Size: 16px inline, 18px nav, 20px section, 24-48px empty states.

## 14. Motion

Available: `animate-fade-in`, `animate-fade-up`, `animate-fade-in-slide`,
`animate-slide-in-right`, `transition-colors duration-150`, `ease-out-expo`.
Entrance only — no infinite motion except status pulses/spinners/skeletons.
`prefers-reduced-motion` is handled globally; don't override it.

## 15. Accessibility

- Interactive elements must be `<button>`/`<a>`; never clickable `<div>` without
  `role`, `tabIndex`, keyboard handler.
- Icon-only controls: `aria-label` + `title`.
- Tables: `role` semantics preserved; add `<caption className="sr-only">` when helpful.
- Contrast: text on dark must be ≥ `text-ink-subtle`; never `text-gray-600` on cards.
