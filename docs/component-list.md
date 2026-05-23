# AI小说工坊 - 组件清单

## 1. 布局组件

### 1.1 ThreeColumnLayout.vue
三栏主布局容器

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| leftWidth | number | 280 | 左侧面板宽度(px) |
| rightWidth | number | 320 | 右侧面板宽度(px) |
| minLeftWidth | number | 200 | 左侧最小宽度 |
| minRightWidth | number | 240 | 右侧最小宽度 |
| collapsible | boolean | true | 是否可折叠面板 |

| 事件 | 参数 | 说明 |
|------|------|------|
| resize | { left: number, right: number } | 面板宽度变化 |
| collapse | { side: 'left' \| 'right' } | 面板折叠/展开 |

| 插槽 | 说明 |
|------|------|
| left | 左侧面板内容 |
| center | 中间主内容区 |
| right | 右侧面板内容 |

---

### 1.2 AppHeader.vue
顶部导航栏

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| projectName | string | '' | 当前项目名称 |
| showBreadcrumb | boolean | true | 显示面包屑 |
| showThemeToggle | boolean | true | 显示主题切换 |

| 事件 | 参数 | 说明 |
|------|------|------|
| menuClick | key: string | 菜单项点击 |
| themeChange | theme: string | 主题切换 |

---

## 2. 设定面板组件

### 2.1 WorldBuilding.vue
世界观设定表单

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| settings | WorldSettings | {} | 世界观数据 |
| readonly | boolean | false | 只读模式 |

| 事件 | 参数 | 说明 |
|------|------|------|
| update | settings: WorldSettings | 数据更新 |
| save | settings: WorldSettings | 保存设定 |

**功能模块**:
- 世界名称、时代背景
- 魔法体系开关
- 科技水平选择
- 地理环境编辑
- 社会结构设定
- 世界规则列表（可增删）

---

### 2.2 CharacterManager.vue
人物管理面板

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| characters | Character[] | [] | 人物列表 |
| selectedId | string | null | 选中人物ID |
| viewMode | 'list' \| 'card' | 'card' | 显示模式 |

| 事件 | 参数 | 说明 |
|------|------|------|
| select | character: Character | 选中人物 |
| create | - | 创建新人物 |
| update | character: Character | 更新人物 |
| delete | id: string | 删除人物 |
| import | data: Character[] | 导入人物 |
| export | - | 导出人物 |

**功能模块**:
- 人物列表/卡片视图切换
- 搜索过滤
- 批量操作
- 导入/导出

---

### 2.3 CharacterCard.vue
人物信息卡片

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| character | Character | required | 人物数据 |
| selected | boolean | false | 是否选中 |
| compact | boolean | false | 紧凑模式 |
| showActions | boolean | true | 显示操作按钮 |

| 事件 | 参数 | 说明 |
|------|------|------|
| select | character: Character | 点击卡片 |
| edit | character: Character | 编辑按钮 |
| delete | id: string | 删除按钮 |
| duplicate | character: Character | 复制人物 |

---

### 2.4 OutlineTree.vue
大纲树形结构

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| data | OutlineNode[] | [] | 树形数据 |
| selectedId | string | null | 选中节点ID |
| expandedKeys | string[] | [] | 展开的节点 |
| draggable | boolean | true | 支持拖拽 |

| 事件 | 参数 | 说明 |
|------|------|------|
| select | node: OutlineNode | 选中节点 |
| expand | keys: string[] | 展开变化 |
| move | { node, newParent, index } | 拖拽移动 |
| create | parent: OutlineNode | 创建子节点 |
| delete | node: OutlineNode | 删除节点 |
| rename | { node, title } | 重命名 |

**功能模块**:
- 树形展示（卷/章/节）
- 拖拽排序
- 右键菜单
- 字数统计
- 状态标识（计划/草稿/完成）

---

## 3. 编辑器组件

### 3.1 MarkdownEditor.vue
Markdown编辑器主组件

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| modelValue | string | '' | 编辑内容 |
| placeholder | string | '开始写作...' | 占位文本 |
| readonly | boolean | false | 只读模式 |
| height | string | '100%' | 编辑器高度 |
| theme | 'light' \| 'dark' | 'light' | 主题 |
| fontSize | number | 16 | 字号 |
| lineNumbers | boolean | true | 显示行号 |
| spellcheck | boolean | true | 拼写检查 |

