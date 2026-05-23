# SillyTavern 卡片解析工具设计文档

**日期**: 2026-03-26
**项目**: tavern-parser
**类型**: 独立 CLI 工具

## 概述

创建一个轻量级命令行工具,用于从 SillyTavern 和 TavernAI 的 PNG 图片中提取人物卡和世界书数据,并转换为结构化文档格式,便于后续在 AI Novel Workshop 项目中使用和讨论。

## 目标

### 主要目标
1. 解析 PNG 图片中嵌入的角色卡和世界书数据
2. 自动识别数据类型(人物卡/世界书)
3. 输出多种格式(Markdown、JSON、YAML)便于阅读和程序处理
4. 支持批量处理多个文件

### 非目标
- 不创建图形界面(纯 CLI 工具)
- 不修改或编辑原始卡片数据
- 不实现卡片创建功能(仅解析)

## 技术架构

### 项目结构
```
tavern-parser/
├── package.json           # 项目配置
├── README.md             # 使用文档
├── src/
│   └── index.js          # 主入口文件(单文件架构)
└── output/               # 默认输出目录(自动创建)
```

### 核心依赖
- `pngjs` ^7.0.0 - PNG 图片解析,读取 tEXt/iTXt chunks
- `commander` ^12.0.0 - 命令行参数处理
- `js-yaml` ^4.1.0 - YAML 格式输出
- `chalk` ^5.3.0 - 终端彩色输出(可选)

### 数据流
```
PNG 文件
  ↓
提取 PNG chunks (tEXt/iTXt)
  ↓
解码 Base64 数据
  ↓
解析 JSON
  ↓
识别卡片类型
  ↓
格式化输出
  ↓
生成 MD/JSON/YAML 文件
```

## 功能设计

### 1. 格式支持

#### 1.1 SillyTavern 人物卡
支持的元数据字段:
```javascript
{
  name: "角色名",
  description: "角色描述",
  personality: "性格",
  scenario: "场景设定",
  first_mes: "第一条消息",
  mes_example: "示例对话",
  creator_notes: "创建者备注",
  tags: ["标签数组"],
  avatar: "头像(base64)"
}
```

#### 1.2 Character Card V3 格式
```javascript
{
  spec: "chara_card_v3",
  spec_version: "3.0",
  data: {
    name: "角色名",
    description: "角色描述",
    personality: "性格",
    scenario: "场景设定",
    first_mes: "第一条消息",
    mes_example: "示例对话",
    creator_notes: "创建者备注",
    tags: ["标签数组"],
    avatar: "头像(base64)",
    // V3 特有字段
    system_prompt: "系统提示词",
    post_history_instructions: "历史指令",
    alternate_greetings: ["备用问候语数组"],
    character_book: { /* 内嵌世界书 */ },
    extensions: { /* 自定义扩展字段 */ }
  }
}
```

**V3 与 V2 的区别:**
- 包装在 `data` 字段中
- 添加 `spec` 和 `spec_version` 标识
- 支持更多扩展字段
- 结构化的扩展机制

#### 1.3 TavernAI 人物卡
- 兼容 SillyTavern V2 格式
- 额外支持扩展字段:
  - `system_prompt`
  - `post_history_instructions`
  - `character_book` (内嵌世界书)

#### 1.4 世界书
```javascript
{
  entries: [
    {
      keys: ["关键词1", "关键词2"],
      content: "内容描述",
      enabled: true,
      insertion_order: 0,
      extensions: {}
    }
  ]
}
```

### 2. 内嵌世界书提取策略

#### TavernAI 和 V3 格式的 character_book 字段
当人物卡包含 `character_book` 字段时:
1. **自动提取**为独立的世界书文件
2. **文件命名**: `{角色名}_worldbook.md/json/yaml`
3. **人物卡输出**: 在元数据中添加世界书引用链接
4. **标记来源**: 在世界书元数据中标注来源角色卡

```markdown
## 关联的世界书
此角色卡包含内嵌世界书,已提取为独立文件:
- **文件**: 林清雪_worldbook.md
- **条目数**: 15
```

### 3. 头像处理策略

