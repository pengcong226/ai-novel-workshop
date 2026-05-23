# 同人创作系统 - 设计文档

> 创建时间：2026-05-10
> 状态：设计阶段

---

## 1. 项目定位

### 核心理念
一个**互动式同人小说生成器**，让用户在阅读小说时可以随时"如果主角这样做会怎样"，系统基于原作设定生成if线剧情。

### 目标用户
- 喜欢看小说的读者
- 想尝试同人创作但不知道怎么写的人
- 对剧情走向有自己想法的读者

### 核心价值
1. **不需要从零构建世界观和人物设定** — 原作自带
2. **降低创作门槛** — 用户只需输入"如果XXX"，AI生成具体剧情
3. **保留创意决策权** — 用户做选择，AI执行

---

## 2. 与原项目的关系

### 背景
原项目 `ai-novel-workshop` 是一个全自动原创小说生成系统，存在以下问题：
- 防吃书工程过于复杂
- AI生成模板化严重
- 世界观和人物设定对非专业作者太难
- 剧情动态调整难以实现

### 决策
**推倒重来**，设计全新的同人创作系统，不再维护原项目。

### 从原项目复用的设计理念
- Entity + StateEvent 状态追踪系统
- 上下文管线 + Token预算管理
- 向量检索相似场景

---

## 3. 系统架构

```
┌─────────────────────────────────────────────────┐
│                    前端 (Vue 3)                  │
│  手机/电脑/平板浏览器访问                          │
│                                                  │
│  页面：                                          │
│  ├── 登录/注册                                   │
│  ├── 作品库（原作列表 + 同人分支列表）              │
│  ├── 原作导入                                    │
│  ├── 阅读器（查看原作章节）                        │
│  ├── 创作界面（核心：分支剧情生成）                 │
│  ├── 分支树可视化                                │
│  └── 用户设置（API Key 管理）                     │
└──────────────────────┬──────────────────────────┘
                       │ HTTP
┌──────────────────────┴──────────────────────────┐
│                 后端 (Python FastAPI)             │
│                                                  │
│  模块：                                          │
│  ├── 用户系统（JWT认证、注册、登录）               │
│  ├── 原作管理（导入、分章、存储）                  │
│  ├── 设定提取（AI自动提取人物/关系/世界观）        │
│  ├── 分支管理（创建分支、分支树结构）              │
│  ├── 生成引擎（用户输入→AI生成剧情）              │
│  ├── OOC检测（基于原作参考场景）                  │
│  └── API代理（转发用户的AI请求）                  │
└──────────────────────┬──────────────────────────┘
                       │
        ┌──────────────┴──────────────┐
        │                             │
┌───────┴───────┐          ┌──────────┴──────────┐
│  PostgreSQL   │          │  AI Providers       │
│  数据库       │          │  (用户自己的API Key) │
│               │          │  OpenAI / Anthropic  │
│  - 用户数据   │          │  / 其他兼容API       │
│  - 原作内容   │          └─────────────────────┘
│  - 设定数据   │
│  - 分支剧情   │
└───────────────┘
```

---

## 4. 技术栈

| 层 | 技术 | 理由 |
|---|------|------|
| 前端 | Vue 3 + Vite + Pinia + Vue Router + Naive UI | 用户熟悉，Naive UI暗色主题好看 |
| 后端 | Python 3.11+ + FastAPI + SQLAlchemy + Alembic | AI生态最好，async性能强 |
| 数据库 | PostgreSQL | 多用户场景，JSON支持好 |
| AI调用 | httpx + OpenAI SDK | 支持所有兼容API |
| 文件存储 | 本地磁盘/对象存储 | 原作文件 |
| 部署 | Docker Compose + Nginx | 一键部署 |
| 认证 | JWT + bcrypt | 简单安全 |

---

## 5. 数据库设计

### 用户表 (users)
```
├── id, username, email, password_hash
├── created_at, updated_at
└── api_keys (JSON, 加密存储)
    ├── provider: "openai" / "anthropic" / "custom"
    ├── api_key: "sk-xxx"
    └── base_url: "https://..."
```

### 原作表 (original_works)
```
├── id, user_id (关联用户)
├── title, author, description
├── cover_image
├── source_file_path (上传的TXT/EPUB)
├── total_chapters, word_count
├── extraction_status (pending/processing/done/failed)
└── created_at
```

