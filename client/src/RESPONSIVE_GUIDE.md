# LogiForce Responsive Design Guide

## Breakpoints

| Name    | Range          | Variable |
|---------|----------------|----------|
| Mobile  | 0 – 768px      | `MOBILE` |
| Tablet  | 769 – 1024px   | `TABLET` |
| Desktop | 1025px+        | —        |

## 1. Always use `useBreakpoint()` for conditional layouts

```jsx
import { useBreakpoint } from '../hooks/useBreakpoint';

const { isMobile, isTablet, isDesktop } = useBreakpoint();
```

Never use raw `window.innerWidth` or resize event listeners directly.

## 2. Grid breakpoint mapping

| Desktop (original)             | Tablet (769–1024px)  | Mobile (≤768px) |
|-------------------------------|----------------------|-----------------|
| `repeat(5,1fr)`              | `repeat(3,1fr)`      | `repeat(2,1fr)` |
| `repeat(4,1fr)`              | `repeat(2,1fr)`      | `repeat(2,1fr)` |
| `1fr 1fr 1fr`                | `1fr 1fr`            | `1fr`           |
| `1.6fr 1fr` / `2fr 1fr`     | `1fr`                | `1fr`           |
| `260px 1fr`                  | `1fr`                | `1fr`           |
| `1fr 1fr` (form 2-col)       | `1fr 1fr`            | `1fr`           |

Use the ternary pattern:
```jsx
gridTemplateColumns: isMobile ? '1fr' : isTablet ? '1fr 1fr' : '1fr 1fr 1fr'
```

## 3. No fixed pixel widths for layout containers

Use `%`, `fr`, `min()`, `max()`, `clamp()`, or CSS variables instead of hard-coded pixel widths for layout containers.

## 4. Tap targets must be minimum 44px on mobile

All clickable buttons, inputs, and interactive elements must have at least 44px height on mobile (Apple HIG / WCAG). The global CSS handles `button`, `input`, `select`, `textarea` automatically.

## 5. All tables must be wrapped in a scrollable container

```jsx
<div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
  <table style={{ minWidth: 600 }}>...</table>
</div>
```

`DataTable` already handles this. For custom tables, use the `.table-scroll` CSS class.

## 6. Modals go full-screen on mobile

`Modal.jsx` automatically uses `width: 100vw; height: 100vh` on mobile. No extra work needed.

## 7. SidePanels go full-width on mobile

`SidePanel.jsx` automatically uses `width: 100vw` on mobile. It also adds a visible close button.

## 8. Filter/action bars stack vertically on mobile

```jsx
<div style={{
  display: 'flex',
  flexDirection: isMobile ? 'column' : 'row',
  gap: 12,
}}>
  <input style={{ width: isMobile ? '100%' : 240 }} />
  <select style={{ width: isMobile ? '100%' : 160 }} />
</div>
```

## 9. Use CSS variables for consistent page padding

Use `var(--content-padding)` which automatically adjusts:
- Desktop: 24px
- Tablet: 16px
- Mobile: 12px

## 10. Test at minimum these widths

- **320px** — smallest mobile
- **768px** — mobile/tablet boundary
- **1440px** — standard desktop

Use browser DevTools responsive mode to verify layouts at each width.

## CSS Variables Reference

```css
--sidebar-w: 220px;         /* 0px on mobile via media query */
--sidebar-w-collapsed: 64px;
--topbar-h: 56px;           /* 52px on mobile via media query */
--content-padding: 24px;    /* 16px tablet, 12px mobile */
```

## Sidebar Behavior

- **Desktop**: Fixed left sidebar, always visible
- **Tablet/Mobile**: Hidden by default, opens as overlay drawer via hamburger menu
- Auto-closes when a nav link is clicked on mobile/tablet
