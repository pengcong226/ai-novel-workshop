# AI小说工坊 - UI设计维度优化方案

> 制定人：UI设计师
> 制定时间：2026-05-28
> 依据文档：ui-design-review-report.md

---

## P0 - 立即修复（设计系统断裂）

### P0-1：SandboxLayout.vue 设计系统完整接入

**文件路径**：`src/components/Sandbox/SandboxLayout.vue`

**优化目标**：消除该组件中所有硬编码的白色背景和Element Plus默认边框色，使其完全接入Design Token体系，确保暗色/亮色主题下视觉一致。

**当前问题**：
```css
/* 当前代码（第82-84行）——完全脱离设计系统 */
.sidebar { width: 250px; background: #fff; padding: 16px; border: 1px solid #e4e7ed; border-radius: 4px; }
.main-view { flex: 1; background: #fff; padding: 16px; border: 1px solid #e4e7ed; border-radius: 4px; }
.right-sidebar { width: 300px; background: #fff; padding: 16px; border: 1px solid #e4e7ed; border-radius: 4px; }
```
暗色主题下这三栏呈现纯白色刺眼背景，与整体暗色风格完全断裂。

**改后方案**：
```css
/* 替换后的样式 —— 完全接入 Design Token */
.sandbox-layout {
  display: flex;
  height: 100%;
  gap: var(--ds-space-4);
}

.sidebar {
  width: 250px;
  background: var(--ds-surface);
  padding: var(--ds-space-4);
  border: 1px solid var(--ds-surface-border);
  border-radius: var(--ds-radius-md);
}

.main-view {
  flex: 1;
  background: var(--ds-surface);
  padding: var(--ds-space-4);
  border: 1px solid var(--ds-surface-border);
  border-radius: var(--ds-radius-md);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.right-sidebar {
  width: 300px;
  background: var(--ds-surface);
  padding: var(--ds-space-4);
  border: 1px solid var(--ds-surface-border);
  border-radius: var(--ds-radius-md);
}
```

**改动涉及的具体行**：
| 行号 | 改前 | 改后 | 说明 |
|------|------|------|------|
| 82 | `background: #fff; padding: 16px; border: 1px solid #e4e7ed; border-radius: 4px;` | `background: var(--ds-surface); padding: var(--ds-space-4); border: 1px solid var(--ds-surface-border); border-radius: var(--ds-radius-md);` | sidebar接入Token |
| 83 | 同上 | 同上 | main-view接入Token |
| 84 | 同上 | 同上 | right-sidebar接入Token |
| 81 | `gap: 16px;` | `gap: var(--ds-space-4);` | 间距Token化 |

**预期效果**：暗色主题下三栏使用深色表面色（#16161f），边框使用0.06透明度白色，与整体暗色风格融合一致；亮色主题下使用白色表面色，边框使用0.08透明度黑色。

---

### P0-2：GlassContextPanel.vue 暗色主题适配

**文件路径**：`src/components/GlassContextPanel.vue`

**优化目标**：将该组件中独立定义的 `.glass-card` 样式替换为设计系统提供的 `.glass-panel` 变量体系，解决暗色主题下不协调问题。

**当前问题**：
```css
/* 当前代码（第147-158行）——独立玻璃态，不接入设计系统 */
.glass-card {
  background: rgba(255, 255, 255, 0.6);   /* 暗色主题下突兀的白色 */
  backdrop-filter: blur(10px);             /* 与系统 blur(16px) 不一致 */
  border: 1px solid rgba(255, 255, 255, 0.4); /* 过度不透明 */
  border-radius: 8px;                      /* 未使用 --ds-radius-md */
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05); /* 未使用 --ds-shadow */
}
```

**改后方案**：
```css
/* 替换为设计系统变量 */
.glass-card {
  background: var(--ds-glass-bg);
  backdrop-filter: var(--ds-glass-blur);
  border: 1px solid var(--ds-glass-border);
  border-radius: var(--ds-radius-md);
  box-shadow: var(--ds-shadow-sm);
  transition: transform var(--ds-transition-fast), box-shadow var(--ds-transition-fast);
  padding: var(--ds-space-3);
}

.glass-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--ds-shadow-md);
}
```

**涉及行号与具体替换**：

| 行号 | 改前 | 改后 |
|------|------|------|
| 148 | `background: rgba(255, 255, 255, 0.6);` | `background: var(--ds-glass-bg);` |
| 149 | `backdrop-filter: blur(10px);` | `backdrop-filter: var(--ds-glass-blur);` |
| 150 | `border: 1px solid rgba(255, 255, 255, 0.4);` | `border: 1px solid var(--ds-glass-border);` |
| 151 | `border-radius: 8px;` | `border-radius: var(--ds-radius-md);` |
| 152 | `box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);` | `box-shadow: var(--ds-shadow-sm);` |
| 156 | `box-shadow: 0 6px 16px rgba(0, 0, 0, 0.1);` | `box-shadow: var(--ds-shadow-md);` |
| 165 | `color: #606266;` | `color: var(--ds-text-secondary);` |
| 170 | `color: #606266;` | `color: var(--ds-text-secondary);` |
| 191 | `background: rgba(255, 255, 255, 0.7);` | `background: var(--ds-glass-bg);` |
| 203 | `color: #606266;` | `color: var(--ds-text-secondary);` |

