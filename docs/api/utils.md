# Utilities API Reference

---

## Context Builder

**Module**: `src/utils/contextBuilder.ts`
**Import**: `import { buildChapterContext, contextToPromptPayload, contextToPrompt } from '@/utils/contextBuilder'`

Assembles chapter generation context through a middleware composition pipeline with dynamic token budgeting. This is the central module where memory priority and token budget are enforced.

### Token Budget

The budget is dynamically scaled based on the model's context window (default: 128,000 tokens). 70% is reserved for input context, capped at 60,000 effective tokens.

| Section | Budget Share | Description |
|---------|-------------|-------------|
| `SYSTEM_PROMPT` | 5% | System-level instructions |
| `AUTHORS_NOTE` | 3% | Continuity enforcement directives |
| `STYLE_PROFILE` | 2% | Writing style specification |
| `WORLD_INFO` | 12% | World-building from sandbox entities |
| `CHARACTERS` | 10% | Character profiles from sandbox entities |
| `VECTOR_CONTEXT` | 15% | Semantic retrieval results |
| `SUMMARY` | 10% | Historical chapter summaries |
| `RECENT_CHAPTERS` | 25% | Full text of recent chapters |
| `OUTLINE` | 5% | Chapter outline/plan |
| `RESERVE` | 15% | Overflow buffer |

### Exported Functions

#### `buildChapterContext(project, currentChapter, vectorConfig?, modelContextWindow?, rewriteDirectionPrompt?): Promise<BuildContext>`

Main entry point. Builds the full generation context by executing the middleware pipeline:

1. `SystemPromptMiddleware` - Base system instructions
2. `StyleMiddleware` - Writing style profile
3. `AuthorsNoteMiddleware` - Continuity enforcement
4. `WorldInfoMiddleware` - World-building context
5. `CharacterInfoMiddleware` - Character profiles
6. `StateConstraintsMiddleware` - Anti-retcon state guards
7. `VectorContextMiddleware` - Semantic retrieval
8. `SummaryMiddleware` - Historical summaries
9. `RecentChaptersMiddleware` - Recent chapter full text
10. `OutlineMiddleware` - Chapter outline

After pipeline execution, if total tokens exceed the context limit, sections are trimmed in priority order (vector context first, then summary, world info, characters, recent chapters).

**Parameters**:
- `project: Project` - The project
- `currentChapter: Chapter` - Target chapter
- `vectorConfig?: VectorServiceConfig` - Vector retrieval config
- `modelContextWindow?: number` - Model context window size (default: 128000)
- `rewriteDirectionPrompt?: string` - Direction prompt for rewrite mode

**Returns**: `BuildContext`

```typescript
interface BuildContext {
  systemPrompt: string
  styleProfile: string
  authorsNote: string
  worldInfo: string
  characters: string
  stateConstraints: string
  vectorContext: string
  summary: string
  recentChapters: string
  outline: string
  plotAnchors: string
  totalTokens: number
  warnings: string[]
}
```

#### `contextToPromptPayload(context, chapterTitle, targetWords?): PromptPayload`

Converts a `BuildContext` into a two-role prompt (system + user) using the "hourglass layout":
- **System message (head)**: Rigid constraints, style, author's note, state constraints, character summary
- **User message (middle + tail)**: World info, vector context, summaries, recent chapters, outline, execution instructions

```typescript
interface PromptPayload {
  systemMessage: string
  userMessage: string
}
```

#### `contextToPrompt(context, chapterTitle, targetWords?): string`

Backward-compatible single-string version. Concatenates system + user messages.

#### `buildAuthorsNote(currentChapter, recentChapters): string`

Builds continuity enforcement directives. Includes scene inference, character state, and absolute prohibitions (no restart, no relationship changes, no event forgetting).

#### `inferCurrentScene(recentChapters): string`

Infers the current scene from sandbox entity locations or recent chapter text tails.

#### `inferCharacterStates(recentChapters): string`

Infers character states from sandbox resolved entities for recently mentioned characters.

#### `isCharacterActive(resolved: ResolvedEntity): boolean`

Checks if a character is alive and not archived. Used to filter dead characters from context.

#### `buildStateConstraints(entities, activeState, involvedNames): string`

Builds iron-clad state constraints for involved characters (location, vital status, faction). These are injected at the top of the system prompt to prevent anti-retcon violations.

#### `buildWorldInfo(project, currentChapter, recentChapters): string`

