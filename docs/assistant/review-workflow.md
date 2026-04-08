# 审校工作流指南

系统提供了通过不同“角色”进行交叉审核的功能。这些审校输出会被结构化，并自动在面板“建议”页签中生成工单列表。

## 审校角色与职责

1.  **consistency (一致性审查员)**
    *   职责：主要防吃书、核对世界观设定。
    *   审查维度：地名匹配、人物关系匹配、时间线冲突等。
    *   映射分类：`consistency`

2.  **quality (质量评估员)**
    *   职责：文本基本功、描写反馈。
    *   审查维度：对话真实度、用词水准、段落冗余度。
    *   映射分类：`quality`

3.  **editor (主编)**
    *   职责：商业节奏、剧情拉扯度、期待感。
    *   审查维度：是否有记忆点、结尾悬念是否恰当。
    *   映射分类：`optimization`

## AI 返回数据格式标准

AI 生成的结构化内容格式如下，所有审校角色通用该返回标准：

```json
[
  {
    "title": "具体冲突或优点标题",
    "message": "详细描述原因和修改建议",
    "category": "consistency|quality|optimization",
    "priority": "high|medium|low",
    "actions": [
      {
        "type": "navigate",
        "label": "去看看",
        "navigateTarget": "/chapters/1"
      }
    ]
  }
]
```

## 手动验收测试单

开发者与 QA 人员请使用以下单据测试回归工作流：

- [ ] `/review` 不带参数时，提示消息触发成功，`SuggestionsStore` 生成分类为 `consistency` 的建议。
- [ ] `/review quality` 输入成功，并且得到的是关于段落质量的建议。
- [ ] 点击生成建议上的 "去看看" 或等效 actions 时，路由执行正确，能够正确分发 Action Payload。
- [ ] 助手收到普通文本时不应进入 command registry。
- [ ] 错误命令 `/unknown` 抛出并展示“未知的命令”或“不支持的类型”。
