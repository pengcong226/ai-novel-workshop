# Weave 分支式写作工具技术深度分析报告

> 项目地址: https://github.com/mdegans/weave
> 分析日期: 2026-05-11

---

## 一、项目概览

Weave 是一个 **"多元宇宙"分支式生成写作工具**（Multiversal Generative Tree Writing Tool），灵感来自 [`loom`](https://github.com/socketteer/loom)。它使用 Rust 编写，基于 egui/eframe 构建桌面 GUI，支持多种 AI 后端（本地 llama.cpp + OpenAI API），核心特性是**故事可以像树一样分支**——每个节点代表一段文本，用户可以在任意节点创建多个子节点，形成多条平行的故事线。

### 核心技术栈

| 组件 | 技术 | 说明 |
|------|------|------|
| 语言 | Rust (edition 2021) | `#![forbid(unsafe_code)]` |
| GUI 框架 | egui 0.27 + eframe 0.27 | 即时模式 GUI |
| 本地 AI | drama_llama 0.5 (llama.cpp wrapper) | 本地模型推理 |
| 在线 AI | openai-rust 1.5 | GPT 3.5+ API |
| 序列化 | serde + serde_json | 状态持久化 |
| 异步运行时 | tokio (OpenAI 后端) | 用于 HTTP 请求 |
| 密钥管理 | keyring 2.0 | 系统密钥链存储 API key |
| Markdown | egui_commonmark 0.16 | 故事文本渲染 |

### 版本与功能状态

当前版本 **0.0.3**（alpha），功能完成度：

- ✅ 线性故事视图、树形导航栏
- ✅ 可视化树探索（鼠标交互）、节点展开/折叠
- ✅ 树拓扑编辑、节点就地编辑
- ✅ 流式生成、实时取消、生成中编辑
- ✅ JSON 文件 I/O、多树合并
- ✅ 高级采样控制（本地模型）
- 🔲 书签、章节、"已访问"状态
- 🔲 Anthropic Claude 支持
- 🔲 多标签页/窗口

---

## 二、分支树数据结构（核心设计）

### 2.1 Node 结构体

```rust
pub struct Node<T> {
    pub author_id: u8,           // 作者 ID（u8，支持256个作者）
    pub text: String,            // 节点文本内容
    pub pieces: Vec<Piece>,      // 文本片段索引（用于精确文本操作）
    pub children: Vec<Node<T>>,  // 子节点列表（递归树结构）
    pub meta: T,                 // 元数据（泛型参数）
}
```

**关键设计决策**：

1. **递归树结构** — `children: Vec<Node<T>>` 形成经典的多叉树，每个节点可以有任意数量的子节点
2. **泛型元数据** — `meta: T` 允许不同上下文使用不同的元数据类型（GUI 模式使用 `Meta`，纯库模式可以自定义）
3. **Piece 索引** — `Piece { end: usize }` 记录文本片段的结束位置，支持精确的文本操作和 detokenization
4. **作者追踪** — 每个节点记录 `author_id`，区分人类作者和 AI 生成

### 2.2 Meta 结构体（GUI 模式）

```rust
pub struct Meta {
    pub(crate) id: u128,    // UUID v4，全局唯一标识
    pub pos: egui::Pos2,    // 节点中心位置
    pub size: egui::Vec2,   // 节点尺寸
    pub vel: egui::Vec2,    // 速度（用于力导向布局，不序列化）
}
```

`vel` 字段标记为 `#[serde(skip)]`，只在运行时存在，用于力导向布局算法。

### 2.3 Story 结构体

```rust
pub struct Story {
    active_path: Option<Vec<usize>>,  // 当前活动路径（类似 git HEAD）
    pub title: String,                 // 故事标题
    author_to_id: HashMap<String, u8>, // 作者名 → ID 映射
    id_to_author: Vec<String>,         // ID → 作者名 映射
    root: Node<Meta>,                  // 根节点
}
```

**`active_path` 设计**：这是 Weave 最核心的概念之一。

- `active_path: Option<Vec<usize>>` 是一个**索引路径**，从根节点到当前"活动叶节点"的路径
- 例如 `Some(vec![0, 2, 1])` 表示：根节点 → 第0个子节点 → 第2个子节点 → 第1个子节点
- 类似 git 的 `HEAD`，表示"当前正在阅读/编辑的故事分支"
- `None` 表示当前在根节点

```rust
// 获取当前活动节点（类似 git HEAD）
pub fn head(&self) -> &Node<Meta> {
    match &self.active_path {
        Some(path) => self.root.iter_path_nodes(path).last().unwrap(),
        None => &self.root,
    }
}

// 添加段落到当前活动节点，并推进活动路径
pub fn add_paragraph(&mut self, author: Id, strings: impl IntoIterator<...>) {
    let head = self.head_mut();
    let child_index = head.add_child(Node::with_author(author));
    // ... 扩展文本
    // 推进活动路径
    if let Some(path) = &mut self.active_path {
        path.push(child_index);
    } else {
        self.active_path = Some(vec![child_index]);
    }
}
```

### 2.4 作者系统

```rust
pub enum AuthorID {
    String(String),  // 按名称查找
    ID(u8),          // 按 ID 直接访问
}

// Story 维护双向映射
author_to_id: HashMap<String, u8>,  // 名称 → ID
id_to_author: Vec<String>,          // ID → 名称
```

作者系统支持**人类 + AI 协作**：人类用户和 AI 模型都被视为"作者"，各自有独立的 author_id。生成时，AI 模型名称自动注册为作者：

```rust
// 生成时添加模型为作者
story.add_author(model_name);  // 如 "gpt-4o" 或本地模型名
```

---

## 三、力导向布局算法（Force-Directed Layout）

### 3.1 算法概述

Weave 使用**力导向图布局算法**将树形结构可视化。定义在 `node.rs` 的 `PositionalLayout::apply()` 方法中（约250行代码）。

### 3.2 物理模型

```rust
const DAMPING: f32 = 0.10;           // 速度阻尼
const BOUNDARY_DAMPING: f32 = 0.5;   // 边界碰撞阻尼
const MASS_DIVISOR: f32 = 1000.0;    // 质量除数（面积/1000）
const PADDING: f32 = 32.0;           // 边界填充 + 最大速度
const LOCAL_GLOBAL_RATIO: f32 = 5.0; // 局部/全局质心比
```

**三种力**：

1. **排斥力（Inverse Square）** — 兄弟节点之间互相排斥，力 ∝ `mass_a * mass_b / distance²`
2. **吸引力（Linear）** — 父子节点之间通过边吸引力，力 ∝ `mass_parent * mass_child / distance`
3. **重力（Centroid Attraction）** — 节点被吸引到局部+全局加权质心，保持树居中

### 3.3 算法流程

```
对每个节点（栈遍历）：
1. 应用阻尼：vel *= (1 - DAMPING)
2. 兄弟节点互相排斥（O(n²) per siblings，但避免了全局 O(n²)）
3. 父节点排斥子节点（LOCAL_GLOBAL_RATIO 倍增强）
4. 计算局部质心（当前节点 + 子节点）
5. 加权混合局部和全局质心
6. 如果节点不在质心方向，施加重力
7. 边界碰撞检测：vel = -vel * BOUNDARY_DAMPING
8. 速度钳制：vel.clamp(-PADDING, PADDING)
9. 更新位置：pos += vel
10. 父子吸引力 + 排斥力（边交互）
11. 递归处理子节点
```

**关键优化**：避免全局 O(n²) 复杂度，只计算兄弟节点之间的力和父子之间的力，不计算堂兄弟节点之间的力。

### 3.4 布局参数 UI

```rust
pub enum PositionalLayout {
    ForceDirected {
        repulsion: f32,    // 排斥力系数 (0-250)
        attraction: f32,   // 吸引力系数 (0-5)
        gravity: f32,      // 重力系数 (0-5)
        speed: f32,        // 收敛速度 (0-10)
    },
}
```

用户可以通过滑块实时调整所有参数，看到即时效果。

---

## 四、生成式 AI 集成

### 4.1 双后端架构

Weave 支持两种 AI 后端，通过 Cargo feature flag 切换：

```toml
[features]
default = ["gui", "drama_llama", "openai"]
drama_llama = ["generate", "dep:drama_llama", ...]
openai = ["generate", "dep:openai-rust", "dep:futures", "dep:keyring", "dep:tokio"]
```

### 4.2 Worker 线程模式

两个后端都使用相同的 **Worker 线程模式**：

```
主线程 (GUI) ←→ Channel ←→ Worker 线程 (AI 推理)
```

**drama_llama Worker**：

```rust
pub(crate) struct Worker {
    handle: Option<std::thread::JoinHandle<()>>,
    to_worker: Option<std::sync::mpsc::Sender<Request>>,
    from_worker: Option<std::sync::mpsc::Receiver<Response>>,
}

enum Request {
    Stop,
    Predict { text: String, opts: PredictOptions },
    LoadModel { model: PathBuf },
}

enum Response {
    Done,
    Busy { request: Request },
    Predicted { piece: String },
    Error { error: Error },
    LoadedModel { model, max_context_size, metadata },
}
```

**OpenAI Worker**：

```rust
pub(crate) struct Worker {
    handle: Option<std::thread::JoinHandle<()>>,
    to_worker: Option<futures::channel::mpsc::Sender<Request>>,
    from_worker: Option<futures::channel::mpsc::Receiver<Response>>,
}
```

OpenAI Worker 使用 `futures::channel::mpsc`（因为 OpenAI API 是异步的），而 drama_llama 使用 `std::sync::mpsc`（因为本地推理是同步的）。

### 4.3 生成流程

```rust
// 1. 格式化故事为文本
let mut text = String::new();
story.format_full(&mut text, include_authors, include_title)?;

// 2. 发送到 Worker
match self.drama_llama_worker.predict(text, predict_options) {
    Ok(_) => { self.generation_ui_locked = true; }
    Err(e) => { ... }
}

// 3. Worker 逐 token 流式返回
for piece in engine.predict_pieces(tokens, opts) {
    // 检查停止信号
    match from_main.try_recv() {
        Ok(Request::Stop) => break,
        ...
    }
    // 发送预测结果
    to_main.send(Response::Predicted { piece }).ok();
    context.request_repaint();  // 触发 GUI 重绘
}

// 4. GUI 线程接收并添加到故事
// (在 App::update() 中处理)
```

### 4.4 故事转 OpenAI Messages

```rust
pub fn to_openai_messages(&self) -> Vec<Message> {
    // 沿 active_path 遍历节点
    // 每个节点 → 一条 Message (role = 作者名)
    // 最后一条为 user，往前交替 user/assistant
    let mut is_user = true;
    for message in messages.iter_mut().rev() {
        message.role = if is_user { "user" } else { "assistant" };
        is_user = !is_user;
    }
}
```

### 4.5 关键特性

1. **运行时切换后端** — 不重启应用即可在 OpenAI 和本地 LLaMA 之间切换
2. **流式生成 + 实时取消** — 逐 token 流式返回，用户可随时取消
3. **生成中编辑** — 用户可以在生成过程中编辑已有节点，新 token 始终追加到末尾
4. **高级采样控制** — 本地模型支持 temperature、top_p、stop sequences 等完整参数
5. **API Key 安全** — 使用系统密钥链（keyring）存储 OpenAI API key，不保存到设置文件

---

## 五、GUI 架构

### 5.1 App 结构

```rust
pub struct App {
    active_story: Option<usize>,
    stories: Vec<Story>,
    trash: Vec<Story>,          // 回收站
    settings: Settings,
    left_sidebar: LeftSidebar,  // 故事列表 + 设置
    right_sidebar: RightSidebar, // 文本视图 + 树视图
    last_frame_time: f64,
    time_step: f64,
    node_clipboard: Option<Node<Meta>>,  // 剪贴板
    errors: Vec<Error>,
    commonmark_cache: CommonMarkCache,
    drama_llama_worker: drama_llama::Worker,
    openai_worker: openai::Worker,
    generation_ui_locked: bool,
    save_dialog: Option<egui_file::FileDialog>,
}
```

### 5.2 三种视图模式

1. **树视图（Tree View）** — 可视化展示整个故事树，节点可拖拽、展开/折叠
2. **文本视图（Text View）** — 沿 active_path 显示线性故事文本
3. **阅读模式（Read Mode）** — 类似电子书的阅读体验

### 5.3 状态持久化

```rust
// 启动时加载
let stories = cc.storage
    .and_then(|s| s.get_string("stories"))
    .and_then(|s| serde_json::from_str(&s));

// 退出时保存（eframe 自动调用）
fn save(&mut self, storage: &mut dyn eframe::Storage) {
    storage.set_string("stories", serde_json::to_string(&self.stories));
    storage.set_string("settings", serde_json::to_string(&self.settings));
}
```

所有故事和设置通过 serde_json 序列化为 JSON，存储在 eframe 的持久化存储中。

---

## 六、与 loom 的对比

| 特性 | Weave | loom |
|------|-------|------|
| 语言 | Rust | Python |
| GUI | egui (原生桌面) | Web |
| 本地模型 | ✅ llama.cpp (drama_llama) | ❌ |
| 在线模型 | ✅ OpenAI | ✅ OpenAI |
| 树形编辑 | ✅ 完整支持 | ✅ 完整支持 |
| 力导向布局 | ✅ 自研算法 | ❌ |
| 运行时切换后端 | ✅ | ❌ |
| 流式生成 | ✅ | ✅ |
| 密钥安全 | ✅ 系统密钥链 | ❌ |
| 性能 | ✅ Rust 原生性能 | ❌ Python 较慢 |

Weave 的目标是与 loom 功能对齐，同时提供更好的性能和本地模型支持。

---

## 七、代码质量与工程实践

### 7.1 安全性

```rust
#![forbid(unsafe_code)]  // 全局禁止 unsafe 代码
```

### 7.2 类型安全

- 使用 `static_assertions` 确保关键类型满足 `Send + Sync`
- 泛型 `Node<T>` 允许在不同上下文使用不同的元数据类型
- `derive_more` 和 `thiserror` 提供类型安全的错误处理

### 7.3 测试

```rust
#[test]
fn test_story() {
    let mut story = Story::new("Test".to_string(), "Alice".to_string());
    story.add_paragraph("Alice", ["Hello", " World"]);
    story.add_author("Bob");
    story.add_paragraph(1, ["Goodbye", " World"]);
    story.extend_paragraph(["!"]);
    assert_eq!(story.to_string(), "# Test\nBy:\n- Alice\n- Bob\n\n\nHello World\nGoodbye World!");
}

#[test]
fn test_story_deserialize() {
    // 测试向后兼容性
    let json = std::fs::read_to_string("test/data/sharks.0.0.3.json").unwrap();
    let story: Story = serde_json::from_str(&json).unwrap();
    assert_eq!(story.title, "Electrocuting Sharks");
    assert_eq!(story.root.count(), 23);
}
```

### 7.4 跨平台

- 支持 macOS、Linux、Windows（部分）
- 支持 WebAssembly（通过 eframe 的 wasm 后端）
- 使用条件编译 (`#[cfg(feature = "gui")]`) 分离 GUI 和库代码

---

## 八、对 AI FanFic Workshop 的启示

### 8.1 可借鉴的核心设计

1. **active_path 概念** — `Vec<usize>` 路径表示当前分支位置，简洁而强大。可以与 LangGraph 的 state 结合，让用户在生成的故事中选择不同走向
2. **树形故事结构** — 天然支持"平行宇宙"式创作，用户可以探索同一个故事的多种可能
3. **作者系统** — 区分人类和 AI 的贡献，每个节点记录来源
4. **力导向布局** — 可视化复杂的故事树，帮助用户理解故事结构
5. **Worker 线程模式** — 将 AI 推理放在独立线程，不阻塞 UI
6. **运行时后端切换** — 用户可以根据需要选择不同的 AI 模型

### 8.2 融合方案设想

将 Weave 的**分支树结构**与 FanFic Lab 的**AI Agent 工作流**结合：

```
用户需求 → FanFic Lab 的 LangGraph Agent 生成初始故事
  → 结构化为 Weave 的 Node 树（每个场景/段落为一个节点）
  → 用户可以选择：
    a) 接受当前分支（继续主故事）
    b) 创建新分支（探索不同走向）
    c) 重写某个节点（质量改进）
  → 每个分支可以独立调用 AI Agent 继续生成
  → 最终用户选择最佳路径，合并为完整故事
```

### 8.3 Rust vs TypeScript 选择

- **Weave (Rust)** — 性能优秀，适合本地模型推理和复杂 GUI 渲染，但开发效率较低
- **FanFic Lab (TypeScript)** — 开发效率高，生态丰富，但性能受限
- **建议**：核心 AI Agent 用 TypeScript (LangGraph.js)，树形编辑器可以用 Web 技术（React + Canvas/SVG）实现，或者用 Rust/WASM 实现高性能部分

---

## 九、总结

Weave 是一个设计精巧的分支式写作工具，其核心价值在于：

1. **`Node<T>` 递归树结构** — 简洁而通用，支持任意深度和宽度的故事分支
2. **`active_path` 导航机制** — 类似 git HEAD 的路径索引，优雅地解决了"当前在哪"的问题
3. **力导向布局算法** — 自研的树形可视化算法，支持实时交互调整
4. **双后端 AI 集成** — 本地 llama.cpp + OpenAI API，运行时切换
5. **Worker 线程模式** — 将 AI 推理与 GUI 渲染解耦，保证流畅体验

这些设计理念与 FanFic Lab 的 AI Agent 工作流形成互补，为构建下一代 AI 辅助创作工具提供了重要参考。

---

*报告基于对 Weave v0.0.3 源代码的完整分析，覆盖所有 Rust 源文件（node.rs、story.rs、app.rs、openai.rs、drama_llama.rs、lib.rs、main.rs）。*