Builds world-building context from sandbox entities: world entity (name, era, power system), relevant factions, and world rules.

#### `buildCharacterInfo(currentChapter, recentChapters): string`

Builds character profiles from sandbox entities. Filters to relevant characters (mentioned in outline or recent chapters), skipping dead characters unless explicitly in the outline.

#### `buildSummary(chapters, currentChapter): {summary: string; summaries: ChapterSummary[]}`

Builds historical chapter summaries. Chapters older than 3 from current are summarized; those with `summaryData` use the detailed format, those with only `summary` use that, and those with neither get a 150-character extract.

#### `buildRecentChapters(chapters, currentChapter, maxTokens, recentCount?): string`

Builds full text of the most recent N chapters (default: 3), truncated to fit the token budget.

#### `buildOutline(outline?: ChapterOutline): string`

Formats a chapter outline into structured text (title, goals, conflicts, resolutions, location, characters, foreshadowing).

#### `buildVectorContext(project, currentChapter, vectorService?, maxTokens?, activeEntityNames?, retrievalOptions?): Promise<string>`

Performs graph-guided vector retrieval for relevant historical context. Results are sanitized against injection attacks and sorted by chapter number.

---

## Quality Checker

**Module**: `src/utils/qualityChecker.ts`
**Import**: `import { QualityChecker, createQualityChecker, analyzeQualityTrend } from '@/utils/qualityChecker'`

Multi-dimensional chapter quality assessment with rule-based and optional LLM-judge scoring.

### QualityChecker Class

#### Constructor

```typescript
new QualityChecker(
  config: QualityCheckConfig,
  loreEntities?: ResolvedEntity[],
  characters?: ResolvedEntity[],
  outline?: Outline,
  llmJudge?: (request: LLMJudgeRequest) => Promise<LLMJudgeResult | null>
)
```

#### Methods

```typescript
async checkChapter(chapter: Chapter, onProgress?: (progress: number) => void): Promise<QualityReport>
```

Runs all enabled quality dimensions on a single chapter. Progress increments by 20% per dimension.

```typescript
async checkChapters(chapters: Chapter[], onProgress?): Promise<QualityReport[]>
```

Batch quality check. Runs sequentially.

### Quality Dimensions

| Dimension | Checks |
|-----------|--------|
| **Plot Quality** | Conflict patterns, paragraph rhythm, progression markers, climax setup |
| **Character Quality** | Character presence, dialogue count, personality display, character interaction |
| **Writing Quality** | Sentence length distribution, description richness, dialogue naturalness, word repetition, rhetoric |
| **Logic Consistency** | World-setting consistency, timeline consistency, character state consistency, causal relationships |
| **Innovation** | Common trope detection, personality combo novelty, power system originality, twist detection |

### QualityReport

```typescript
interface QualityReport {
  chapterId: string
  chapterNumber: number
  timestamp: Date
  overallScore: number       // 0-10
  dimensions: QualityDimension[]
  summary: string
  improvements: string[]
  details: string
}
```

### QualityCheckConfig

```typescript
interface QualityCheckConfig {
  enablePlotCheck: boolean          // default: true
  enableCharacterCheck: boolean     // default: true
  enableWritingCheck: boolean       // default: true
  enableLogicCheck: boolean         // default: true
  enableInnovationCheck: boolean    // default: true
  customRules: CustomRule[]
  qualityThreshold: number          // default: 7
  enableLLMJudge?: boolean          // default: false
  llmJudgeWeight?: number           // default: 0.4
}
```

### Factory Function

```typescript
function createQualityChecker(
  loreEntities?: ResolvedEntity[],
  characters?: ResolvedEntity[],
  outline?: Outline,
  config?: Partial<QualityCheckConfig>,
  llmJudge?: (request: LLMJudgeRequest) => Promise<LLMJudgeResult | null>
): QualityChecker
```

Creates a `QualityChecker` with merged default + custom config.

### Trend Analysis

```typescript
function analyzeQualityTrend(reports: QualityReport[]): {
  averageScore: number
  scoreTrend: 'improving' | 'stable' | 'declining'
  dimensionTrends: Record<string, {trend: string; scores: number[]}>
  recommendations: string[]
}
```

Analyzes quality trends across multiple reports. Detects improvement/decline based on the last 3 scores.

---

## Summarizer