`avatar` 字段包含 base64 编码的图片数据,需要特殊处理:

#### Markdown 输出
- 不输出头像数据
- 添加备注: `> 头像数据已省略`

#### JSON/YAML 输出
- **默认**: 省略 avatar 字段
- **--include-avatar 选项**: 包含 base64 数据

#### 头像提取选项
```bash
tavern-parser character.png --extract-avatar
```
- 输出独立文件: `{角色名}_avatar.png`
- 在文档中添加引用: `![头像](林清雪_avatar.png)`

### 4. 编码处理

PNG 文本块有不同的编码规则:

- **tEXt chunks**: 使用 Latin-1 (ISO-8859-1) 解码
- **iTXt chunks**: 使用 UTF-8 解码,支持 Unicode
- **zTXt chunks**: 解压后按 Latin-1 解码

**优先级**: iTXt > zTXt > tEXt

**实现**:
```javascript
function decodeTextChunk(chunk) {
  if (chunk.type === 'iTXt') {
    return chunk.text; // 已是 UTF-8
  } else if (chunk.type === 'zTXt') {
    return zlib.inflateSync(chunk.compressedText).toString('latin1');
  } else if (chunk.type === 'tEXt') {
    return chunk.text.toString('latin1');
  }
}
```

### 5. 自动识别逻辑

```javascript
function detectCardType(metadata, data) {
  // 优先级检测

  // 1. Character Card V3 格式
  if (metadata.ccv3 || (data.spec && data.spec_version)) {
    return {
      type: 'character',
      format: 'ccv3',
      version: data.spec_version || '3.0'
    };
  }

  // 2. 人物卡 (V2 格式)
  if (data.chara || data.name) {
    // 检测 TavernAI 特有字段
    const isTavernAI = data.system_prompt ||
                       data.post_history_instructions ||
                       data.character_book;

    return {
      type: 'character',
      format: isTavernAI ? 'tavernai' : 'sillytavern',
      hasWorldBook: !!data.character_book
    };
  }

  // 3. 世界书
  if (data.entries && Array.isArray(data.entries)) {
    return {
      type: 'worldbook',
      format: 'sillytavern',
      entryCount: data.entries.length
    };
  }

  // 4. 未知格式
  return {
    type: 'unknown',
    format: 'unknown',
    data: data
  };
}
```

**识别优先级**:
1. Character Card V3 (ccv3 chunk 或 spec 字段)
2. SillyTavern/TavernAI V2 (chara chunk 或 name 字段)
3. 世界书 (entries 数组)
4. 未知格式

### 3. PNG 元数据提取

PNG 文件在 `tEXt`、`iTXt` 或 `zTXt` chunks 中存储文本元数据:
- `chara` - SillyTavern 字符卡字段(Base64 编码的 JSON)
- `ccv3` - Character Card V3 格式
- 其他自定义字段

提取步骤:
1. 使用 `pngjs` 解析 PNG chunks
2. 过滤文本类型的 chunks (`tEXt`, `iTXt`)
3. 查找关键字段(`chara`, `ccv3` 等)
4. Base64 解码
5. JSON 解析

### 4. 数据验证

完整的验证流程确保数据完整性:

```javascript
function validateCardData(metadata, data) {
  const errors = [];
  const warnings = [];

  // 1. PNG chunk 完整性检查
  if (!metadata.chara && !metadata.ccv3) {
    errors.push('未找到有效的卡片元数据 chunk');
  }

  // 2. Base64 解码验证
  try {
    // 解码已在提取阶段完成
  } catch (error) {
    errors.push(`Base64 解码失败: ${error.message}`);
  }

  // 3. JSON 解析验证
  try {
    // 解析已在提取阶段完成
  } catch (error) {
    errors.push(`JSON 解析失败: ${error.message}`);
  }

  // 4. 必需字段检查
  if (data.name || data.chara) {
    if (!data.name) {
      warnings.push('人物卡缺少 name 字段');
    }
  } else if (data.entries) {
    if (!Array.isArray(data.entries)) {
      errors.push('世界书 entries 字段必须是数组');
    }
  } else {
    errors.push('无法识别卡片类型: 缺少必需字段');
  }

  // 5. 字符编码检查
  // 已在编码处理阶段完成

  return { valid: errors.length === 0, errors, warnings };
}
```

