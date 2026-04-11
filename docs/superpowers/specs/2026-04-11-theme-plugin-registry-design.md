# V5 Theme Plugin Registry Design Spec

## 1. Overview
The recent Global Sci-Fi UI update hardcoded a dark theme and CSS variables into the application root (`index.html`, `scifi-theme.css`). This creates a rigid experience and alienates users who prefer the legacy light mode.

To resolve this, we will elevate the concept of "Themes" to the V1 Plugin Architecture (`src/plugins/`). By creating a dedicated `ThemeRegistry`, users will be able to swap entirely different visual skins (e.g., Classic Light, Sci-Fi Dark) dynamically, and third-party developers can distribute `.js` theme plugins that completely reskin the application.

## 2. Core Architecture: Theme Registry

### 2.1 The Theme Extension Type
We will introduce a new plugin extension point in `src/plugins/types.ts`:

```typescript
export interface ThemeExtension {
  /** Unique identifier for the theme */
  id: string
  /** Human-readable name */
  name: string
  /** Description of the theme */
  description?: string
  /** The base Element Plus mode to activate */
  mode: 'light' | 'dark'
  /** CSS Variables to inject into the :root selector */
  cssVariables: Record<string, string>
  /** Optional custom CSS to inject into a <style> tag */
  globalCss?: string
  /** The primary accent color (used for previews/icons) */
  primaryColor?: string
}
```

### 2.2 The ThemeRegistry Class
Create `src/plugins/registries/theme-registry.ts` extending `BaseRegistry<ThemeExtension>`. This registry will hold all loaded themes.

## 3. Dynamic Rendering Engine

### 3.1 ThemeStore (`src/stores/theme.ts`)
A dedicated Pinia store to manage the currently active theme. It will:
- Read from `localStorage` to persist user preference across reloads.
- Expose the currently active `ThemeExtension` object.
- Provide a method `activateTheme(id: string)`.

### 3.2 App.vue Level Injector
At the root `App.vue` level, we will set up a watcher that reacts to the active theme changes:
1.  **Toggle `class="dark"`**: Depending on `theme.mode`, toggle the `.dark` class on the `<html>` element.
2.  **Inject CSS Variables**: Map `theme.cssVariables` to the `document.documentElement.style`.
3.  **Inject Global CSS**: Create or update a `<style id="plugin-theme-css">` block in `<head>` with `theme.globalCss`.

## 4. Built-in Theme Plugins

We will ship two built-in plugins inside `src/plugins/builtin/`:

### 4.1 Classic Light Theme (`classic-light-theme.ts`)
Restores the default, bright, clean look of Element Plus.
- `mode: 'light'`
- Reverts backgrounds to `#ffffff` and `#f5f7fa`.
- Disables glassmorphism (no `backdrop-filter`).

### 4.2 Sci-Fi Dark Theme (`scifi-dark-theme.ts`)
Extracts the hardcoded `scifi-theme.css` we created previously.
- `mode: 'dark'`
- Variables: `--bg-base`, `--bg-panel`, `--accent-glow`.
- Custom CSS: Injects the radial gradients and backdrop-filter overrides.

## 5. UI Integration
Update `ProjectConfig.vue` to include a "Theme Selection (主题切换)" dropdown. This dropdown will populate dynamically by iterating over `pluginManager.getRegistries().theme.getAll()`.

## 6. Self-Review
*   *Placeholders*: None.
*   *Internal consistency*: Integrating into `src/plugins/` matches the established architecture for Exporters and Providers.
*   *Scope check*: Perfectly scoped to theme management. Removes the hardcoded CSS and replaces it with a dynamic JavaScript-driven plugin layer.
*   *Ambiguity*: Explicitly defined how CSS strings vs CSS variables will be handled (inline styles vs head `<style>` tags).