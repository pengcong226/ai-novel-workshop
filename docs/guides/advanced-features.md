# Advanced Features Guide

This guide covers the advanced capabilities of AI Novel Workshop beyond basic chapter generation.

## Sandbox Entities and State Tracking

### The V5 Event-Sourcing Model

The Sandbox is the central data backbone of every project. It uses an event-sourcing architecture built on two concepts:

- **Entity**: A static definition of a story element (character, location, faction, lore, item, concept, or world setting)
- **StateEvent**: An append-only record of a state change that occurred at a specific chapter number

The system computes a **ResolvedEntity** at any chapter by replaying all state events up to that chapter number against the base entity definitions. This allows the AI to answer "what was the state of character X at chapter 15?" accurately.

### Entity Types

| Type | Use Case | Examples |
|------|----------|---------|
| `CHARACTER` | People in your story | Protagonist, villain, mentor |
| `FACTION` | Organizations and groups | Cults, armies, noble houses |
| `LOCATION` | Places and regions | Cities, dungeons, realms |
| `LORE` | World rules and knowledge | Magic systems, laws, customs |
| `ITEM` | Physical objects | Swords, potions, artifacts |
| `CONCEPT` | Abstract ideas | Prophecies, philosophies, curses |
| `WORLD` | Top-level world definition | The setting as a whole |

### State Event Types

| Event Type | What It Tracks | Payload Fields |
|-----------|----------------|---------------|
| `PROPERTY_UPDATE` | Generic key/value change | `key`, `value` |
| `RELATION_ADD` | New relationship formed | `targetId`, `relationType`, `attitude` |
| `RELATION_REMOVE` | Relationship ended | `targetId` |
| `RELATION_UPDATE` | Relationship changed | `targetId`, `relationType`, `attitude` |
| `LOCATION_MOVE` | Entity moved to new position | `coordinates` |
| `VITAL_STATUS_CHANGE` | Alive/dead/sealed status | `status` |
| `ABILITY_CHANGE` | Ability gained/lost/sealed | `abilityName`, `abilityStatus` |

### Zero-Touch Extraction

When enabled (`enableZeroTouchExtraction` in project config), the system automatically extracts entities and state events from generated chapters:

1. After a chapter is generated, a semantic boundary interceptor checks for high-impact content (deaths, breakthroughs, major events)
2. If high-impact content is detected, the extraction pipeline runs using Tool Calling to produce structured JSON
3. New entities are added; existing entities are updated; state events are appended
4. Low-impact chapters (casual dialogue, travel) skip extraction to save API costs

### The World Gen Wizard

The World Gen Wizard provides a chat-based interface for bulk entity creation:

1. Describe your world concept in natural language
2. The AI generates a batch of interconnected entities (characters, factions, locations, lore)
3. Review and accept/reject individual entities
4. Entities are automatically linked via relations

## Deep Import (Existing Novel Extraction)

The Deep Import system extracts structured data from existing novel text.

### How It Works

1. **Chapter Detection**: The system parses raw text to identify chapter boundaries (`src/utils/chapterParser.ts`)
2. **Entity Extraction** (`extract_novel_entities`): Identifies characters, locations, factions, items, and lore from each chapter, with text evidence quotes
3. **State Event Extraction** (`extract_state_events`): Tracks state changes (property updates, relation changes, location moves, vital status, ability changes) per chapter
4. **Plot Event Extraction** (`extract_plot_events`): Identifies foreshadowing, turning points, climax moments, and conflicts

### Evidence Requirement

Every extracted fact must include an `Evidence` object:

```typescript
interface Evidence {
  quote: string   // original text quote (~80 chars max)
  offset: number  // character offset within the chapter
}
```

This ensures traceability -- every entity or state event can be traced back to a specific passage in the source text.

### Running a Deep Import

1. Open the Deep Import panel in your project workspace
2. Upload or paste your novel text
3. Configure extraction options:
   - **Batch size**: Number of chapters to process per batch
   - **Extract plot events**: Enable foreshadowing and turning point detection
   - **Model**: Choose which AI model to use for extraction
4. Start the import -- progress is tracked with checkpoints
5. Review extracted entities in the Sandbox review UI before accepting