### 5. 文件冲突处理

当输出文件已存在时:

**默认行为**: 跳过并警告
```bash
⚠️  文件已存在,跳过: output/character.md
使用 --force 覆盖或 --suffix 添加后缀
```

**命令行选项**:
```bash
# 强制覆盖已存在的文件
tavern-parser character.png --force

# 自动添加数字后缀
tavern-parser character.png --suffix
# 输出: character_1.md, character_1.json, character_1.yaml
```

**实现逻辑**:
```javascript
function resolveOutputPath(basePath, format, options) {
  let outputPath = `${basePath}.${format}`;

  if (fs.existsSync(outputPath)) {
    if (options.force) {
      return outputPath; // 覆盖
    } else if (options.suffix) {
      let counter = 1;
      while (fs.existsSync(`${basePath}_${counter}.${format}`)) {
        counter++;
      }
      return `${basePath}_${counter}.${format}`;
    } else {
      console.warn(`⚠️  文件已存在,跳过: ${outputPath}`);
      return null; // 跳过
    }
  }

  return outputPath;
}
```

### 6. 文件输入处理

支持多种输入方式:

```bash
# 单个文件
tavern-parser character.png

# 通配符 (Unix/Linux/Mac shell 自动展开)
tavern-parser *.png

# 通配符 (Windows 需要引号)
tavern-parser "*.png"

# 目录 (工具内置 glob 展开)
tavern-parser ./cards/
```

**跨平台支持**:
```javascript
function getInputFiles(pattern) {
  // 内置 glob 展开,支持所有平台
  return glob.sync(pattern, {
    nodir: true,
    absolute: true
  });
}
```

## 命令行接口

### 基本用法
```bash
# 安装
npm install -g tavern-parser

# 基本用法
tavern-parser character.png

# 指定输出目录
tavern-parser character.png -o ./output/

# 批量处理
tavern-parser *.png -o ./parsed/

# 显示详细信息
tavern-parser character.png --verbose

# 只输出特定格式
tavern-parser character.png --format json
tavern-parser character.png --format markdown
tavern-parser character.png --format yaml

# 显示帮助
tavern-parser --help
```

### 参数设计
- `-o, --output <dir>` - 输出目录(默认: `./output/`)
- `-f, --format <format>` - 输出格式: all/markdown/json/yaml(默认: `all`)
- `--force` - 覆盖已存在的文件
- `--suffix` - 文件冲突时自动添加数字后缀
- `--extract-avatar` - 提取头像为独立 PNG 文件
- `--include-avatar` - 在 JSON/YAML 输出中包含 avatar 字段
- `-v, --verbose` - 显示详细处理信息
- `-h, --help` - 显示帮助信息

## 输出设计

### 文件命名规则
```
输入: my_character.png
输出:
  - my_character.md       # Markdown 文档
  - my_character.json     # JSON 数据
  - my_character.yaml     # YAML 数据
```

### Markdown 输出格式

#### 人物卡模板
```markdown
# 角色名: {name}

## 基本信息
- **来源**: SillyTavern / TavernAI
- **创建者备注**: {creator_notes}
- **标签**: {tags}

## 角色描述
{description}

## 性格特点
{personality}

## 场景设定
{scenario}

## 第一条消息
> {first_mes}

## 示例对话
{mes_example}

---
*解析自 SillyTavern 人物卡*
*导出时间: {timestamp}*
```

#### 世界书模板
```markdown
# 世界书: {filename}

## 条目列表

### 条目 1
- **关键词**: {keys}
- **内容**: {content}
- **状态**: {enabled ? '启用' : '禁用'}
- **插入顺序**: {insertion_order}

### 条目 2
...

---
*解析自 SillyTavern 世界书*
*总条目数: {count}*
*导出时间: {timestamp}*
```