**预期效果**：暗色主题下呈现半透明深色毛玻璃效果（rgba(22,22,31,0.75) + blur(16px)），与侧边栏和通知组件的玻璃态风格完全统一。

---

## P1 - 高优先级（主题体系与规范补全）

### P1-1：亮色主题 Token 补全

**文件路径**：`src/assets/styles/design-system.css`

**优化目标**：补全亮色主题下缺失的语义色 Token，确保亮色模式下功能色、强调色的视觉表现正确。

**当前问题**：亮色主题（`html.light`，第103-126行）仅覆盖了背景/文本/阴影/玻璃态变量，以下在暗色主题定义但亮色主题未重定义的 Token 会继承暗色值，导致亮色模式下颜色过深或对比度异常：
- `--ds-accent` / `--ds-accent-hover` / `--ds-accent-text`：紫色系在亮色下需要微调以保证白色背景上的对比度
- `--ds-success` / `--ds-warning` / `--ds-danger` / `--ds-info`：功能色在亮色背景上需要更柔和的表现
- `--ds-surface` / `--ds-surface-hover`：亮色下需要与暗色不同的表面色

**改后方案**：在 `html.light {}` 块（第103-126行）中补充以下变量：

```css
html.light {
  color-scheme: light;
  /* ... 已有变量保持不变 ... */

  /* 补全：表面色 */
  --ds-surface: #ffffff;
  --ds-surface-hover: #f5f5f7;

  /* 补全：强调色（亮色微调） */
  --ds-accent: #5b4bd6;           /* 比暗色的 #6c5ce7 更深，保证白色背景对比度 */
  --ds-accent-hover: #6c5ce7;
  --ds-accent-text: #5b4bd6;      /* 文字色需要更深以保证可读性 */

  /* 补全：功能语义色 */
  --ds-success: #059669;          /* 比暗色的 #10b981 更深，白色背景下可读 */
  --ds-warning: #d97706;          /* 比暗色的 #f59e0b 更深 */
  --ds-danger: #dc2626;           /* 比暗色的 #ef4444 更深 */
  --ds-info: #2563eb;             /* 比暗色的 #3b82f6 更深 */

  /* 补全：发光阴影（亮色下减弱） */
  --ds-shadow-glow: 0 0 20px rgba(108, 92, 231, 0.1);
}
```

**改后预期效果**：亮色模式下所有功能色在白色背景上达到 WCAG AA 级对比度（≥4.5:1），强调色不会因过亮而丢失可读性。

---

### P1-2：Z-index 层级统一管理

**文件路径**：`src/assets/styles/design-system.css`（新增Token），以及以下组件文件

**优化目标**：建立统一的 Z-index 层级 Token，消除分散在各组件中的硬编码 z-index 值。

**当前问题散点分布**：

| 文件 | 行号 | 当前值 | 用途 |
|------|------|--------|------|
| `src/App.vue` | 166 | `z-index: 10000` | 离线横幅 |
| `src/components/GlobalTaskObserver.vue` | 90 | `z-index: 9999` | 全局任务观察器 |
| `src/components/AIAssistant.vue` | 565 | `z-index: 9999` | AI助手浮动按钮 |
| `src/views/ProjectEditor.vue` | 736 | `z-index: 999` | 沉浸模式退出按钮 |
| `src/components/editor/EditorBubbleMenu.vue` | 89 | `z-index: 100` | 编辑器气泡菜单 |
| `src/components/editor/FindReplacePanel.vue` | 201 | `z-index: 50` | 查找替换面板 |
| `src/components/Sandbox/SandboxMap.vue` | 217 | `z-index: 5` | 地图控件 |
| `src/components/Sandbox/SandboxMap.vue` | 251 | `z-index: 10` | 地图标注 |

**改后方案**：在 `design-system.css` 的 `:root` 块中新增 Z-index 层级 Token：

```css
/* 新增 Z-index 层级 Token（添加在 :root, html.dark 块内） */
--z-base: 1;              /* 基础层级 */
--z-dropdown: 50;         /* 下拉菜单、地图控件 */
--z-float: 100;           /* 浮动元素（气泡菜单、查找面板） */
--z-overlay: 900;         /* 覆盖层（沉浸模式按钮） */
--z-modal: 1000;          /* 模态层（对话框由Element Plus管理） */
--z-toast: 9990;          /* Toast通知 */
--z-float-button: 9991;   /* 浮动按钮（AI助手） */
--z-banner: 10000;        /* 全局横幅（离线提示） */
```

**各文件改动**：

