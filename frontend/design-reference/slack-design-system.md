# Slack Design System Reference

Extracted from Slack web app (app.slack.com) on 2026-02-27.

## Color Palette

### Sidebar (Aubergine Theme)
- Background: `#611f69` (primary purple/aubergine)
- Darker variant: `#4A154B` (official Slack purple)
- Hover state: `#350d36` or `rgba(255,255,255,0.1)` overlay
- Active channel background: `rgb(249, 237, 255)` / `#F9EDFF`
- Text primary: `rgba(249, 237, 255, 0.8)` - translucent white/pink
- Text active: `#1D1C1D` (dark text on light active bg)

### Nav Rail (Left Icon Bar)
- Width: `70px`
- Background: Same as sidebar
- Icon inactive: `rgba(255,255,255,0.7)`
- Icon active: `#FFFFFF`

### Message Area
- Background: `#FFFFFF`
- Hover background: `#F8F8F8`
- Border color: `#E0E0E0`

### Text Colors
- Primary text: `rgb(29, 28, 29)` / `#1D1C1D`
- Secondary text: `rgb(97, 96, 97)` / `#616061`
- Link text: `#1264A3` (blue)
- Mention highlight: `#F8F3B9` (yellow background)
- @channel/@here: `#1264A3` (blue text)

### Reactions
- Background: `rgba(29, 28, 29, 0.04)`
- Border: `1px solid rgba(29, 28, 29, 0.13)`
- Hover background: `rgba(29, 28, 29, 0.08)`
- Active (user reacted): `#E8F5FA` bg with `#1264A3` border

### Composer
- Border: `1px solid rgb(29, 28, 29)` / `#1D1C1D`
- Border radius: `8px`
- Focus border: `#1264A3` (blue)
- Background: `#FFFFFF`
- Placeholder: `#616061`

### Buttons
- Primary: `#007A5A` (green) or `#611f69` (purple)
- Primary hover: darker variant
- Secondary: `transparent` with border
- Disabled: `#DDDDDD`

## Typography

### Font Family
```css
font-family: Slack-Lato, Slack-Fractions, appleLogo, sans-serif;
/* Fallback: */
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
```

### Font Sizes
- Channel name: `15px`
- Message text: `15px`
- Username: `15px` (font-weight: 900)
- Timestamp: `12px`
- Section headers: `13px` (uppercase, font-weight: 700)
- Search placeholder: `14px`

### Line Heights
- Message text: `1.46668` (22px for 15px font)
- Channel list: `28px` item height

## Spacing

### Sidebar
- Width: `260px` (default, resizable)
- Nav rail width: `70px`
- Channel item padding: `0 16px`
- Channel item height: `28px`
- Section gap: `12px`

### Messages
- Message padding: `8px 20px`
- Avatar size: `36px` (large) / `20px` (small/reply)
- Avatar border-radius: `4px` (slightly rounded, not circular)
- Avatar-to-content gap: `8px`
- Message gap (same user): `4px`
- Message gap (different user): `16px`

### Composer
- Padding: `12px 16px`
- Toolbar height: `40px`
- Input min-height: `22px`

## Component Dimensions

### Header
- Height: `49px`
- Channel name font-size: `18px`
- Channel name font-weight: `900`

### Reactions
- Height: `24px`
- Border-radius: `12px` (pill shape)
- Padding: `0 8px`
- Emoji size: `16px`
- Count font-size: `12px`

### Avatar Sizes
- Message avatar: `36px`
- Reply avatar: `20px`
- Workspace icon: `32px`
- Nav icon: `36px`

## Shadows

### Composer
```css
box-shadow: 0 1px 3px rgba(0,0,0,0.08);
```

### Hover Menu (message actions)
```css
box-shadow: 0 0 0 1px rgba(29,28,29,0.13), 0 4px 12px rgba(0,0,0,0.12);
```

### Modal
```css
box-shadow: 0 18px 48px rgba(0,0,0,0.35);
```

## Transitions

- Hover transitions: `150ms ease`
- Modal fade: `200ms ease-out`
- Sidebar collapse: `200ms ease-in-out`

## Z-Index Layers

- Sidebar: `100`
- Header: `200`
- Composer: `300`
- Modal overlay: `1000`
- Modal content: `1001`
- Tooltip: `1100`

## Responsive Breakpoints

- Desktop minimum: `1024px`
- Sidebar collapses: `< 768px` (mobile)
- Full mobile view: `< 480px`
