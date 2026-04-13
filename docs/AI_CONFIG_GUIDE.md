# AI 配置快速指南

## 📋 目录
- [快速开始](#快速开始)
- [配置步骤](#配置步骤)
- [常见问题](#常见问题)
- [故障排查](#故障排查)
- [最佳实践](#最佳实践)

## 快速开始

### 支持的 AI 提供商

| 提供商 | 类型 | API Base URL | 推荐模型 |
|--------|------|--------------|----------|
| OpenAI | openai | https://api.openai.com/v1 | gpt-4o, gpt-4o-mini |
| Anthropic | anthropic | https://api.anthropic.com/v1 | claude-opus-4-6, claude-sonnet-4-6, claude-haiku-4-5 |
| 智谱AI | custom | https://open.bigmodel.cn/api/paas/v4 | glm-4, glm-3-turbo |
| 通义千问 | custom | https://dashscope.aliyuncs.com/compatible-mode/v1 | qwen-turbo, qwen-plus |
| DeepSeek | custom | https://api.deepseek.com/v1 | deepseek-chat |
| Moonshot | custom | https://api.moonshot.cn/v1 | moonshot-v1-8k |

### 推荐配置

**高质量创作（推荐）**：
- 提供商：Anthropic
- 模型：claude-sonnet-4-6
- 温度：0.8
- Max Tokens：4000

**快速生成**：
- 提供商：OpenAI
- 模型：gpt-4o-mini
- 温度：0.9
- Max Tokens：3000

**成本优化**：
- 提供商：DeepSeek
- 模型：deepseek-chat
- 温度：0.85
- Max Tokens：3000

## 配置步骤

### 步骤 1：获取 API 密钥

**OpenAI**：
1. 访问 https://platform.openai.com/api-keys
2. 登录或注册账号
3. 点击 "Create new secret key"
4. 复制密钥（以 `sk-` 开头）

**Anthropic**：
1. 访问 https://console.anthropic.com/
2. 登录或注册账号
3. 在 API Keys 页面创建新密钥
4. 复制密钥

**智谱AI**：
1. 访问 https://open.bigmodel.cn/
2. 登录或注册账号
3. 在 API 密钥页面创建密钥
4. 复制密钥

### 步骤 2：配置项目

1. 打开 AI小说工坊
2. 进入"配置"页面
3. 点击"添加提供商"
4. 填写配置：

   ```json
   {
     "名称": "OpenAI GPT-4",
     "类型": "openai",
     "Base URL": "https://api.openai.com/v1",
     "API 密钥": "sk-your-api-key-here",
     "模型": ["gpt-4", "gpt-4-turbo"]
   }
   ```

5. 点击"测试连接"验证配置
6. 保存配置

### 步骤 3：选择模型

在配置页面中：
- **规划模型**：用于大纲生成、世界观创建（推荐高质量模型）
- **写作模型**：用于章节生成、人物创建（推荐平衡模型）
- **检查模型**：用于质量检查、冲突检测（推荐快速模型）

### 步骤 4：配置高级设置（可选）

**温度 (Temperature)**：
- 0.0-0.3：非常保守，适合事实性内容
- 0.4-0.7：适中，适合一般创作
- 0.8-1.0：创造性强，适合小说创作（推荐 0.85）

**Top P**：
- 0.9-1.0：推荐值（保持默认）

**Max Tokens**：
- 世界观生成：2000-4000
- 人物生成：1500-3000
- 大纲生成：6000-10000
- 章节生成：3000-5000

## 常见问题

### Q1: 测试连接失败怎么办？

**检查清单**：
- [ ] API 密钥是否正确（没有多余空格）
- [ ] Base URL 是否正确
- [ ] 网络是否可以访问 API（某些地区需要代理）
- [ ] 账户是否有余额
- [ ] 模型名称是否正确

**调试步骤**：
```javascript
// 打开浏览器控制台（F12）
// 查看 Console 标签页
// 搜索 "AI服务初始化" 查看详细日志
```

### Q2: 生成失败怎么办？

**错误类型诊断**：

| 错误信息 | 可能原因 | 解决方案 |
|---------|---------|----------|
| `401 Unauthorized` | API 密钥错误 | 检查密钥是否正确 |
| `404 Not Found` | 模型不存在 | 检查模型名称 |
| `429 Too Many Requests` | 请求过快 | 等待几分钟后重试 |
| `Claude provider not configured` | 提供商配置错误 | 检查是否启用提供商 |
| `Network Error` | 网络连接失败 | 检查网络和 Base URL |

### Q3: 如何优化生成质量？

**提升质量的方法**：
1. **完善世界观设定**：提供详细的世界观信息
2. **创建详细人物**：为人物添加详细的性格、背景
3. **优化提示词**：在 Author's Note 中添加风格指导
4. **使用高质量模型**：如 GPT-4o 或 Claude-Sonnet-4-6
5. **调整温度参数**：提高温度增加创造性

### Q4: 如何降低成本？

**成本优化策略**：
1. **使用国内模型**：智谱AI、通义千问成本较低
2. **优化提示词**：减少不必要的上下文
3. **调整温度**：较低温度减少重试次数
4. **批量生成**：一次生成多章节比分次生成更省
5. **使用表格记忆**：节省 70% tokens

### Q5: 支持自定义提供商吗？

**是的！** 支持任何 OpenAI 兼容的 API：

1. 选择"自定义"提供商类型
2. 填写 Base URL（如：`https://your-api.com/v1`）
3. 填写 API 密钥
4. 填写模型名称

**支持的自定义提供商**：
- 本地部署的 LLM（如 Ollama）
- 第三方 API 代理
- 自己部署的模型服务

## 故障排查

### 诊断工具

在配置页面点击"测试连接"按钮，系统会自动诊断：

1. **网络连接**：检查是否可以访问 Base URL
2. **API 认证**：验证 API 密钥是否有效
3. **模型可用性**：检查模型是否存在
4. **账户余额**：（部分提供商）检查配额

### 详细日志

启用详细日志：

```javascript
// 在浏览器控制台中执行
localStorage.setItem('DEBUG_AI', 'true')
// 刷新页面
location.reload()
// 查看控制台输出
```

**关键日志**：
- `[AI Store] AI服务初始化成功` - 初始化成功
- `[AI Store] 使用配置的模型: xxx` - 模型选择
- `[AI Store] API请求失败` - 请求失败
- `[AI Store] 错误诊断` - 详细诊断信息

### 常见错误代码

| 错误代码 | 说明 | 解决方案 |
|---------|------|----------|
| `ECONNREFUSED` | 无法连接服务器 | 检查 Base URL 和网络 |
| `ENOTFOUND` | DNS 解析失败 | 检查 Base URL 是否正确 |
| `ETIMEDOUT` | 连接超时 | 检查网络或使用代理 |
| `400 Bad Request` | 请求参数错误 | 检查模型名称和参数 |
| `401 Unauthorized` | 认证失败 | 检查 API 密钥 |
| `403 Forbidden` | 权限不足 | 检查账户权限 |
| `404 Not Found` | 资源不存在 | 检查模型名称和 URL |
| `429 Rate Limit` | 请求过快 | 等待后重试 |
| `500 Server Error` | 服务器错误 | 稍后重试或联系提供商 |

## 最佳实践

### 1. 提示词优化

**世界观生成**：
```
请为【玄幻修仙】类型的小说创建世界观设定。
主题：修仙者在修炼世界中的成长和探索
风格：传统修仙，强调境界提升和宗门纷争
要求：
- 设定清晰的修炼体系（练气、筑基、金丹、元婴等）
- 设计 3-5 个主要势力
- 创建独特的世界规则
```

**人物生成**：
```
创建一个主角：
姓名：李明轩
年龄：18岁
性格：勇敢、聪明、有正义感，但有时冲动
背景：小村庄出身，父母失踪，天赋异禀
目标：寻找父母，成为最强者
修炼天赋：顶级（百年难遇）
```

### 2. 模型选择策略

| 任务类型 | 推荐模型 | 原因 |
|---------|---------|------|
| 世界观生成 | Claude-Opus-4-6 / GPT-4o | 需要创造力和一致性 |
| 大纲生成 | Claude-Sonnet-4-6 | 平衡质量和成本 |
| 章节生成 | Claude-Sonnet-4-6 / GPT-4o | 质量和成本平衡 |
| 人物生成 | GPT-4o-mini / DeepSeek | 快速且成本低 |
| 质量检查 | Claude-Haiku-4-5 / DeepSeek | 快速分析 |

### 3. Token 优化

**减少 Token 使用**：
- 使用表格记忆系统（节省 70%）
- 合理设置 Max Tokens
- 避免重复内容
- 使用摘要功能

**监控成本**：
- 定期检查账户余额
- 在配置中设置每日成本限制
- 查看生成统计面板

### 4. 批量生成建议

**最佳实践**：
1. 先生成世界观和人物
2. 创建详细大纲
3. 分批生成章节（每次 3-5 章）
4. 定期检查一致性
5. 使用表格记忆跟踪状态

**避免**：
- 一次生成过多章节
- 没有大纲就生成章节
- 忽略质量检查

## 获取帮助

### 文档资源
- [表格记忆系统](./table-memory-system.md)
- [AI 集成设计](./ai-integration-design.md)
- [架构设计](./architecture.md)

### 社区支持
- GitHub Issues: https://github.com/your-repo/ai-novel-workshop/issues
- 用户社区: （待添加）

### 技术支持
如遇到问题，请提供：
1. 错误信息截图
2. 浏览器控制台日志
3. 配置信息（隐藏 API 密钥）
4. 复现步骤

---

**最后更新**：2026-04-13