| 文件 | 改前 | 改后 |
|------|------|------|
| `src/App.vue` L166 | `z-index: 10000` | `z-index: var(--z-banner)` |
| `src/components/GlobalTaskObserver.vue` L90 | `z-index: 9999` | `z-index: var(--z-toast)` |
| `src/components/AIAssistant.vue` L565 | `z-index: 9999` | `z-index: var(--z-float-button)` |
| `src/views/ProjectEditor.vue` L736 | `z-index: 999` | `z-index: var(--z-overlay)` |
| `src/components/editor/EditorBubbleMenu.vue` L89 | `z-index: 100` | `z-index: var(--z-float)` |
| `src/components/editor/FindReplacePanel.vue` L201 | `z-index: 50` | `z-index: var(--z-float)` |
| `src/components/Sandbox/SandboxMap.vue` L217 | `z-index: 5` | `z-index: var(--z-dropdown)` |
| `src/components/Sandbox/SandboxMap.vue` L251 | `z-index: 10` | `z-index: var(--z-dropdown)` |

**预期效果**：层级关系一目了然，新增组件时可直接引用Token，不再凭感觉猜测z-index值。未来如需调整某一层级，只需修改Token定义即可全局生效。

---

### P1-3：断点（Breakpoint）Token 统一

**文件路径**：`src/assets/styles/design-system.css`（新增Token），以及以下组件文件

**优化目标**：将分散在各组件中的媒体查询断点统一为 Design Token，便于维护和扩展。

**当前断点散点分布**：

| 文件 | 行号 | 断点值 | 用途 |
|------|------|--------|------|
| `src/views/ProjectList.vue` | 833 | `max-width: 768px` | 项目列表移动端 |
| `src/views/ProjectEditor.vue` | 763 | `max-width: 900px` | 编辑器移动端 |
| `src/components/Chapters.vue` | 969 | `max-width: 768px` | 章节管理移动端 |
| `src/components/WritingDashboard.vue` | 328 | `max-width: 768px` | 仪表盘移动端 |
| `src/components/OnboardingDialog.vue` | 171 | `max-width: 768px` | 引导弹窗移动端 |
| `src/components/ChapterEditorDialog.vue` | 1226 | `max-width: 1024px` | 编辑器对话框平板 |

**改后方案**：在 `design-system.css` 的 `:root` 块中新增断点 Token 和对应的实用 mixin 注释：

```css
/* 新增断点 Token（添加在 :root, html.dark 块内） */
--bp-sm: 640px;     /* 小屏手机 */
--bp-md: 768px;     /* 平板竖屏 */
--bp-lg: 900px;     /* 平板横屏 / 小桌面 */
--bp-xl: 1024px;    /* 桌面 */
--bp-2xl: 1280px;   /* 大桌面 */
```

由于 CSS 原生不支持在 `@media` 中使用 CSS 变量，建议以下两种实施方案（二选一）：

**方案A（推荐）：创建 SCSS mixin 文件** `src/assets/styles/_breakpoints.scss`：

```scss
$bp-sm: 640px;
$bp-md: 768px;
$bp-lg: 900px;
$bp-xl: 1024px;
$bp-2xl: 1280px;

@mixin respond-to($breakpoint) {
  @media (max-width: $breakpoint) {
    @content;
  }
}
```

**方案B：创建 JS/TS 断点常量** `src/utils/breakpoints.ts`：

```typescript
export const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 900,
  xl: 1024,
  xxl: 1280,
} as const
```

**各文件改动映射**：

| 文件 | 改前 | 改后（方案A） |
|------|------|------|
| `src/views/ProjectList.vue` L833 | `@media (max-width: 768px)` | `@include respond-to($bp-md)` |
| `src/views/ProjectEditor.vue` L763 | `@media (max-width: 900px)` | `@include respond-to($bp-lg)` |
| `src/components/Chapters.vue` L969 | `@media (max-width: 768px)` | `@include respond-to($bp-md)` |
| `src/components/WritingDashboard.vue` L328 | `@media (max-width: 768px)` | `@include respond-to($bp-md)` |
| `src/components/OnboardingDialog.vue` L171 | `@media (max-width: 768px)` | `@include respond-to($bp-md)` |
| `src/components/ChapterEditorDialog.vue` L1226 | `@media (max-width: 1024px)` | `@include respond-to($bp-xl)` |

> 注：当前项目使用的是纯 CSS（Vue SFC 中的 `<style scoped>`），如不想引入 SCSS，可使用方案B的TS常量配合JS媒体查询，或者直接在CSS注释中标注统一断点值。考虑到改动最小化，建议**使用方案B + CSS注释标注统一规范**，各组件CSS中保留 `@media (max-width: 768px)` 但在上方添加注释 `/* breakpoint: md */` 以标识归属。

---

## P2 - 中优先级（一致性与适配补全）

### P2-1：硬编码颜色全面消除

**优化目标**：将所有组件中硬编码的 Element Plus 默认颜色值（#606266/#909399/#303133/#e4e7ed/#ebeef5/#f5f7fa/#67c23a/#f56c6c/#e6a23c/#409eff 等）替换为 Design Token。

**涉及文件与替换映射（共13个文件，约45处）**：

#### 2-1a：文字颜色替换

