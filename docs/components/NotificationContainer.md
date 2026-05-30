# NotificationContainer

Fixed-position toast notification container that renders notifications from the global `useNotificationsStore`. Supports six screen positions, animated transitions, a "dismiss all" button, and an overflow indicator.

**Source**: `src/components/NotificationContainer.vue`

## Props

This component does not accept external props. All configuration comes from the `useNotificationsStore`.

## Emits

None.

## Slots

None.

## Position

Position is determined by `store.position` from the notification store. Supported values:

| Position Value | Location |
|----------------|----------|
| `top-right` | Top-right corner (default) |
| `top-left` | Top-left corner |
| `bottom-right` | Bottom-right corner |
| `bottom-left` | Bottom-left corner |
| `top-center` | Top-center |

Bottom positions use `flex-direction: column-reverse` so new notifications appear at the bottom.

## Transitions

The transition name is selected automatically based on position:

| Position Family | Transition | Enter/Leave Direction |
|----------------|------------|----------------------|
| `*-left` | `notif-slide-left` | Slide from/to left (translateX -100%) |
| `*-right` | `notif-slide-right` | Slide from/to right (translateX +100%) |
| `*-center` / other | `notif-slide-down` | Slide from/to top (translateY -20px) |

## Features

- **Dismiss All**: Appears when more than one notification is visible.
- **Overflow Indicator**: Shows "There are N more notifications" when `store.hasOverflow` is true.
- **Teleport**: The entire container is teleported to `<body>` to avoid z-index stacking issues.
- **Accessibility**: Uses `role="region"` and `aria-label="Notification area"`.

## Usage

Place once in the application root (e.g., `App.vue`):

```vue
<template>
  <div id="app">
    <router-view />
    <NotificationContainer />
  </div>
</template>

<script setup lang="ts">
import NotificationContainer from '@/components/NotificationContainer.vue'
</script>
```

### Triggering Notifications from Code

```ts
import { useNotificationsStore } from '@/stores/notifications'

const notifications = useNotificationsStore()

notifications.push({
  type: 'success',
  title: 'Save Complete',
  message: 'Chapter saved successfully.',
  duration: 3000,
})
```

## Related Store API

The component delegates all logic to `useNotificationsStore`. Key store members used:

| Member | Type | Description |
|--------|------|-------------|
| `visibleNotifications` | `ComputedRef<NotificationItem[]>` | Currently displayed notifications. |
| `hasOverflow` | `ComputedRef<boolean>` | Whether more notifications exist than can be displayed. |
| `overflowCount` | `ComputedRef<number>` | Number of hidden overflow notifications. |
| `position` | `ComputedRef<NotificationPosition>` | Current display position. |
| `dismiss(id)` | `(id: string) => void` | Dismiss a single notification. |
| `dismissAll()` | `() => void` | Dismiss all visible notifications. |

## Notes

- The component uses `Teleport to="body"` to ensure proper z-index layering.
- The z-index is set to `var(--ds-z-modal, 2000)`.
- Pointer events are `none` on the container and `auto` on child elements, so the overlay does not block interaction with the page beneath.