### Session Management

Deep Import uses `useDeepImportSession` (a module-scope singleton composable) that tracks:

- Current progress (chapters processed / total)
- Checkpoints for resumable sessions
- Extraction results pending review

## Rewrite and Continuation Workflow

After importing or generating chapters, you can either continue the story or rewrite existing chapters.

### Continuation

Continuation generates new chapters after the last existing chapter:

```typescript
interface ContinuationOptions {
  startChapter: number         // where to begin (typically lastChapter + 1)
  count: number                // how many chapters to generate
  extractPlotEvents: boolean   // track foreshadowing arcs
  enableAntiRetcon: boolean    // validate consistency
  autoSave: boolean            // save each chapter automatically
  autoExtract: boolean         // extract entities after each chapter
}
```

The continuation flow:
1. Builds context from existing state (entities, recent chapters, summaries)
2. Generates each chapter sequentially
3. Runs anti-retcon validation against resolved entity state
4. Extracts new state events after each chapter
5. Tracks plot events for foreshadowing continuity

### Rewrite

Rewrite replaces a range of existing chapters with new content:

```typescript
interface RewriteOptions {
  range: { start: number; end: number }  // chapter range to rewrite
  newDirectionPrompt: string              // your new narrative direction
  extractPlotEvents: boolean
  enableAntiRetcon: boolean
  autoSave: boolean
}
```

The rewrite flow creates a **State Diff Report**:

```typescript
interface StateDiffReport {
  baselineSnapshot: EntityStateSnapshot[]   // state at range.start - 1
  preRewriteSnapshot: EntityStateSnapshot[] // state at range.end (before rewrite)
  postRewriteSnapshot: EntityStateSnapshot[] // state after rewrite
  diffs: StateDiffItem[]                    // structured changes
  brokenForeshadowing: BrokenForeshadowing[] // foreshadowing arcs that would break
  newEntities: Entity[]                     // entities introduced by rewrite
  removedEntityIds: string[]               // entities no longer present
}
```

A **RewriteBackup** is automatically created for rollback:

```typescript
interface RewriteBackup {
  projectId: string
  range: RewriteRange
  chapters: Array<{ number, title, content, wordCount }>
  stateEvents: StateEvent[]
  plotEvents: PlotEventRecord[]
  createdAt: number
}
```

### Concurrency Guard

The `useRewriteContinuation` composable (module-scope singleton) enforces that only one rewrite or continuation operation runs at a time. Concurrent attempts are rejected with an error.

## Quality Checking and Review

### Multi-Dimensional Quality Audit

The quality checker evaluates chapters across five dimensions:

1. **Plot Quality**: Conflict setup, pacing, plot progression, climax detection
2. **Character Quality**: Character appearance tracking, dialogue naturalness, personality consistency
3. **Writing Quality**: Sentence fluency, descriptive richness, vocabulary diversity, repetition detection
4. **Logic Consistency**: World setting consistency, timeline consistency, character state consistency, causality checks
5. **Innovation**: Plot pattern detection, character setting novelty, world innovation, plot twist detection

### 17-Dimension Pipeline Audit

The Pipeline's Auditor agent runs a deeper 17-dimension (expanded to 18 with dialogue analysis in v6.0) audit that includes:

- Setting consistency (anti-retcon)
- Character voice consistency
- Foreshadowing continuity
- Pacing and rhythm analysis
- Dialogue quality (dialogue/narration ratio, tag frequency, repetition)
- Sensitive word detection (configurable via `enableSensitiveWordCheck`)

### Revision Cycle

When the audit detects issues:

1. The Auditor produces a structured report with issues categorized by severity
2. The Reviser agent applies targeted fixes
3. The RevisionVerifier (v6.0+) runs a two-level verification:
   - **Level 1** (deterministic): word count, repeated paragraphs, sensitive words, paragraph standard deviation, AI marker word density
   - **Level 2** (LLM): semantic verification of the revision
4. If verification fails, another revision round is triggered

### AI Review Suggestions

Review suggestions are stored in the suggestions store and typed with:

```typescript
type SuggestionCategory = 'consistency' | 'quality' | 'optimization' | 'style' | 'problem' | 'reminder'
type SuggestionPriority = 'low' | 'medium' | 'high'
type SuggestionStatus = 'unread' | 'read' | 'adopted' | 'ignored'
```