| 文件 | 行号 | 改前 | 改后 |
|------|------|------|------|
| `src/components/Chapters.vue` | 246 | `color: #909399` | `color: var(--ds-text-tertiary)` |
| `src/components/Chapters.vue` | 252 | `color: #909399` | `color: var(--ds-text-tertiary)` |
| `src/components/Chapters.vue` | 324 | `color: #909399` | `color: var(--ds-text-tertiary)` |
| `src/components/GlassContextPanel.vue` | 165,170,203 | `color: #606266` | `color: var(--ds-text-secondary)` |
| `src/components/ProjectConfig.vue` | 575 | `color: #606266` | `color: var(--ds-text-secondary)` |
| `src/components/ProjectConfig.vue` | 579 | `color: #909399` | `color: var(--ds-text-tertiary)` |
| `src/components/ProjectConfig.vue` | 1343,1349 | `color: #909399` | `color: var(--ds-text-tertiary)` |
| `src/components/ProjectConfig.vue` | 1369 | `color: #606266` | `color: var(--ds-text-secondary)` |
| `src/components/novel-import/ChapterPreview.vue` | 400,416 | `color: #909399` | `color: var(--ds-text-tertiary)` |
| `src/components/novel-import/ChapterPreview.vue` | 409 | `color: #606266` | `color: var(--ds-text-secondary)` |
| `src/components/novel-import/AnalysisProgress.vue` | 277 | `color: #606266` | `color: var(--ds-text-secondary)` |
| `src/components/novel-import/AnalysisProgress.vue` | 325,358 | `color: #303133` | `color: var(--ds-text-primary)` |
| `src/components/novel-import/AnalysisProgress.vue` | 331,351 | `color: #909399` | `color: var(--ds-text-tertiary)` |
| `src/components/KnowledgeBasePanel.vue` | 466,470 | `color: #606266` | `color: var(--ds-text-secondary)` |
| `src/components/NovelImportDialog.vue` | 196,202,1381,1410 | `color: #909399` | `color: var(--ds-text-tertiary)` |
| `src/components/NovelImportDialog.vue` | 1394 | `color: #606266` | `color: var(--ds-text-secondary)` |
| `src/components/assistant/AssistantSuggestionsPanel.vue` | 204 | `color: #606266` | `color: var(--ds-text-secondary)` |
| `src/components/assistant/AssistantSuggestionsPanel.vue` | 223 | `color: #909399` | `color: var(--ds-text-tertiary)` |
| `src/components/assistant/AssistantStatisticsPanel.vue` | 114 | `color: #606266` | `color: var(--ds-text-secondary)` |
| `src/components/assistant/AssistantStatisticsPanel.vue` | 120 | `color: #909399` | `color: var(--ds-text-tertiary)` |
| `src/components/CharacterDevelopment.vue` | 688 | `color: #303133` | `color: var(--ds-text-primary)` |
| `src/components/CharacterDevelopment.vue` | 728,785,814,830,835,862 | `color: #909399` | `color: var(--ds-text-tertiary)` |
| `src/components/CharacterDevelopment.vue` | 792 | `color: #606266` | `color: var(--ds-text-secondary)` |
| `src/components/DeveloperPanel.vue` | 304 | `color: #606266` | `color: var(--ds-text-secondary)` |
| `src/components/OnboardingDialog.vue` | 148 | `color: #606266` | `color: var(--ds-text-secondary)` |
| `src/components/Sandbox/deep-import/DeepImportConfig.vue` | 220,270 | `color: #909399` | `color: var(--ds-text-tertiary)` |
| `src/components/Sandbox/deep-import/ExtractionProgressBar.vue` | 78 | `color: #909399` | `color: var(--ds-text-tertiary)` |
| `src/components/GlobalTaskObserver.vue` | 158 | `color: #303133` | `color: var(--ds-text-primary)` |
| `src/components/GlobalTaskObserver.vue` | 195 | `color: #303133` | `color: var(--ds-text-primary)` |
| `src/components/GlobalTaskObserver.vue` | 198,202 | `color: #909399` | `color: var(--ds-text-tertiary)` |
| `src/components/GlobalTaskObserver.vue` | 206 | `color: #606266` | `color: var(--ds-text-secondary)` |

#### 2-1b：背景色替换

| 文件 | 行号 | 改前 | 改后 |
|------|------|------|------|
| `src/components/KnowledgeBasePanel.vue` | 440 | `background: white` | `background: var(--ds-surface)` |
| `src/components/KnowledgeBasePanel.vue` | 480 | `background: #f5f7fa` | `background: var(--ds-bg-tertiary)` |
| `src/components/TemplateLibrary.vue` | 738 | `background: white` | `background: var(--ds-surface)` |
| `src/components/TemplateLibrary.vue` | 849 | `background: #f5f7fa` | `background: var(--ds-bg-tertiary)` |
| `src/components/WorldbookImportDialog.vue` | 488 | `background: #f5f7fa` | `background: var(--ds-bg-tertiary)` |
| `src/components/GlobalTaskObserver.vue` | 113 | `background: white` | `background: var(--ds-surface)` |
| `src/components/GlobalTaskObserver.vue` | 140 | `background: white` | `background: var(--ds-surface)` |
| `src/components/GlobalTaskObserver.vue` | 151 | `background: #f8f9fa` | `background: var(--ds-bg-secondary)` |
| `src/components/GlobalTaskObserver.vue` | 174 | `background: #fff` | `background: var(--ds-surface)` |
| `src/components/GlobalTaskObserver.vue` | 219 | `background: #fcfcfc` | `background: var(--ds-bg-tertiary)` |
| `src/components/ConflictReport.vue` | 717,799 | `background: #f5f7fa` | `background: var(--ds-bg-tertiary)` |
| `src/components/SummaryManager.vue` | 517 | `background: #f5f7fa` | `background: var(--ds-bg-tertiary)` |
| `src/components/PluginManager.vue` | 632,681 | `background: #f5f7fa` | `background: var(--ds-bg-tertiary)` |
| `src/components/DeveloperPanel.vue` | 270 | `background: #f5f7fa` | `background: var(--ds-bg-tertiary)` |
| `src/components/DeveloperPanel.vue` | 292 | `background: #fff` | `background: var(--ds-surface)` |
| `src/components/ProjectConfig.vue` | 1362 | `background-color: #f5f7fa` | `background-color: var(--ds-bg-tertiary)` |
| `src/components/Sandbox/deep-import/ExtractionProgressBar.vue` | 51 | `background: #fafafa` | `background: var(--ds-bg-secondary)` |

