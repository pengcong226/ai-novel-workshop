# AI小说工坊 发布说明

## [v5.0.0] - 2026-04-12

### Major Architecture Changes
- **V5 Multi-View Sandbox Architecture**: Replaced Character Card/Worldbook with unified Entity & StateEvent graph
- **Graph-Guided RAG**: Single-collection (`chapter_content`) vector retrieval guided by active sandbox entities
- **Middleware Pipeline**: Replaced monolithic context building with extensible Context Pipeline (PlotAnchor, Vector, etc.)
- **Tool Calling Extraction**: Replaced regex extraction with LLM Tool Calling for entities and state events

### New Features
- **Plot Loom Board**: Kanban + Timeline fusion board with Fate Anchors
- **World Gen Wizard**: Chat interface for bulk-generating entities and relations
- **Dynamic Affinity**: Attitude-based color coding in relationship graph
- **ConStory-Bench**: 19-point consistency check system (antiRetconValidator)

## [v4.0.0] - 2026-03-27
- **Unified Import System**: Pipeline for importing novel text, generating traces, and extracting entities
- **Plugin System**: Extensible architecture for providers, importers, and exporters
- **Rust Vector Backend**: Replaced IndexedDB vector storage with Tauri Rust HNSW (`instant-distance`)

---

## [v3.0.0] - 2026-03-21

### 概述

v3.0.0 是一个里程碑版本，完成了所有计划功能，实现了完整的 AI 小说创作工具。本版本新增了 8 大核心功能模块，显著提升了创作效率和作品质量。

## 🎯 新功能

### 1. 向量检索系统

**功能描述：** 为长篇小说提供语义搜索和智能上下文检索

**主要特性：**
- 📊 双模式支持：本地模型（免费） / OpenAI（高质量）
- 🔍 智能上下文检索：根据当前章节自动查找相关历史内容
- ⚙️ 可配置参数：检索数量、相似度阈值、混合搜索权重
- 💾 自动索引：章节完成时自动更新向量索引
- 🚀 性能优化：批量嵌入、索引缓存

**配置路径：** 项目配置 > 向量检索

**使用场景：**
- 长篇小说（100+章节）的上下文管理
- 快速查找相关情节和人物
- 提高生成内容的连贯性

### 2. 自动摘要生成

**功能描述：** 自动为历史章节生成压缩摘要，优化上下文使用效率

**主要特性：**
- 📝 多层次摘要策略：
  - 最近 3 章：完整内容
  - 4-10 章前：详细摘要（500字）
  - 11-30 章前：简要摘要（200字）
  - 30 章前：极简摘要（100字）
- 🤖 自动提取关键信息（事件、人物变化、情节转折）
- ⚡ 章节完成时自动触发
- ✏️ 支持手动编辑
- 💾 独立存储，不影响原文

**使用路径：** 章节管理 > 摘要管理

### 3. 冲突检测系统

**功能描述：** 自动检测小说中的前后矛盾和不一致问题

**主要特性：**
- 👤 人物设定冲突（性格、能力、外貌）
- ⏰ 时间线矛盾（事件顺序、时间跨度、人物年龄）
- 🌍 世界观不一致（规则、设定）
- 📖 情节逻辑漏洞
- 📋 冲突报告（严重程度分级）
- 💡 修复建议

**使用路径：** 章节管理 > 质量检查 > 冲突报告

### 4. 质量检查增强

**功能描述：** 多维度质量评估和改进建议

**主要特性：**
- 📊 五维度评分：
  - 情节质量（逻辑、节奏、冲突）
  - 人物塑造（性格、成长、关系）
  - 文笔水平（流畅度、描写、对话）
  - 逻辑一致性（设定、时间线、因果）
  - 创新性（情节、人物、设定）
- 🔍 批量检查所有章节
- 📈 质量趋势图表
- 💬 具体改进建议和示例
- 📄 导出 PDF 报告

**使用路径：** 章节管理 > 质量检查 > 详细报告

### 5. 人物关系图可视化

**功能描述：** 交互式人物关系网络图

**主要特性：**
- 🎨 可视化展示（AntV G6）
- 🔗 自动提取关系：
  - 从人物设定提取显式关系
  - 从章节内容提取隐式互动（共同出场 ≥3次）
- 🖱️ 交互功能：
  - 拖拽节点和平移画布
  - 缩放画布
  - 点击查看人物详情
  - 右键编辑关系
  - 导出 PNG 图片
- 🎯 过滤功能：
  - 按关系类型过滤
  - 按关系强度过滤
  - 搜索特定人物

**使用路径：** 项目编辑器 > 人物关系图

**关系类型：**
- 家人（绿色）
- 朋友（蓝色）
- 敌人（红色）
- 恋人（橙色）
- 师徒（紫色）
- 对手（灰色）

### 6. 时间线编辑器

**功能描述：** 可视化故事事件时间线