Suggestions include location information (chapter, paragraph index, text snippet) and can offer auto-fix actions. The Review Side Panel in the chapter editor allows you to navigate to, apply, or dismiss each suggestion.

### Tension Curve Analysis (v6.0+)

The TensionCurvePlanner analyzes the pacing across the entire novel:

- Detects climax clusters (too many high-tension chapters together)
- Identifies extended low-tension stretches (reader disengagement risk)
- Spots monotone pacing (no tension variation)
- Flags abrupt tension jumps
- Recommends a target tension value for the next chapter

### Multi-Reader Evaluation (v6.0+)

The ReaderAgent simulates three reader personas:

1. **Experienced web novel reader** -- critical, pattern-aware, low patience for tropes
2. **New reader** -- needs clear exposition, confused by assumed knowledge
3. **Genre core audience** -- evaluates genre-specific satisfaction

Each persona provides differentiated feedback including a drop-book risk assessment.

## Batch Generation

### Standard Batch Mode

Generate multiple chapters in sequence:

1. Select a range of chapter outlines
2. Click **Batch Generate**
3. The pipeline runs for each chapter: context assembly, generation, audit, revision, state extraction
4. Progress is displayed in real-time

### Pipeline Architecture (v6.0+)

The generation pipeline runs through 10 agent phases:

1. **Planner** -- Consults the planning model for narrative direction
2. **Composer** -- Assembles context (entities, recent chapters, summaries, vector retrieval)
3. **Writer** -- Generates the chapter text
4. **Normalizer** -- Cleans and standardizes the output
5. **Auditor** -- Runs the 17/18-dimension quality audit
6. **Reviser** -- Applies targeted fixes based on audit results
7. **Settler** -- Persists the chapter and updates state
8. **Analyzer** -- Runs tension curve analysis and reader evaluation
9. **HookPromoter** -- Tracks foreshadowing arcs and promotes hooks
10. **Validator** -- Final consistency validation

The pipeline can be configured via `PipelineConfig` and supports batch continuation scheduling through `BatchContinueScheduler`.

### Cost Control

Each project has a `maxCostPerChapter` setting. The generation scheduler tracks API costs and stops generation if the per-chapter budget is exceeded. Model tier selection (planner/writer/sentinel) uses different models to optimize cost versus quality.

## Backup and Restore

### Creating a Backup

Project backups are versioned JSON files containing:

- Project metadata, outline, chapters (with full content)
- Sandbox entities and state events
- Configuration

Use the export function in the project settings.

### Restoring from Backup

1. Import the backup file from the project list page
2. The system creates a new project with a new ID
3. All V5 entity/state event project IDs are reassigned
4. Validation checks: size limits, shape validation, duplicate ID detection, entity reference consistency

### Legacy Format Support

`.anprojl` files from earlier versions are supported through streaming import (`importProjectFromLineStream`). These are processed line-by-line to handle large files without loading them entirely into memory.

## Vector Retrieval (RAG)

When enabled (`enableVectorRetrieval` in project config), the system provides semantic search across your novel:

- **Desktop mode**: Uses Rust-based HNSW via `instant-distance` (no external dependencies)
- **Browser mode**: Uses IndexedDB-backed vector storage
- **Embedding models**: Local (`bge-small-zh-v1.5` via `@xenova/transformers`) or OpenAI embeddings
- **OP-RAG algorithm**: Retrieval results are sorted by chapter order (not just similarity score) to preserve narrative timeline

The Composer agent in the pipeline uses vector retrieval to find relevant past content when assembling context for generation.

## Speech Pattern Profiles (v6.0+)

Each character entity can have a `SpeechPattern` profile:

```typescript
interface SpeechPattern {
  formality: 'formal' | 'casual' | 'mixed'
  vocabulary: 'simple' | 'moderate' | 'literary'
  sentenceLength: 'short' | 'medium' | 'long'
  quirks: string[]
  catchphrases: string[]
}
```

The ObserverAgent extracts speech patterns from character dialogue during generation, and the Writer agent uses these profiles to maintain character voice consistency.