#### 2-1c：边框色替换

| 文件 | 行号 | 改前 | 改后 |
|------|------|------|------|
| `src/components/Sandbox/deep-import/ExtractionProgressBar.vue` | 48 | `border: 1px solid #e4e7ed` | `border: 1px solid var(--ds-surface-border)` |
| `src/components/Sandbox/deep-import/DeepImportProgress.vue` | 282 | `border: 1px solid #e4e7ed` | `border: 1px solid var(--ds-surface-border)` |
| `src/components/Sandbox/deep-import/DeepImportConfig.vue` | 243 | `border: 1px solid #e4e7ed` | `border: 1px solid var(--ds-surface-border)` |
| `src/components/GlobalTaskObserver.vue` | 146 | `border: 1px solid #ebeef5` | `border: 1px solid var(--ds-surface-border)` |
| `src/components/GlobalTaskObserver.vue` | 220 | `border-top: 1px solid #ebeef5` | `border-top: 1px solid var(--ds-surface-border)` |
| `src/components/OnboardingDialog.vue` | 138 | `border: 1px solid #ebeef5` | `border: 1px solid var(--ds-surface-border)` |
| `src/components/DeveloperPanel.vue` | 263,289 | `border: 1px solid #ebeef5` | `border: 1px solid var(--ds-surface-border)` |

#### 2-1d：功能状态色替换

需要在设计系统中新增状态色 Token（用于Element Plus默认色的替代）：

```css
/* 在 :root 中新增 */
--ds-el-success: #67c23a;
--ds-el-warning: #e6a23c;
--ds-el-danger: #f56c6c;
--ds-el-info: #909399;
--ds-el-primary: #409eff;
```

| 文件 | 行号 | 改前 | 改后 |
|------|------|------|------|
| `src/components/GlobalTaskObserver.vue` | 121 | `border-left: 4px solid #67c23a` | `border-left: 4px solid var(--ds-success)` |
| `src/components/GlobalTaskObserver.vue` | 122 | `border-left: 4px solid #909399` | `border-left: 4px solid var(--ds-text-tertiary)` |
| `src/components/GlobalTaskObserver.vue` | 123 | `border-left: 4px solid #e6a23c` | `border-left: 4px solid var(--ds-warning)` |
| `src/components/GlobalTaskObserver.vue` | 124 | `border-left: 4px solid #f56c6c` | `border-left: 4px solid var(--ds-danger)` |
| `src/components/GlobalTaskObserver.vue` | 127 | `color: #67c23a` | `color: var(--ds-success)` |
| `src/components/GlobalTaskObserver.vue` | 128 | `color: #909399` | `color: var(--ds-text-tertiary)` |
| `src/components/GlobalTaskObserver.vue` | 129 | `color: #e6a23c` | `color: var(--ds-warning)` |
| `src/components/GlobalTaskObserver.vue` | 130 | `color: #f56c6c` | `color: var(--ds-danger)` |
| `src/components/GlobalTaskObserver.vue` | 196 | `color: #f56c6c` | `color: var(--ds-danger)` |
| `src/components/GlobalTaskObserver.vue` | 197 | `color: #67c23a` | `color: var(--ds-success)` |
| `src/components/Sandbox/deep-import/ExtractionProgressBar.vue` | 90 | `color: #67c23a` | `color: var(--ds-success)` |
| `src/components/Sandbox/deep-import/ExtractionProgressBar.vue` | 96 | `color: #f56c6c` | `color: var(--ds-danger)` |
| `src/components/Sandbox/deep-import/DeepImportConfig.vue` | 251 | `border-color: #409eff` | `border-color: var(--ds-info)` |
| `src/components/Sandbox/deep-import/DeepImportConfig.vue` | 255 | `background: #fdf6ec` | `background: color-mix(in srgb, var(--ds-warning) 10%, var(--ds-surface))` |
| `src/components/Sandbox/deep-import/DeepImportConfig.vue` | 256 | `border-color: #e6a23c` | `border-color: var(--ds-warning)` |
| `src/components/Sandbox/deep-import/DeepImportConfig.vue` | 260 | `background: #ecf5ff` | `background: color-mix(in srgb, var(--ds-info) 10%, var(--ds-surface))` |
| `src/components/Sandbox/deep-import/DeepImportConfig.vue` | 261 | `border-color: #409eff` | `border-color: var(--ds-info)` |
| `src/components/OnboardingDialog.vue` | 144 | `color: #409eff` | `color: var(--ds-info)` |