**主要特性：**
- 📅 vis-timeline 可视化
- 📊 多轨道显示（主线、支线、人物线、伏笔）
- 🔍 自动提取事件：
  - 从大纲提取（主线事件、支线事件、伏笔）
  - 从章节提取（场景、人物出场、目标、冲突）
- ✏️ 交互编辑：
  - 拖拽调整事件顺序
  - 单击查看详情
  - 双击编辑事件
  - 右键菜单添加/删除
- ⚠️ 冲突检测：
  - 事件重叠警告
  - 伏笔未揭示提示
  - 时间顺序矛盾
- 🖼️ 导出为图片

**使用路径：** 项目编辑器 > 时间线

### 7. 表格记忆增强

**功能描述：** 专业级表格编辑体验

**主要特性：**
- 📝 表格编辑增强：
  - 拖拽排序行
  - 内联编辑（双击单元格）
  - 列宽调整
  - 列排序和筛选
- 📊 Excel 导入导出
- 📋 CSV 格式支持
- ↩️ 撤销/重做功能（Ctrl+Z/Y）
- ✅ 数据验证和错误提示
- 📈 统计图表可视化

**使用路径：** 项目编辑器 > 表格记忆

### 8. 世界观地图

**功能描述：** 交互式世界地图编辑器

**主要特性：**
- 🗺️ 地图编辑：
  - 添加地点（城市、山脉、河流等 15 种类型）
  - 区域划分（国家、势力范围）
  - 自定义图标和颜色
- 📍 数据提取：
  - 从世界观设定提取地点
  - 人物位置追踪
  - 移动轨迹显示
- 🖱️ 交互功能：
  - 缩放、平移
  - 点击查看地点详情
  - 编辑地点信息
- 🖼️ 导出为图片

**使用路径：** 项目编辑器 > 世界观地图

## 🔧 系统改进

### 系统提示词管理
- 为 5 种模型设置专属角色定义
- 预设提示词：规划师、小说家、编辑、顾问、数据管理员
- 支持自定义编辑和变量替换

### 模型管理增强
- 提供商模板（OpenAI、Anthropic、智谱、通义千问等 12+）
- 一键获取远程模型列表
- 批量导入模型配置
- 常用模型快速加载
- 成本统计面板

## 📦 技术改进

### 新增依赖
- `vis-timeline` - 时间线可视化
- `vis-data` - 时间线数据管理
- `@antv/g6` - 关系图可视化
- `html2canvas` - 图片导出
- `xlsx` - Excel 导入导出

### 性能优化
- 向量索引缓存
- 批量嵌入处理
- 摘要压缩策略
- 图表渲染优化

### 类型定义
- 冲突类型定义（`types/conflicts.ts`）
- 地图数据结构（`types/index.ts` 扩展）

## 📚 文档

新增文档：
- [向量检索文档](./docs/VECTOR_SEARCH.md)
- [自动摘要文档](./docs/SUMMARY_SYSTEM.md)
- [冲突检测文档](./docs/CONFLICT_DETECTION.md)
- [质量检查文档](./docs/QUALITY_CHECK.md)
- [人物关系图文档](./docs/RELATIONSHIP_GRAPH.md)
- [时间线编辑器文档](./docs/TIMELINE_IMPLEMENTATION.md)
- [表格可视化文档](./docs/TABLE_VISUALIZATION.md)
- [世界观地图文档](./docs/WORLD_MAP.md)

## 🐛 已知问题

暂无已知问题。如发现问题，请在 GitHub Issues 提交。

## 🎯 性能指标

| 功能 | 性能指标 |
|------|----------|
| 向量检索 | 1000+ 章节，检索时间 <100ms |
| 自动摘要 | 单章摘要生成 <2s |
| 冲突检测 | 100 章 <5s |
| 关系图渲染 | 100 节点 <500ms |
| 时间线渲染 | 500 事件 <1s |

## 💡 使用建议

1. **长篇小说（100+章节）**：启用向量检索和自动摘要
2. **复杂剧情**：使用时间线编辑器管理事件
3. **多人物**：使用关系图追踪人物关系
4. **质量控制**：定期运行质量检查和冲突检测

## 🚀 升级指南

从 v2.x 升级到 v3.0.0：

1. 代码更新：
   ```bash
   git pull origin main
   npm install
   ```

2. 新依赖安装：
   ```bash
   npm install vis-timeline vis-data @antv/g6 html2canvas xlsx
   ```

3. 配置迁移：
   - 系统提示词配置会自动使用默认值
   - 向量检索需要手动启用并初始化索引

## 📝 致谢

感谢所有 AI agents 的并行开发：
- 向量检索系统 Agent
- 自动摘要生成 Agent
- 冲突检测系统 Agent
- 质量检查增强 Agent
- 人物关系图 Agent
- 时间线编辑器 Agent
- 表格记忆增强 Agent
- 世界观地图 Agent

---

**版本：** v5.0.0
**最新发布日期：** 2026-04-12
**开发者：** AI小说工坊团队