### JSON 输出格式
```json
{
  "type": "character",
  "data": {
    "name": "...",
    "description": "...",
    "personality": "...",
    "scenario": "...",
    "first_mes": "...",
    "mes_example": "...",
    "tags": [],
    "creator_notes": "..."
  },
  "metadata": {
    "source": "SillyTavern",
    "format": "character_card_v2",
    "parsed_at": "2026-03-26T12:00:00Z",
    "original_file": "character.png"
  }
}
```

### YAML 输出格式
```yaml
type: character
data:
  name: 角色名
  description: |
    完整的角色描述...
  personality: |
    性格描述...
  scenario: |
    场景设定...
  first_mes: |
    第一条消息...
  mes_example: |
    示例对话...
  tags:
    - 标签1
    - 标签2
  creator_notes: 创建者备注
metadata:
  source: SillyTavern
  format: character_card_v2
  parsed_at: '2026-03-26T12:00:00Z'
  original_file: character.png
```

## 错误处理

### 错误类型
1. **文件不存在** - 提示文件路径错误
2. **非 PNG 文件** - 提示格式不支持
3. **无元数据** - PNG 中未找到卡片数据
4. **解析失败** - JSON 解析错误或 Base64 解码错误
5. **未知格式** - 不识别的卡片类型

### 错误处理策略
```javascript
try {
  // 解析流程
} catch (error) {
  if (error.code === 'ENOENT') {
    console.error('文件不存在:', filepath);
  } else if (error instanceof PNGError) {
    console.error('无效的 PNG 文件:', filepath);
  } else if (error instanceof MetadataError) {
    console.error('未找到卡片元数据:', filepath);
  } else {
    console.error('解析失败:', error.message);
  }
  process.exit(1);
}
```

### 容错机制
- 跳过无法解析的文件,继续处理其他文件
- 详细模式下显示每个文件的处理状态
- 批量处理时生成汇总报告

### 批量处理汇总报告

批量处理多个文件后,显示汇总统计:

```bash
处理完成:
✅ 成功: 15 个文件
❌ 失败: 2 个文件
⚠️  跳过: 1 个文件

失败文件:
- invalid.png: 无效的 PNG 格式
- corrupt.png: 未找到卡片元数据

跳过文件:
- existing.png: 文件已存在,使用 --force 覆盖

输出统计:
- 人物卡: 12 个
- 世界书: 3 个
- 内嵌世界书: 5 个 (已提取)
- 总条目: 1,247 KB
```

**实现**:
```javascript
class BatchProcessor {
  constructor() {
    this.stats = {
      success: 0,
      failed: 0,
      skipped: 0,
      errors: [],
      skippedFiles: [],
      cardTypes: { character: 0, worldbook: 0 },
      embeddedWorldBooks: 0,
      totalSize: 0
    };
  }

  printSummary() {
    console.log('处理完成:');
    console.log(`✅ 成功: ${this.stats.success} 个文件`);
    console.log(`❌ 失败: ${this.stats.failed} 个文件`);
    console.log(`⚠️  跳过: ${this.stats.skipped} 个文件\n`);

    if (this.stats.errors.length > 0) {
      console.log('失败文件:');
      this.stats.errors.forEach(e => {
        console.log(`- ${e.file}: ${e.reason}`);
      });
      console.log('');
    }

    if (this.stats.skippedFiles.length > 0) {
      console.log('跳过文件:');
      this.stats.skippedFiles.forEach(s => {
        console.log(`- ${s.file}: ${s.reason}`);
      });
      console.log('');
    }

    console.log('输出统计:');
    console.log(`- 人物卡: ${this.stats.cardTypes.character} 个`);
    console.log(`- 世界书: ${this.stats.cardTypes.worldbook} 个`);
    console.log(`- 内嵌世界书: ${this.stats.embeddedWorldBooks} 个 (已提取)`);
    console.log(`- 总大小: ${this.formatSize(this.stats.totalSize)}`);
  }

  formatSize(bytes) {
    return bytes > 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${bytes} B`;
  }
}
```

## 实现细节

### 主函数流程
```javascript
async function main() {
  // 1. 解析命令行参数
  const options = parseArgs();

  // 2. 获取输入文件列表
  const files = getInputFiles(options.input);

  // 3. 确保输出目录存在
  ensureOutputDir(options.output);

  // 4. 处理每个文件
  for (const file of files) {
    try {
      await processFile(file, options);
    } catch (error) {
      handleError(error, file, options.verbose);
    }
  }

  // 5. 输出处理汇总
  printSummary();
}
```

### 文件处理函数
```javascript
async function processFile(filepath, options) {
  // 1. 读取 PNG 文件
  const png = await readPNG(filepath);

  // 2. 提取元数据
  const metadata = extractMetadata(png);

  // 3. 解析卡片数据
  const cardData = parseCardData(metadata);

  // 4. 识别类型
  const cardType = detectCardType(cardData);

  // 5. 生成输出文件
  const outputs = generateOutputs(cardData, cardType, options.format);

  // 6. 写入文件
  await writeOutputs(outputs, options.output, filepath);
}
```

## 测试计划

### 单元测试
- PNG chunk 提取逻辑
- Base64 解码逻辑
- JSON 解析逻辑
- 卡片类型识别
- 输出格式生成

### 集成测试
- 完整解析流程
- 批量文件处理
- 错误处理场景

### 测试数据
需要准备:
- 标准的 SillyTavern 人物卡 PNG
- TavernAI 人物卡 PNG
- 世界书 PNG
- 无效的 PNG 文件
- 无元数据的 PNG 文件

## 部署与发布

### NPM 发布
```bash
# 构建
npm run build