**预期效果**：全部组件在暗色/亮色主题下呈现一致的色彩表现，不再出现暗色主题下的白色刺眼文字或亮色主题下的过浅文字。

---

### P2-2：响应式布局补充

**优化目标**：为当前缺少响应式适配的 3 个关键组件补充移动端布局。

#### 2-2a：SandboxLayout.vue 响应式

**文件路径**：`src/components/Sandbox/SandboxLayout.vue`

**当前问题**：三栏固定宽度（250px + flex + 300px），无任何媒体查询，小屏下溢出。

**改后方案**：在 `<style scoped>` 末尾添加：

```css
@media (max-width: 1024px) {
  .sandbox-layout {
    flex-direction: column;
  }
  .sidebar {
    width: 100%;
    max-height: 200px;
    overflow-y: auto;
  }
  .right-sidebar {
    width: 100%;
  }
}

@media (max-width: 768px) {
  .main-view {
    padding: var(--ds-space-3);
  }
}
```

#### 2-2b：ProjectConfig.vue 响应式

**文件路径**：`src/components/ProjectConfig.vue`

**当前问题**：`max-width: 1000px` + `label-width: 150px`，小屏下标签挤压输入区。

**改后方案**：在 `<style scoped>` 末尾添加：

```css
@media (max-width: 768px) {
  .project-config {
    padding: 0 var(--ds-space-3);
  }

  :deep(.el-form) {
    --el-form-label-width: 100px;
  }

  :deep(.el-form-item__label) {
    float: none;
    display: block;
    text-align: left;
    margin-bottom: var(--ds-space-1);
  }

  :deep(.el-form-item__content) {
    margin-left: 0 !important;
  }

  .header {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--ds-space-3);
  }
}
```

#### 2-2c：GlassContextPanel.vue 响应式

**文件路径**：`src/components/GlassContextPanel.vue`

**改后方案**：在 `<style scoped>` 末尾添加：

```css
@media (max-width: 768px) {
  .context-cards-container {
    gap: var(--ds-space-2);
  }

  .context-card {
    padding: var(--ds-space-2);
  }

  .audit-timeline {
    padding: var(--ds-space-2);
  }
}
```

**预期效果**：三个组件在平板和手机上能正常显示，不再出现横向溢出或内容挤压。

---

### P2-3：工具函数抽取与复用

**优化目标**：将重复定义在 10+ 个组件中的格式化工具函数抽取到统一的工具模块中。

**当前现状**：已有 `src/utils/formatDate.ts`（提供 formatDate/formatDateTime/formatShortDateTime），但仍有大量组件自行重复定义。以下函数在多个文件中重复：

| 函数名 | 重复次数 | 分布文件 |
|--------|---------|----------|
| `formatNumber` | 6次 | ProjectEditor.vue, ProjectList.vue, Chapters.vue, ChapterPreview.vue, AnalysisProgress.vue, WritingDashboard.vue |
| `formatDate` | 6次 | ProjectList.vue, Chapters.vue, QualityReport.vue, ProviderManager.vue, WritingDashboard.vue（+已有formatDate.ts） |
| `getStatusType` | 4次 | ProjectList.vue, Chapters.vue, WritingDashboard.vue, ConflictReport.vue |
| `getStatusText` | 5次 | ProjectList.vue, Chapters.vue, WritingDashboard.vue, SandboxTimeline.vue, GlobalTaskObserver.vue, ConflictReport.vue |
| `formatRelativeTime` | 1次 | ProjectList.vue |

**改后方案**：

**Step 1**：扩展 `src/utils/formatDate.ts` 为 `src/utils/formatters.ts`：

```typescript
// src/utils/formatters.ts
// ============ 数字格式化 ============

/** 将数字格式化为万字显示 */
export function formatNumber(num?: number | null): string {
  if (num === undefined || num === null || !Number.isFinite(num)) return '0'
  if (num >= 10000) return `${(num / 10000).toFixed(1)}万`
  return num.toString()
}

// ============ 日期格式化 ============

export function formatDate(ts: number | Date): string {
  const d = ts instanceof Date ? ts : new Date(ts)
  if (Number.isNaN(d.getTime())) return '未记录'
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function formatDateTime(ts: number | Date): string {
  const d = ts instanceof Date ? ts : new Date(ts)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function formatShortDateTime(ts: number | Date): string {
  const d = ts instanceof Date ? ts : new Date(ts)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function formatRelativeTime(date: Date | string): string {
  const timestamp = new Date(date).getTime()
  const diffDays = Math.floor((Date.now() - timestamp) / 86400000)
  if (diffDays <= 0) return '今天更新'
  if (diffDays === 1) return '昨天更新'
  if (diffDays < 30) return `${diffDays} 天前`
  return formatDate(date)
}

export function formatTime(d: Date): string {
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`
}

