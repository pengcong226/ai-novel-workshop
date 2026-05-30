# Getting Started with AI Novel Workshop

AI Novel Workshop (AI小说工坊) is a local-first application for generating long-form novels (1M+ words) with AI assistance. It supports both a Tauri desktop app and a browser-based experience.

## Prerequisites

- **Node.js** 18+ and npm
- **Rust toolchain** (for desktop mode only): install via [rustup](https://rustup.rs/)
- An AI provider API key (OpenAI, Anthropic, or a compatible service)

## Installation

### Web Mode (Browser)

```bash
# Clone the repository
git clone <repository-url>
cd ai-fanfic-workshop

# Install dependencies
npm install

# Start the development server
npm run dev
```

The app will be available at `http://localhost:5173`. In web mode, data is stored in the browser's localStorage. This mode is suitable for quick testing and small projects.

### Desktop Mode (Tauri)

```bash
# Install dependencies
npm install

# Start the Tauri desktop app in development mode
npm run tauri:dev
```

Desktop mode uses SQLite for persistence and supports larger projects. The Tauri app window will open automatically.

### Production Build

```bash
# Build the web app
npm run build

# Build the desktop app (produces a native installer)
npm run tauri:build
```

## Creating Your First Project

### Step 1: Project Setup

1. Launch the app and navigate to the **Projects** page (`/projects`)
2. Click **New Project** (新建项目)
3. Fill in basic information:
   - **Title**: Your novel's working title
   - **Genre**: Select from fantasy, urban, sci-fi, wuxia, historical, or other
   - **Target word count**: Set your goal (e.g., 200,000 words)
   - **Description**: A brief summary of your concept

### Step 2: AI Provider Configuration

Before generating content, configure at least one AI provider:

1. Navigate to **Settings** (配置) within your project
2. Click **Add Provider** (添加提供商)
3. Select provider type:
   - **OpenAI**: For GPT-4o, GPT-4o-mini
   - **Anthropic**: For Claude models
   - **Custom**: For any OpenAI-compatible API (DeepSeek, Zhipu, Ollama, etc.)
4. Enter your API key and base URL
5. Click **Test Connection** to verify
6. Assign models to roles:
   - **Planner model**: High-reasoning model for outline and world generation (e.g., Claude Opus, GPT-4o)
   - **Writer model**: Balanced model for chapter generation (e.g., Claude Sonnet, GPT-4o)
   - **Sentinel model**: Fast model for quality checks (e.g., Claude Haiku, DeepSeek)

### Step 3: World and Character Setup

Use the **Sandbox** panel to define your story's foundation:

**Entities** come in seven types:

| Type | Purpose | Examples |
|------|---------|---------|
| CHARACTER | Story characters | Protagonist, antagonist, supporting cast |
| FACTION | Organizations, groups | Sects, kingdoms, guilds |
| LOCATION | Places in your story | Cities, dungeons, realms |
| LORE | World rules, lore | Magic systems, laws of physics, customs |
| ITEM | Important objects | Artifacts, weapons, keys |
| CONCEPT | Abstract ideas | Prophecies, philosophies |
| WORLD | Overall world setting | The era, geography, tech level |

You can:
- **Create entities manually** through the Sandbox editor
- **Generate with AI** using the World Gen Wizard (chat interface for bulk generation)
- **Import from existing text** using the Deep Import system

### Step 4: Create an Outline

1. Open the **Outline** (大纲) editor
2. Define your plot structure:
   - **Synopsis**: Overall story summary
   - **Theme**: Central theme or message
   - **Main plot line**: The primary narrative arc
   - **Sub-plots**: Secondary storylines
   - **Volumes**: Group chapters into volumes with themes
   - **Chapter outlines**: Per-chapter goals, conflicts, and resolutions
3. Use **foreshadowing tracking** to plant and resolve narrative threads

The AI can help generate and refine outlines through the Planner model.

### Step 5: Generate Chapters

With your world, characters, and outline in place:

1. Open the **Chapters** (章节) view
2. Click **Generate** on a chapter outline, or use **Batch Generate** for multiple chapters
3. The generation pipeline runs through these stages:
   - Context assembly (pulls relevant entities, recent chapters, summaries)
   - AI generation (streams chapter text via the Writer model)
   - Quality audit (17-dimension consistency check)
   - Revision (automatic fixes for detected issues)
   - State extraction (updates Entity/StateEvent data)

### Step 6: Review and Edit

After generation:

1. Open the **Chapter Editor** dialog
2. Use the Tiptap-based editor for manual edits
3. Run **Quality Check** for consistency reports
4. View **AI Review Suggestions** in the side panel
5. Use **Checkpoints** to save progress and **Versions** to browse history

## Core Workflow

```
Configure AI Provider
        |
        v
Create Project
        |
        v
Build World + Characters (Sandbox entities)
        |
        v
Write Outline (chapters, plot lines, foreshadowing)
        |
        v
Generate Chapters (AI pipeline with quality gates)
        |
        v
Review and Edit (quality checks, suggestions, manual edits)
        |
        v
State Extraction (automatic Entity/StateEvent updates)
        |
        v
Continue to Next Chapter
```

## Verification Commands

Use these commands to verify your setup:

```bash
# Type check
npm run type-check

# Lint
npm run lint

# Run tests
npm run test:run

# Build check
npm run build
```

## Next Steps

- [AI Configuration Guide](./ai-config.md) -- Detailed provider setup and model selection
- [Advanced Features Guide](./advanced-features.md) -- Deep import, rewrite/continuation, batch generation
- [V1 to V5 Migration](../migration/v1-to-v5.md) -- Understanding the data model
