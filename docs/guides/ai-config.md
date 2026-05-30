# AI Configuration Guide

This guide covers AI provider setup, model selection, context management, and cost optimization for AI Novel Workshop.

## Supported Providers

### OpenAI

| Field | Value |
|-------|-------|
| Provider type | `openai` |
| Base URL | `https://api.openai.com/v1` |
| Recommended models | `gpt-4o`, `gpt-4o-mini` |
| Streaming | Supported |
| Tool Calling | Supported |

### Anthropic

| Field | Value |
|-------|-------|
| Provider type | `anthropic` |
| Base URL | `https://api.anthropic.com` |
| Recommended models | `claude-opus-4-6`, `claude-sonnet-4-6`, `claude-haiku-4-5` |
| Streaming | Supported |
| Tool Calling | Supported |

### Custom (OpenAI-Compatible)

Any service implementing the OpenAI chat completions API:

| Provider | Base URL | Recommended Models |
|----------|----------|--------------------|
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| Zhipu AI | `https://open.bigmodel.cn/api/paas/v4` | `glm-4`, `glm-3-turbo` |
| Tongyi Qianwen | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-turbo`, `qwen-plus` |
| Moonshot | `https://api.moonshot.cn/v1` | `moonshot-v1-8k` |
| Ollama (local) | `http://localhost:11434/v1` | `qwen2.5:7b`, `glm4:9b` |

## Model Role Assignment

The system uses a tiered model strategy with three roles:

### Planner Model

**Purpose**: Outline generation, world building, narrative planning, conflict analysis

**Requirements**: Highest reasoning ability, consistency, and creativity

**Recommendations**:
- Best: `claude-opus-4-6` or `gpt-4o`
- Good: `claude-sonnet-4-6`
- Budget: `deepseek-chat`

The Planner model is used for tasks that determine the direction of the entire novel. Investing in a high-quality model here has the largest impact on overall output quality.

### Writer Model

**Purpose**: Chapter generation, dialogue writing, scene description

**Requirements**: Strong creative writing, consistency with context, natural language

**Recommendations**:
- Best: `claude-sonnet-4-6` or `gpt-4o`
- Good: `gpt-4o-mini`
- Budget: `deepseek-chat` or `qwen-plus`

The Writer model does the most API calls. Balance quality against cost here.

### Sentinel Model

**Purpose**: Quality checks, consistency validation, revision verification, state extraction

**Requirements**: Fast response, good at structured analysis, reliable JSON output

**Recommendations**:
- Best: `claude-haiku-4-5`
- Good: `gpt-4o-mini`
- Budget: `deepseek-chat` or local Ollama models

Speed and cost efficiency matter more than creative quality for the Sentinel role.

### Extractor Model

**Purpose**: Entity and state event extraction from generated or imported text

**Requirements**: Reliable Tool Calling / structured JSON output

**Recommendations**:
- Best: `claude-sonnet-4-6` or `gpt-4o`
- Good: `claude-haiku-4-5`
- Budget: Any model with reliable Tool Calling support

## Configuration Steps

### Step 1: Add a Provider

1. Open your project's settings
2. Navigate to **AI Configuration** (AI配置)
3. Click **Add Provider** (添加提供商)
4. Select the provider type
5. Enter the base URL and API key
6. Click **Test Connection** to verify

API keys are stored encrypted in localStorage (browser mode) or in the SQLite database (desktop mode). The encryption helpers are in `src/utils/crypto.ts`.

### Step 2: Select Models

After adding a provider, assign models to each role:

1. In the model selection dropdown, choose a model for each tier
2. The system displays model metadata: context window size, cost per token
3. Models can be shared across roles or use different models per role

### Step 3: Set Advanced Parameters

| Parameter | Description | Recommended Value |
|-----------|-------------|-------------------|
| Temperature | Randomness of generation | 0.8-0.9 for writing, 0.3-0.5 for planning |
| Top P | Nucleus sampling threshold | 0.9-1.0 |
| Max Tokens | Maximum output length per request | 3000-5000 for chapters, 6000-10000 for outlines |
| Frequency Penalty | Penalize repeated tokens | 0.0-0.3 |
| Presence Penalty | Penalize repeated topics | 0.0-0.3 |
| Max Context Tokens | Total context window budget | Match your model's limit (e.g., 128000) |

## Context Window Management

### Three-Layer Memory Architecture

The context builder (`src/utils/contextBuilder.ts`) assembles generation context from three memory layers:

**Short-term Memory** (most recent chapters):
- Last 3 chapters in full text
- ~9,000-15,000 tokens
- Provides immediate narrative continuity

**Medium-term Memory** (recent summaries):
- Summaries of chapters 4-30 (with decreasing detail)
  - Chapters 4-10: Detailed summaries (~500 words each)
  - Chapters 11-30: Brief summaries (~200 words each)
  - Beyond 30: Minimal summaries (~100 words each)
- ~5,000-10,000 tokens total
- Maintains plot thread awareness

**Long-term Memory** (entities and retrieval):
- Resolved entity states (characters, factions, locations, lore)
- Vector retrieval results (OP-RAG algorithm, sorted by chapter order)
- ~3,000-5,000 tokens
- Ensures setting consistency

### Token Budget Allocation

A typical context budget breakdown:

| Component | Tokens | Priority |
|-----------|--------|----------|
| System prompt + iron rules (dead/sealed status) | 2,000 | Highest |
| Entity and state event info | 1,800 | High |
| Active character info + recent events | 1,500 | High |
| Entity/StateEvent state memory | 1,500 | Dynamic |
| Long-term memory (vector retrieval) | 2,000 | Medium |
| Short-term memory (last 3 chapters) | 6,000 | Fixed |
| Current chapter outline | 500 | Fixed |
| **Total context** | **~15,300** | |
| **Remaining for generation** | **~8,000** | |