// ============ 状态格式化 ============

type StatusType = 'info' | 'warning' | 'success' | 'danger' | ''

/** 章节状态 → Element Plus Tag 类型 */
export function getChapterStatusType(status: string): StatusType {
  const types: Record<string, StatusType> = {
    draft: 'info',
    writing: 'warning',
    revised: 'warning',
    final: 'success',
    completed: 'success',
  }
  return types[status] || 'info'
}

/** 章节状态 → 中文标签 */
export function getChapterStatusText(status: string): string {
  const texts: Record<string, string> = {
    draft: '草稿',
    writing: '写作中',
    revised: '已修订',
    final: '定稿',
    completed: '已完成',
  }
  return texts[status] || status
}

/** 任务状态 → 中文标签 */
export function getTaskStatusText(status: string): string {
  const labels: Record<string, string> = {
    pending: '等待中',
    running: '进行中',
    success: '完成',
    error: '失败',
    cancelled: '已取消',
  }
  return labels[status] || status
}
```

**Step 2**：各组件删除本地定义，改为 import：

```typescript
// 各组件中替换为：
import { formatNumber, formatDate, getChapterStatusType, getChapterStatusText } from '@/utils/formatters'
```

**涉及组件列表（共10个文件）**：
1. `src/views/ProjectList.vue` — 删除 formatNumber, formatDate, formatRelativeTime, getStatusType, getStatusText
2. `src/views/ProjectEditor.vue` — 删除 formatNumber
3. `src/components/Chapters.vue` — 删除 getStatusType, getStatusText, formatDate
4. `src/components/WritingDashboard.vue` — 删除 formatNumber, formatDate, getStatusText, getStatusType
5. `src/components/novel-import/ChapterPreview.vue` — 删除 formatNumber
6. `src/components/novel-import/AnalysisProgress.vue` — 删除 formatNumber
7. `src/components/QualityReport.vue` — 删除 formatDate
8. `src/components/config/ProviderManager.vue` — 删除 formatDate
9. `src/components/GlobalTaskObserver.vue` — 删除 getStatusText
10. `src/components/ConflictReport.vue` — 删除 getStatusType, getStatusText
11. `src/components/Sandbox/SandboxTimeline.vue` — 删除 getStatusText

**预期效果**：消除约31处重复函数定义，统一行为（例如formatNumber在不同组件中对null/undefined的处理略有差异），后续维护只需改一处。

---

## P3 - 低优先级（体验打磨）

### P3-1：章节操作按钮优化

**文件路径**：`src/components/Chapters.vue`

**优化目标**：将6+个操作按钮按优先级分组，主要操作直接展示，次要操作收入下拉菜单，减少视觉噪音。

**当前问题**（第111-149行）：每张章节卡片下方排列了 预览/编辑/导出/重新生成/检查点/删除 共6个按钮+插件按钮，在视觉上过于拥挤。

**改后方案**：将按钮分为「主操作」和「更多操作」两组：

```html
<div class="chapter-actions">
  <!-- 主操作：直接展示 -->
  <el-button type="primary" size="small" @click="editChapter(chapter)">
    编辑
  </el-button>
  <el-button size="small" @click="previewChapter(chapter)">
    预览
  </el-button>

  <!-- 次要操作：收入更多菜单 -->
  <el-dropdown size="small" @command="(cmd: string) => handleChapterAction(cmd, chapter)">
    <el-button size="small">
      更多 <el-icon class="el-icon--right"><ArrowDown /></el-icon>
    </el-button>
    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item command="export">
          <el-icon><Download /></el-icon>导出
        </el-dropdown-item>
        <el-dropdown-item command="regenerate">
          <el-icon><RefreshRight /></el-icon>重新生成
        </el-dropdown-item>
        <el-dropdown-item command="checkpoints">
          <el-icon><Clock /></el-icon>检查点
        </el-dropdown-item>
        <!-- 插件按钮 -->
        <el-dropdown-item
          v-for="button in pluginToolbarButtons"
          :key="button.id"
          :command="'plugin:' + button.id"
        >
          <el-icon v-if="button.icon"><component :is="button.icon" /></el-icon>
          {{ button.label }}
        </el-dropdown-item>
        <el-dropdown-item divided command="delete" class="danger-item">
          <el-icon><Delete /></el-icon>删除
        </el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</div>
```

```typescript
// 新增路由函数
function handleChapterAction(cmd: string, chapter: Chapter) {
  switch (cmd) {
    case 'export': /* 触发导出菜单 */ break
    case 'regenerate': regenerateChapter() break
    case 'checkpoints': viewCheckpoints(chapter) break
    case 'delete': confirmDeleteChapter(chapter) break
    default:
      if (cmd.startsWith('plugin:')) {
        const buttonId = cmd.replace('plugin:', '')
        const button = pluginToolbarButtons.value.find(b => b.id === buttonId)
        if (button) handlePluginToolbarClick(chapter, button.handler)
      }
  }
}
```

**预期效果**：每张章节卡片的操作区域从6+按钮缩减为2个主按钮+1个下拉菜单，视觉更清爽，操作更有层级。

---

### P3-2：ECharts 图表主题适配

**文件路径**：`src/components/AIAssistant.vue`

**优化目标**：让 ECharts 图表根据当前主题（暗色/亮色）动态调整配色方案。

**当前问题**（第474-557行）：`initTypeChart`、`initPriorityChart`、`initTrendChart` 使用硬编码颜色（如 `#f56c6c`、`#e6a23c`、`#409eff`、`#67c23a`），在亮色主题下对比度可能不足。