# 发布
npm publish
```

### 全局安装
```bash
npm install -g tavern-parser
```

### package.json 配置
```json
{
  "name": "tavern-parser",
  "version": "1.0.0",
  "description": "解析 SillyTavern 人物卡和世界书的 CLI 工具",
  "bin": {
    "tavern-parser": "./src/index.js"
  },
  "keywords": ["sillytavern", "character-card", "world-book", "parser"],
  "license": "MIT"
}
```

## 未来扩展

### 可能的增强功能
1. **卡片对比** - 比较两张卡片的差异
2. **格式转换** - 在不同格式间转换
3. **数据验证** - 验证卡片数据完整性
4. **图片提取** - 提取嵌入的头像图片
5. **批量合并** - 合并多个世界书
6. **Web UI** - 添加简单的 Web 界面

### 集成到 AI Novel Workshop
此工具独立运行,生成的文档可以直接用于:
- 在 AI Novel Workshop 中导入人物设定
- 讨论功能开发需求
- 作为测试数据源

## 成功标准

### 功能完整性
- ✅ 成功解析 SillyTavern 人物卡
- ✅ 成功解析 TavernAI 人物卡
- ✅ 成功解析世界书
- ✅ 正确识别卡片类型
- ✅ 输出 Markdown/JSON/YAML 三种格式
- ✅ 支持批量处理

### 用户体验
- ✅ 命令行参数简单明了
- ✅ 错误提示清晰友好
- ✅ 输出格式易读
- ✅ 文档完整

### 技术质量
- ✅ 无原生依赖,跨平台运行
- ✅ 错误处理完善
- ✅ 代码结构清晰
- ✅ 性能良好(单文件 < 1秒)

## 风险与限制

### 技术限制
- PNG chunks 大小限制(通常足够容纳卡片数据)
- 某些特殊格式可能无法识别
- Base64 编码增加数据大小

### 已知问题
- 无(待实现后测试)

### 风险缓解
- 提供详细错误信息
- 支持跳过错误文件继续处理
- 提供调试模式输出详细信息

## 时间估算

- **开发时间**: 2-4 小时
- **测试时间**: 1-2 小时
- **文档编写**: 1 小时
- **总计**: 4-7 小时

## 总结

`tavern-parser` 是一个轻量级、易用的命令行工具,用于从 PNG 图片中提取 SillyTavern 和 TavernAI 的角色卡及世界书数据。通过支持多种输出格式和批量处理,为用户提供了便捷的数据提取和转换能力,为后续在 AI Novel Workshop 项目中讨论功能开发提供结构化的文档支持。