**Module**: `src/utils/summarizer.ts`
**Import**: `import { generateChapterSummary, batchGenerateSummaries, mergeToVolumeSummary, ... } from '@/utils/summarizer'`

Multi-level summary generation system (chapter, volume, book) with tiered detail based on chapter distance from current.

### Summary Detail Levels

| Level | Distance from Current | Target Length | Description |
|-------|----------------------|---------------|-------------|
| `FULL` | <= 3 chapters | 0 (no summary) | Full text used directly |
| `DETAILED` | 4-10 chapters | 500 chars | Detailed summary |
| `BRIEF` | 11-30 chapters | 200 chars | Brief summary |
| `MINIMAL` | 31+ chapters | 100 chars | Minimal extract |

### Exported Functions

#### `generateChapterSummary(chapter, config?): Promise<ChapterSummaryData>`

Generates an AI-powered summary for a single chapter. Includes quality validation and fallback to extract-based summary on failure.

**Parameters**:
- `chapter: Chapter` - The chapter to summarize
- `config?: Partial<SummaryConfig>` - Optional config (targetLength, maxTokens, extractKeywords, analyzeEmotion, extractConflict, currentChapterNumber)

**Returns**: `ChapterSummaryData`

```typescript
interface ChapterSummaryData {
  id: string
  chapterNumber: number
  title: string
  summary: string
  keyEvents: string[]
  characters: string[]
  locations: string[]
  plotProgression: string
  emotionalTone?: string
  conflicts?: string[]
  resolutions?: string[]
  wordCount: number
  summaryWordCount: number
  tokenCount: number
  createdAt: Date
  updatedAt: Date
  level: SummaryLevel
  detail: SummaryDetail
  sourceHash?: string
  summaryVersion?: number
}
```

#### `batchGenerateSummaries(chapters, onProgress?): Promise<ChapterSummaryData[]>`

Generates summaries for multiple chapters with concurrency of 3.

#### `mergeToVolumeSummary(summaries, volumeNumber, volumeTitle): Promise<VolumeSummaryData>`

Merges chapter summaries into a volume summary (500-800 chars) with main events, character arcs, and theme.

#### `checkSummaryQuality(summary): SummaryQualityCheck`

Validates summary quality: length ratio, key event presence, character/location coverage, coherence (connectors), conciseness (repetition rate).

```typescript
interface SummaryQualityCheck {
  isValid: boolean      // score >= 6
  issues: string[]
  suggestions: string[]
  score: number         // 0-10
  completeness: number  // 0-1
  coherence: number     // 0-1
  conciseness: number   // 0-1
}
```

#### `determineSummaryDetail(chapterNumber, currentChapterNumber): SummaryDetail`

Determines the appropriate detail level based on distance.

#### `getTargetLength(detail: SummaryDetail): number`

Returns the target character length for a detail level.

#### `createContentHash(content: string): string`

Creates a deterministic hash for content change detection.

---

## Chapter Parser

**Module**: `src/utils/chapterParser.ts`
**Import**: `import { parseChapters, parseNovelText, detectChapterPattern, ... } from '@/utils/chapterParser'`

Automatic chapter boundary detection and text splitting. Supports Chinese, English, and Roman numeral chapter patterns.

### Supported Patterns

| Pattern | Example |
|---------|---------|
| Volume + Chapter | `第一卷第三章 xxx` |
| Chapter (Chinese) | `第三章 xxx` |
| Chapter (回/节/篇/部/集/話/幕) | `第三回 xxx` |
| Bracketed | `【第三章】xxx` |
| Special chapters | `序章 xxx`, `番外 xxx`, `终章 xxx` |
| English | `Chapter XIV xxx` |
| Numbered | `1. xxx`, `3、xxx` |

### Exported Functions

#### `detectChapterPattern(text: string): ChapterPattern | null`

Detects the most likely chapter pattern in a text. Uses a scoring system based on match count and number continuity (consecutive chapter numbers score higher). Samples the first 20,000 characters.

#### `parseChapters(text, pattern?): ParsedChapter[]`

Parses text into chapters using the detected (or provided) pattern. Falls back to a single chapter if no pattern is found.

**Returns**:
```typescript
interface ParsedChapter {
  number: number
  title: string
  content: string
  startIndex: number
  endIndex: number
  wordCount: number
}
```

#### `parseNovelText(text): {chapters, pattern, stats}`

Full parsing pipeline. Returns chapters, detected pattern, and statistics (totalWords, totalChapters, avgWordsPerChapter).