**改后方案**：

```typescript
import { useThemeStore } from '@/stores/theme'

// 在 setup 中获取主题
const themeStore = useThemeStore()
const isDark = computed(() => themeStore.activeThemeId.includes('dark'))

// 图表主题色配置
const chartColors = computed(() => ({
  text: isDark.value ? '#ececf1' : '#1a1a2e',
  secondaryText: isDark.value ? '#8e8ea0' : '#6b7280',
  border: isDark.value ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)',
  success: isDark.value ? '#10b981' : '#059669',
  warning: isDark.value ? '#f59e0b' : '#d97706',
  danger: isDark.value ? '#ef4444' : '#dc2626',
  info: isDark.value ? '#3b82f6' : '#2563eb',
  accent: isDark.value ? '#6c5ce7' : '#5b4bd6',
}))

// 在 initPriorityChart 中使用：
priorityChart.setOption({
  // ... 其他配置不变
  series: [{
    // ...
    data: [
      { value: statistics.value.byPriority.high, name: '高', itemStyle: { color: chartColors.value.danger } },
      { value: statistics.value.byPriority.medium, name: '中', itemStyle: { color: chartColors.value.warning } },
      { value: statistics.value.byPriority.low, name: '低', itemStyle: { color: chartColors.value.info } }
    ],
  }]
})
```

同样适用于 `initTypeChart` 和 `initTrendChart` 中的颜色配置。

**预期效果**：图表配色随主题自动切换，暗色下使用高饱和度色，亮色下使用更沉稳的深色变体，始终保持良好对比度。

---

### P3-3：空状态图标优化

**文件路径**：`src/views/ProjectList.vue`

**优化目标**：将空状态中的 emoji 图标（✍️）替换为与设计风格一致的 SVG 图标或 Element Plus 图标。

**当前问题**（第28-29行）：
```html
<div class="empty-emoji">✍️</div>
```
Emoji 风格与整体的暗色科技感设计不协调。

**改后方案**：
```html
<div class="empty-icon">
  <el-icon :size="56" color="var(--ds-accent-text)"><EditPen /></el-icon>
</div>
```

```css
.empty-icon {
  margin-bottom: var(--ds-space-4);
  opacity: 0.6;
}
```

**预期效果**：空状态图标与整体设计语言一致，不再有"AI味"的emoji出现。

---

### P3-4：AI 助手呼吸动画优化

**文件路径**：`src/components/AIAssistant.vue`

**优化目标**：将无限循环的呼吸动画改为"渐入后停止"，避免长时间使用时的注意力分散。

**当前问题**（第579行）：
```css
animation: breathe 3s ease-in-out infinite;
```

**改后方案**：
```css
.ai-float-button {
  /* ... 已有样式不变 ... */
  animation: breathe 3s ease-in-out 3; /* 播放3次后停止 */
}
```

或者改为仅在有未读消息时播放：
```css
.ai-float-button.has-unread {
  animation: breathe 3s ease-in-out infinite;
}
```

**预期效果**：AI浮动按钮在初始展示时有3次呼吸动画吸引注意，之后静止不动，减少视觉疲劳。

---

## 附录：优化总览表

| 编号 | 优先级 | 优化项 | 涉及文件数 | 预估改动行数 |
|------|--------|--------|-----------|-------------|
| P0-1 | P0 | SandboxLayout设计系统接入 | 1 | ~10行 |
| P0-2 | P0 | GlassContextPanel暗色适配 | 1 | ~15行 |
| P1-1 | P1 | 亮色主题Token补全 | 1 | ~15行新增 |
| P1-2 | P1 | Z-index统一管理 | 1+8 | ~8行Token + 8行改动 |
| P1-3 | P1 | 断点Token统一 | 1+6 | ~12行Token + 6行注释 |
| P2-1 | P2 | 硬编码颜色消除 | 13 | ~45处替换 |
| P2-2 | P2 | 响应式布局补充 | 3 | ~50行新增 |
| P2-3 | P2 | 工具函数抽取 | 1新增+11修改 | ~150行(含新函数) |
| P3-1 | P3 | 章节操作按钮优化 | 1 | ~30行改动 |
| P3-2 | P3 | ECharts主题适配 | 1 | ~40行改动 |
| P3-3 | P3 | 空状态图标优化 | 1 | ~5行改动 |
| P3-3 | P3 | AI呼吸动画优化 | 1 | ~3行改动 |

---

> 以上为完整的UI设计维度优化方案，所有优化项均包含具体文件路径、CSS变量名、Token定义和代码改法，可直接交付开发工程师执行。