| 事件 | 参数 | 说明 |
|------|------|------|
| update:modelValue | content: string | 内容变化 |
| save | content: string | 保存(Ctrl+S) |
| selectionChange | { text, range } | 选区变化 |
| cursorChange | { line, column } | 光标移动 |
| focus | - | 获得焦点 |
| blur | - | 失去焦点 |

**功能模块**:
- 语法高亮
- 自动补全
- 快捷键支持
- 撤销/重做
- 查找替换
- 跳转行号

---

### 3.2 EditorToolbar.vue
编辑器工具栏

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| canUndo | boolean | false | 可撤销 |
| canRedo | boolean | false | 可重做 |
| wordCount | number | 0 | 字数统计 |
| saveStatus | string | 'saved' | 保存状态 |

| 事件 | 参数 | 说明 |
|------|------|------|
| undo | - | 撤销 |
| redo | - | 重做 |
| format | type: string | 格式化命令 |
| insert | type: string | 插入内容 |
| save | - | 保存 |
| export | format: string | 导出 |

**工具按钮**:
- 撤销/重做
- 加粗/斜体/删除线
- 标题级别(H1-H6)
- 列表（有序/无序）
- 引用块
- 代码块
- 链接/图片
- 分割线
- 字数统计显示
- 保存状态指示

---

### 3.3 PreviewPane.vue
Markdown预览面板

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| content | string | '' | Markdown内容 |
| theme | 'light' \| 'dark' | 'light' | 预览主题 |
| scrollSync | boolean | true | 滚动同步 |
| showToc | boolean | true | 显示目录 |

| 事件 | 参数 | 说明 |
|------|------|------|
| headingClick | id: string | 点击标题 |
| linkClick | href: string | 点击链接 |

**功能模块**:
- Markdown渲染
- 目录导航
- 滚动同步
- 图片预览
- 代码高亮

---

### 3.4 ChapterList.vue
章节列表面板

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| chapters | Chapter[] | [] | 章节列表 |
| currentId | string | null | 当前章节ID |
| showWordCount | boolean | true | 显示字数 |

| 事件 | 参数 | 说明 |
|------|------|------|
| select | chapter: Chapter | 选择章节 |
| create | - | 新建章节 |
| reorder | chapters: Chapter[] | 重排序 |
| delete | id: string | 删除章节 |

---

## 4. AI助手组件

### 4.1 ChatPanel.vue
AI对话面板

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| messages | ChatMessage[] | [] | 消息列表 |
| loading | boolean | false | AI思考中 |
| placeholder | string | '输入消息...' | 输入框占位 |
| maxLength | number | 2000 | 最大输入长度 |
| showContext | boolean | true | 显示上下文信息 |

| 事件 | 参数 | 说明 |
|------|------|------|
| send | message: string | 发送消息 |
| clear | - | 清空对话 |
| retry | messageId: string | 重新生成 |
| copy | content: string | 复制内容 |
| insert | content: string | 插入到编辑器 |

**功能模块**:
- 消息气泡展示
- 上下文标签显示
- 流式输出显示
- 消息操作（复制/重试/插入）
- 快捷提示词

---

### 4.2 ChatMessage.vue
单条消息组件

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| message | ChatMessage | required | 消息数据 |
| showAvatar | boolean | true | 显示头像 |
| showTime | boolean | true | 显示时间 |

| 事件 | 参数 | 说明 |
|------|------|------|
| copy | content: string | 复制内容 |
| retry | id: string | 重新生成 |
| insert | content: string | 插入编辑器 |

---

### 4.3 SuggestionCard.vue
AI建议卡片

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| suggestion | Suggestion | required | 建议数据 |
| expanded | boolean | false | 展开状态 |

| 事件 | 参数 | 说明 |
|------|------|------|
| accept | suggestion: Suggestion | 采纳建议 |
| dismiss | id: string | 忽略建议 |
| edit | suggestion: Suggestion | 编辑建议 |

**建议类型**:
- `continuation`: 续写建议
- `dialogue`: 对话建议
- `description`: 描写建议
- `plot`: 剧情建议

---

### 4.4 PromptSelector.vue
提示词选择器

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| templates | PromptTemplate[] | [] | 模板列表 |
| categories | string[] | [] | 分类列表 |
| selectedId | string | null | 选中模板ID |

