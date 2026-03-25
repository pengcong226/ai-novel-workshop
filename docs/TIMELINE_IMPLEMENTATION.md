# 时间线编辑器实现文档

## 概述

时间线编辑器是一个交互式的故事事件可视化工具，用于帮助小说作者管理和组织故事的时间线。它能够从大纲和章节中自动提取事件，以时间轴的形式展示，并支持冲突检测和可视化编辑。

## 实现的功能

### 1. 事件提取 (timelineExtractor.ts)

**功能：**
- 从项目大纲自动提取事件（主线、支线、卷大纲、章节大纲、伏笔）
- 从章节内容提取关键事件（场景、人物出场、章节目标等）
- 支持自定义事件添加

**提取的事件类型：**
```typescript
type TimelineEventType = 'main' | 'subplot' | 'character' | 'foreshadowing' | 'custom'
```

**提取来源：**
1. 大纲 (Outline)
   - 主线剧情 (mainPlot)
   - 支线剧情 (subPlots)
   - 卷大纲 (volumes)
   - 章节大纲 (chapters)
   - 伏笔管理 (foreshadowings)

2. 章节 (Chapters)
   - 章节本身
   - 场景信息
   - 出场人物

### 2. 时间线可视化 (TimelineEditor.vue)

**核心功能：**

#### 2.1 多轨道显示
- 主线轨道 (main)
- 章节轨道 (chapters)
- 主要事件轨道 (events)
- 目标轨道 (goals)
- 冲突轨道 (conflicts)
- 伏笔轨道 (foreshadowing)
- 场景轨道 (scenes)
- 支线轨道 (subplot-{id})
- 人物轨道 (character-{id})

#### 2.2 事件类型颜色区分
```css
主线事件：蓝色 (#409eff)
支线事件：绿色 (#67c23a)
人物事件：橙色 (#e6a23c)
伏笔事件：灰色 (#909399)
自定义事件：红色 (#f56c6c)
卷事件：紫色 (#8b5cf6)
```

#### 2.3 交互功能
- **缩放和平移**：支持鼠标滚轮缩放，拖拽移动时间线
- **拖拽调整**：拖拽事件调整时间位置
- **点击查看**：点击事件查看详细信息
- **双击编辑**：双击事件打开编辑对话框
- **右键菜单**：右键空白处添加新事件
- **轨道过滤**：可选择性显示/隐藏轨道
- **类型过滤**：可选择性显示/隐藏事件类型

### 3. 时间线冲突检测

**冲突类型：**

#### 3.1 事件重叠 (overlap)
```typescript
{
  type: 'overlap',
  events: [event1.id, event2.id],
  description: '事件重叠警告',
  severity: 'warning'
}
```
同一轨道内的事件在时间上存在重叠。

#### 3.2 伏笔未揭示 (gap)
```typescript
{
  type: 'gap',
  events: [foreshadowing.id],
  description: '伏笔已埋设但尚未揭示',
  severity: 'warning'
}
```
已埋设的伏笔尚未揭示。

#### 3.3 时间矛盾 (contradiction)
```typescript
{
  type: 'contradiction',
  events: [event1.id, event2.id],
  description: '事件时间顺序矛盾',
  severity: 'error'
}
```
事件的开始和结束时间存在逻辑矛盾。

### 4. 导出功能

支持将时间线导出为PNG图片：
- 使用 html2canvas 库
- 支持高分辨率导出
- 包含完整的视觉样式

## 技术实现

### 依赖库

```json
{
  "vis-timeline": "^7.7.3",
  "vis-data": "^7.1.9",
  "html2canvas": "^1.4.1"
}
```

### 文件结构

```
src/
├── components/
│   └── TimelineEditor.vue          # 时间线编辑器组件 (700+ 行)
├── utils/
│   └── timelineExtractor.ts        # 事件提取和冲突检测 (400+ 行)
└── views/
    └── ProjectEditor.vue           # 集成时间线菜单项
```

### 核心API

#### 1. 提取事件
```typescript
function extractTimelineEvents(project: Project): TimelineEvent[]
```
从项目数据中提取所有时间线事件。

#### 2. 生成分组
```typescript
function generateTimelineGroups(project: Project): TimelineGroup[]
```
生成时间线的轨道分组。

#### 3. 冲突检测
```typescript
function detectTimelineConflicts(events: TimelineEvent[]): TimelineConflict[]
```
检测时间线中的冲突和矛盾。

