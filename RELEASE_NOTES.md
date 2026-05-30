# 更新日志

## v6.0.0 (2026-05-30)

### 新功能

1. **跨章节张力曲线规划** - 新增 `TensionCurvePlanner` 确定性全书节奏分析器，检测高潮扎堆/低谷过长/节奏单调/突变跳跃4类跨章节节奏问题，为下一章推荐张力目标值，集成到流水线 Phase 8b。

2. **多读者群体评估** - `ReaderAgent` 增强，模拟资深网文读者/新手读者/题材核心受众3种读者群体差异化反馈，包含弃书风险评估。

3. **对话质量专项检测** - 新增 `DialogueAnalyzer` 确定性对话分析器，支持对话/叙述比例计算、对话标签频率统计、重复标签检测、连续对话检测，集成到17维质量审计的 `dialogue` 维度。

4. **角色语言风格档案** - `ObserverAgent` 新增第10类事实提取（语言风格），追踪角色 formality/vocabulary/sentenceLength/quirks/catchphrases 等语言特征。

5. **改稿二次验证** - 新增 `RevisionVerifier`，审计-修订循环中不再盲目标记 fixedIssues，两级验证：Level 1 确定性验证（长度/重复段/敏感词）+ Level 2 LLM 验证。

6. **ComposerAgent LLM 裁剪** - 章节数 ≥ 20 时自动启用 LLM 语义裁剪，对 `chapterSummaries` 和 `characterMatrix` 做相关性评分，仅保留高相关条目，最长2次 LLM 调用，失败回退到 smartTrim。

7. **项目ID一致性修复** - 修复 `StateSettler` 中 `__pending__` projectId 占位符问题，确保所有 `StateEvent` 都有正确的 projectId，添加兜底校验。

### 改进

- `ContinuityAuditor` 新增 `dialogue` 审计维度，集成对话质量分析
- `PipelineRunner` 新增 Phase 8b 张力曲线分析阶段
- `ChapterReviewCycle` 集成 RevisionVerifier 验证结果，未修复问题提升优先级
- `PostWriteValidator` 支持敏感词检测开关控制
- 项目配置新增 `enableSensitiveWordCheck` 和 `enableLLMCompose` 选项
- 生产环境 Mock 数据自动清理机制

### 技术债务清理

- `as any` 断言从 130 处清理至 5 处（仅余2处真实类型不兼容 + 3处测试文件）
- TODO/FIXME 清理完成
- TypeScript 编译零错误