| 事件 | 参数 | 说明 |
|------|------|------|
| select | template: PromptTemplate | 选择模板 |
| custom | prompt: string | 自定义提示词 |
| save | template: PromptTemplate | 保存模板 |

**预设模板分类**:
- 续写助手
- 对话生成
- 描写润色
- 情节构思
- 人物塑造
- 世界观构建

---

## 5. 可视化组件

### 5.1 RelationGraph.vue
人物关系图

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| characters | Character[] | [] | 人物数据 |
| relationships | Relationship[] | [] | 关系数据 |
| highlightId | string | null | 高亮节点ID |
| width | number | 600 | 图宽度 |
| height | number | 400 | 图高度 |
| interactive | boolean | true | 可交互 |

| 事件 | 参数 | 说明 |
|------|------|------|
| nodeClick | character: Character | 点击节点 |
| edgeClick | relationship: Relationship | 点击连线 |
| zoom | scale: number | 缩放变化 |

**功能模块**:
- 力导向图布局
- 节点拖拽
- 缩放平移
- 关系类型标识
- 节点详情弹窗

---

### 5.2 TimelineView.vue
时间线视图

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| events | TimelineEvent[] | [] | 事件列表 |
| mode | 'horizontal' \| 'vertical' | 'horizontal' | 布局方向 |
| highlightId | string | null | 高亮事件ID |

| 事件 | 参数 | 说明 |
|------|------|------|
| eventClick | event: TimelineEvent | 点击事件 |
| chapterJump | chapterId: string | 跳转章节 |

**功能模块**:
- 时间轴展示
- 事件分组
- 章节关联
- 缩放控制

---

### 5.3 NodeDetails.vue
节点详情弹窗

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| visible | boolean | false | 显示状态 |
| character | Character | null | 人物数据 |
| position | { x, y } | { x: 0, y: 0 } | 弹窗位置 |

| 事件 | 参数 | 说明 |
|------|------|------|
| close | - | 关闭弹窗 |
| edit | character: Character | 编辑人物 |
| navigate | characterId: string | 跳转关联人物 |

---

## 6. 通用组件

### 6.1 LoadingSpinner.vue
加载动画

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| size | 'small' \| 'medium' \| 'large' | 'medium' | 大小 |
| text | string | '' | 加载文字 |

---

### 6.2 EmptyState.vue
空状态占位

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| icon | string | 'document' | 图标 |
| title | string | '暂无数据' | 标题 |
| description | string | '' | 描述 |
| actionText | string | '' | 操作按钮文字 |

| 事件 | 参数 | 说明 |
|------|------|------|
| action | - | 点击操作按钮 |

---

## 7. 组件依赖关系

```
App
└── ThreeColumnLayout
    ├── LeftPanel
    │   ├── WorldBuilding
    │   ├── CharacterManager
    │   │   └── CharacterCard (多个)
    │   └── OutlineTree
    ├── CenterPanel
    │   ├── EditorToolbar
    │   ├── MarkdownEditor
    │   ├── PreviewPane
    │   └── ChapterList
    └── RightPanel
        ├── ChatPanel
        │   └── ChatMessage (多个)
        ├── SuggestionCard (多个)
        └── PromptSelector
```

## 8. 组件样式规范

### 8.1 CSS变量

```scss
:root {
  // 颜色
  --primary-color: #409eff;
  --success-color: #67c23a;
  --warning-color: #e6a23c;
  --danger-color: #f56c6c;
  --info-color: #909399;

  // 背景
  --bg-color: #ffffff;
  --bg-color-secondary: #f5f7fa;
  --bg-color-hover: #ecf5ff;

  // 边框
  --border-color: #dcdfe6;
  --border-radius: 4px;

  // 文字
  --text-color-primary: #303133;
  --text-color-regular: #606266;
  --text-color-secondary: #909399;
  --text-color-placeholder: #c0c4cc;

  // 间距
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  --spacing-xl: 32px;

  // 面板宽度
  --panel-left-width: 280px;
  --panel-right-width: 320px;
  --header-height: 56px;
}
```

### 8.2 暗色主题

```scss
[data-theme='dark'] {
  --bg-color: #1a1a1a;
  --bg-color-secondary: #252525;
  --bg-color-hover: #2a2a2a;
  --border-color: #3a3a3a;
  --text-color-primary: #e5eaf3;
  --text-color-regular: #cfd3dc;
  --text-color-secondary: #a3a6ad;
}
```