### 章节表 (work_chapters)
```
├── id, work_id (关联原作)
├── chapter_number, title
├── content (章节正文)
└── word_count
```

### 实体表 (entities)
```
├── id, work_id, entity_type (CHARACTER/LOCATION/ITEM/FACTION/LORE)
├── name, aliases (别名JSON)
├── description (AI生成的描述)
├── personality (人物性格，仅CHARACTER)
├── first_appearance_chapter
├── importance (critical/major/minor/background)
└── raw_data (原作中提取的原始信息)
```

### 实体关系表 (entity_relations)
```
├── id, work_id
├── source_entity_id, target_entity_id
├── relation_type (family/lover/enemy/ally/subordinate...)
├── description
└── start_chapter
```

### 分支表 (branches)
```
├── id, work_id, user_id
├── parent_branch_id (父分支，NULL=原作主线)
├── fork_chapter_number (在第几章分叉)
├── fork_point_content (分叉点的上下文)
├── user_input (用户的"如果XXX"输入)
├── title (分支标题，AI自动生成)
├── current_chapter_number (当前写到第几章)
└── created_at
```

### 分支章节表 (branch_chapters)
```
├── id, branch_id
├── chapter_number
├── content (生成的章节内容)
├── generation_context (生成时的上下文快照)
├── state_events (状态变更记录)
└── created_at
```

### 分支实体状态表 (branch_entity_states)
```
├── id, branch_id, entity_id
├── current_location, current_status
├── properties (JSON，自定义属性)
└── last_updated_chapter
```

---

## 6. 核心功能流程

### 6.1 导入原作
```
用户上传TXT → 后端分章 → AI提取人物/关系/世界观 → 存入数据库
```

### 6.2 创建分支（核心）
```
用户在第N章暂停 → 输入"如果主角在这里选择了另一条路"
    ↓
后端：
├── 取原作前N章内容
├── 取该章节涉及的实体当前状态
├── 取用户输入的"如果XXX"
├── 构建上下文（参考原作相似场景）
└── 调用AI生成新剧情
    ↓
创建新分支 → 存储生成内容 → 更新实体状态
```

### 6.3 继续分支
```
用户在分支中 → 输入"接下来主角去做XXX"或直接让AI续写
    ↓
后端：
├── 取分支已生成的所有章节
├── 取原作中后续章节作为参考（但不照搬）
├── 取实体当前状态
└── 调用AI生成下一章
```

---

## 7. 关键设计决策

### 7.1 用户系统
- 开放注册，支持多用户
- API Key 由用户自己提供（加密存储）
- 每个用户独立的作品库和分支

### 7.2 原作数据
- 存储在服务器上
- 导入后自动解析、分章、提取设定
- 设定数据可手动编辑调整

### 7.3 AI调用
- 用户自己填 API Key
- 支持 OpenAI / Anthropic / 其他兼容 API
- 服务器作为代理转发请求

### 7.4 OOC检测
- 基于原作中角色的相似场景做参考
- 向量检索原作中角色的行为模式
- 生成后对比检测是否偏离人设

### 7.5 分支结构
- 树状结构，支持多层分叉
- 可以回到任意节点重新选择
- 分支间可以对比差异

---

## 8. 开发阶段

### Phase 1 - 最小可用版本
- [ ] 用户注册/登录
- [ ] 导入原作TXT → AI提取设定
- [ ] 创建分支 → AI生成第一段剧情
- [ ] 继续分支 → AI续写
- [ ] 基础响应式（手机可用）

### Phase 2 - 体验优化
- [ ] 分支树可视化
- [ ] OOC检测
- [ ] 剧情回顾/总结
- [ ] 移动端响应式优化
- [ ] 实体状态手动编辑

### Phase 3 - 完善功能
- [ ] 多AI模型支持
- [ ] 分支对比
- [ ] 导出功能
- [ ] 向量检索优化
- [ ] 性能优化

---

## 9. 待讨论问题

- [ ] 前端框架最终选择（Vue 3 vs 其他）
- [ ] 后端语言最终选择（Python vs Rust vs Node.js）
- [ ] 第一个可用原型的具体范围
- [ ] 是否需要考虑版权问题