### LLM-Compose Context Trimming (v6.0+)

For projects with 20+ chapters, the system can use an LLM to semantically trim the context:

- Enabled by default via `enableLLMCompose` in project config
- Scores chapter summaries and character matrix entries for relevance to the current chapter
- Keeps only high-relevance items, reducing token waste
- The ComposerAgent handles this automatically during pipeline execution

### Configuring Context Parameters

In **Advanced Settings** (高级设置):

| Setting | Description | Default |
|---------|-------------|---------|
| `maxContextTokens` | Maximum total context window | 128,000 |
| `recentChaptersCount` | Number of recent chapters to include in full | 3 |
| `targetWordCount` | Target words per generated chapter | 2,000 |
| `targetChapters` | Total planned chapters | 100 |

## Cost Optimization Strategies

### 1. Use the Right Model for Each Task

Not every task needs the most expensive model:

- **Outline/world generation**: Use a premium model (high impact, infrequent calls)
- **Chapter generation**: Use a balanced model (frequent calls, moderate quality needs)
- **Quality checks and extraction**: Use a fast/cheap model (analytical task, not creative)

### 2. Enable Zero-Touch Extraction

Set `enableZeroTouchExtraction: true` to skip entity extraction for low-impact chapters. The semantic boundary interceptor detects when a chapter contains only casual dialogue or travel with no state changes, and skips the extraction API call entirely.

### 3. Use Local Models for Extraction

If you have a local Ollama setup, assign a local model to the Extractor role. Entity extraction from well-structured text is a task that smaller local models handle adequately.

### 4. Optimize Context Size

- Reduce `recentChaptersCount` if your chapters are long
- Enable `enableLLMCompose` to trim irrelevant context in large projects
- Use the vector retrieval system instead of packing more full chapters into context

### 5. Batch Generation Efficiency

When batch-generating chapters, the system:
- Shares context assembly across chapters where possible
- Caches extraction results between chapters
- Skips redundant quality checks for low-risk chapters

### 6. Monitor Costs

The system tracks API costs per chapter. Set `maxCostPerChapter` in project config to cap spending. The generation scheduler stops and warns you when the limit is reached.

## Recommended Configurations

### High Quality (Recommended for First Draft)

```
Planner:   Claude Opus 4.6    (temperature: 0.7)
Writer:    Claude Sonnet 4.6  (temperature: 0.85)
Sentinel:  Claude Haiku 4.5   (temperature: 0.3)
Extractor: Claude Sonnet 4.6  (temperature: 0.2)
```

Best for: Getting the highest quality first draft. Higher cost per chapter but fewer revision rounds needed.

### Balanced (Production Writing)

```
Planner:   Claude Sonnet 4.6  (temperature: 0.7)
Writer:    Claude Sonnet 4.6  (temperature: 0.85)
Sentinel:  Claude Haiku 4.5   (temperature: 0.3)
Extractor: Claude Haiku 4.5   (temperature: 0.2)
```

Best for: Extended writing sessions. Good quality at moderate cost.

### Budget (Cost-Conscious)

```
Planner:   DeepSeek Chat      (temperature: 0.7)
Writer:    DeepSeek Chat      (temperature: 0.85)
Sentinel:  DeepSeek Chat      (temperature: 0.3)
Extractor: Ollama local model (temperature: 0.2)
```

Best for: Exploring ideas, generating drafts to refine later. Lowest cost, may need more revision rounds.

### Hybrid (Maximum Flexibility)

```
Planner:   Claude Opus 4.6    (temperature: 0.7)
Writer:    GPT-4o             (temperature: 0.85)
Sentinel:  GPT-4o-mini        (temperature: 0.3)
Extractor: Ollama local model (temperature: 0.2)
```

Best for: Leveraging the strengths of different providers. Premium model for planning, different creative style for writing, fast model for checks.

## Troubleshooting

### Connection Test Fails

1. Verify the API key is correct (no trailing spaces)
2. Check the base URL matches the provider's documentation
3. Confirm network access (some regions require a proxy for OpenAI/Anthropic)
4. Verify your account has available credits
5. Check that the model name is spelled correctly

### Generation Returns Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `401 Unauthorized` | Invalid API key | Re-check your key |
| `404 Not Found` | Model does not exist | Verify model name |
| `429 Too Many Requests` | Rate limit hit | Wait a few minutes, or reduce batch size |
| `Network Error` | Cannot reach API | Check network and base URL |
| `Context length exceeded` | Too much context | Reduce `recentChaptersCount` or enable `enableLLMCompose` |

### Enabling Debug Logs

```javascript
// In browser console
localStorage.setItem('DEBUG_AI', 'true')
location.reload()
```

Key log prefixes to look for:
- `[AI Store]` -- Provider initialization and model selection
- `[generation:scheduler]` -- Chapter generation flow
- `[sandbox:store]` -- Entity and state event operations
- `[pipeline]` -- Pipeline phase execution

## Security Notes

- API keys are encrypted before storage using helpers from `src/utils/crypto.ts`
- In browser mode, the system blocks direct connections to Anthropic's official API from the browser (security measure)
- In web mode, all AI requests go through the configured base URL
- Use environment variables or the encrypted storage for keys; never hardcode API keys in source code

## Related Documentation

- [AI Config Quick Guide](../AI_CONFIG_GUIDE.md) -- Original quick reference (Chinese)
- [AI Integration Design](../ai-integration-design.md) -- Technical design document
- [Getting Started](./getting-started.md) -- Basic setup walkthrough
- [Advanced Features](./advanced-features.md) -- Deep import, rewrite, batch generation