#### 4. 导出图片
```typescript
async function exportTimelineAsImage(element: HTMLElement): Promise<Blob | null>
```
将时间线导出为图片。

#### 5. 转换数据格式
```typescript
function toVisTimelineData(events: TimelineEvent[]): { items: any[], groups: any[] }
```
将事件数据转换为 vis-timeline 所需的格式。

## 使用指南

### 基本操作流程

1. **打开时间线**
   - 在项目编辑器中，点击左侧菜单"时间线"

2. **提取事件**
   - 点击"提取事件"按钮，自动从大纲和章节提取事件
   - 系统会分析项目数据并生成时间线

3. **查看和筛选**
   - 使用工具栏的复选框控制显示的轨道
   - 使用类型过滤器选择事件类型

4. **编辑事件**
   - 单击事件查看详细信息
   - 双击事件打开编辑对话框
   - 拖拽事件调整时间位置

5. **添加自定义事件**
   - 点击"添加事件"按钮
   - 或右键点击时间线空白处

6. **冲突检测**
   - 点击"检测冲突"按钮
   - 查看冲突列表和详细信息
   - 根据提示调整事件

7. **导出时间线**
   - 点击"导出图片"按钮
   - 保存为PNG格式

## 性能优化

### 大量事件处理
- 使用轨道过滤功能减少渲染负担
- 使用缩放功能查看特定时间范围
- 定期清理不需要的事件

### 渲染优化
- vis-timeline 内置虚拟滚动
- 只渲染可见区域的事件
- 懒加载事件详情

### 数据优化
- 事件数据按章节排序
- 使用 Map 数据结构快速查找
- 缓存计算结果

## 扩展计划

### 短期目标
1. **事件筛选和搜索**
   - 按关键词搜索事件
   - 按时间范围筛选
   - 按标签筛选

2. **时间线快照**
   - 保存时间线状态
   - 比较不同版本
   - 恢复历史快照

3. **数据导入导出**
   - JSON 格式导出
   - Excel 格式导出
   - 其他格式支持

### 中期目标
4. **AI 辅助事件提取**
   - 智能识别章节中的关键事件
   - 自动标注事件类型
   - 建议事件关联

5. **时间线分析**
   - 故事节奏分析
   - 人物出场频率统计
   - 伏笔分布可视化

6. **协作功能**
   - 多人实时编辑
   - 评论和标注
   - 版本历史

### 长期目标
7. **高级可视化**
   - 3D 时间线视图
   - 故事地图视图
   - 人物关系网络

8. **智能建议**
   - 冲突自动修复建议
   - 伏笔埋设建议
   - 节奏优化建议

## 已知问题

1. **vis-timeline 类型定义**
   - 当前使用简化版类型定义
   - 未来需要完整的类型支持

2. **动态导入优化**
   - html2canvas 和 timelineExtractor 的动态导入需要优化
   - 考虑使用代码分割

3. **大量事件性能**
   - 超过500个事件时性能下降
   - 需要实现虚拟滚动优化

## 测试建议

### 单元测试
```typescript
// 测试事件提取
describe('extractTimelineEvents', () => {
  it('should extract events from outline', () => {
    const project = createMockProject()
    const events = extractTimelineEvents(project)
    expect(events.length).toBeGreaterThan(0)
  })
})

// 测试冲突检测
describe('detectTimelineConflicts', () => {
  it('should detect overlapping events', () => {
    const events = createOverlappingEvents()
    const conflicts = detectTimelineConflicts(events)
    expect(conflicts).toContainEqual(
      expect.objectContaining({ type: 'overlap' })
    )
  })
})
```

### 集成测试
- 测试时间线渲染
- 测试用户交互
- 测试导出功能
- 测试性能

## 总结

时间线编辑器提供了强大的事件管理和可视化功能，帮助作者更好地组织故事结构。通过自动提取、冲突检测和可视化编辑，作者可以直观地看到故事的发展脉络，及时发现和修复问题。

实现的核心价值：
1. **自动化**：从现有数据自动提取事件，减少手动输入
2. **可视化**：直观展示时间线，便于理解和调整
3. **智能检测**：自动发现冲突和矛盾，提高故事质量
4. **易用性**：简单的操作界面，快速上手
5. **扩展性**：模块化设计，易于扩展新功能