#### `getChapterPatterns(): ChapterPattern[]`

Returns all supported chapter patterns (ordered by specificity).

#### `getChapterPatternOptions(): ChapterPatternOption[]`

Returns pattern names for UI selection.

### Number Parsing

The parser handles:
- Arabic numerals: `42`
- Chinese numerals: `四十二`, `一百零三`, `三千八百二十一`
- Roman numerals: `XIV`, `XL`
- Special chapters: `序章`, `引子`, `楔子`, `前言`, `终章`, `番外` (all mapped to chapter 0)

### Word Counting

The `countWords` function counts Chinese characters, English words, and numbers as separate units.

---

## State Diff

**Module**: `src/utils/stateDiff.ts`
**Import**: `import { replayReducer, captureSnapshot, computeStateDiff, computeRewriteDiffReport } from '@/utils/stateDiff'`

The event-sourcing reducer and diff computation engine. This module contains the **canonical reducer** -- the single source of truth for computing entity state at any chapter number.

### Exported Functions

#### `replayReducer(entities, stateEvents, chapterNumber): Record<string, ReducedEntity>`

The core event-sourcing reducer. Replays all state events up to and including `chapterNumber` onto entity seeds.

**Event Types Handled**:

| Event Type | Effect |
|------------|--------|
| `PROPERTY_UPDATE` | Sets `properties[key] = value` |
| `RELATION_ADD` | Appends to `relations[]` |
| `RELATION_REMOVE` | Filters from `relations[]` by targetId (and optionally relationType) |
| `RELATION_UPDATE` | Updates `attitude` on matching relation |
| `LOCATION_MOVE` | Sets location from coordinates or value |
| `VITAL_STATUS_CHANGE` | Sets `vitalStatus` |
| `ABILITY_CHANGE` | Adds or updates ability in `abilities[]` |

**Returns**:
```typescript
interface ReducedEntity {
  entityId: string
  entityName: string
  entityType: Entity['type']
  properties: Record<string, string>
  relations: Array<{targetId: string; targetName: string; type: string; attitude?: string}>
  location: string | null
  vitalStatus: string
  abilities: Array<{name: string; status: string; acquiredChapter: number}>
}
```

#### `captureSnapshot(entities, stateEvents, chapterNumber): EntityStateSnapshot[]`

Replays the reducer and returns a snapshot suitable for diff computation.

**Returns**:
```typescript
interface EntityStateSnapshot {
  entityId: string
  entityName: string
  entityType: Entity['type']
  properties: Record<string, string>
  relations: Array<{targetId: string; targetName: string; type: string; attitude?: string}>
  location: string | null
  vitalStatus: string
  abilities: Array<{name: string; status: string}>
}
```

#### `computeStateDiff(before, after): StateDiffItem[]`

Compares two snapshots and produces structured diffs. Detects:

| Category | Description |
|----------|-------------|
| `entity_added` | New entity in `after` |
| `entity_removed` | Entity missing from `after` |
| `property_added` | New property key |
| `property_removed` | Property key removed |
| `property_changed` | Property value changed |
| `relation_added` | New relation |
| `relation_removed` | Relation removed |
| `relation_changed` | Relation attitude changed |
| `location_changed` | Location different |
| `vital_status_changed` | Vital status different |
| `ability_changed` | Ability added or status changed |

```typescript
interface StateDiffItem {
  entityId: string
  entityName: string
  category: string
  description: string
  before: string
  after: string
  accepted: boolean | null
}
```

#### `computeRewriteDiffReport(entities, stateEvents, range, plotEvents?, newEntities?, snapshots?): StateDiffReport`

Computes a full diff report for the rewrite workflow. Includes:

1. Baseline snapshot (at `range.start - 1`)
2. Pre-rewrite snapshot (at `range.end`)
3. Post-rewrite snapshot (at `range.end` with new data)
4. Structured diffs between pre and post
5. Broken foreshadowing detection (foreshadowing planted before range that was resolved in the rewritten range)
6. Removed entity IDs

```typescript
interface StateDiffReport {
  baselineSnapshot: EntityStateSnapshot[]
  preRewriteSnapshot: EntityStateSnapshot[]
  postRewriteSnapshot: EntityStateSnapshot[]
  diffs: StateDiffItem[]
  brokenForeshadowing: BrokenForeshadowing[]
  newEntities: Entity[]
  removedEntityIds: string[]
}
```
