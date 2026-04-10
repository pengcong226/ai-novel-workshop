# Tavern Parser Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone CLI that parses SillyTavern/TavernAI character cards and worldbooks from PNG metadata and exports Markdown/JSON/YAML documents.

**Architecture:** Implement a focused Node.js CLI in `tavern-parser/` with one executable entry (`src/index.js`) and small pure functions for parsing, normalization, formatting, and file output. Use real PNG chunk parsing (`tEXt`/`iTXt`/`zTXt`) with deterministic key precedence (`iTXt > zTXt > tEXt`). Keep TDD per feature slice (RED → GREEN → commit).

**Tech Stack:** Node.js 20+, commander, js-yaml, chalk, glob, png-chunks-extract, node:test

---

## File Structure

- Create: `tavern-parser/package.json` — isolated package metadata + scripts
- Create: `tavern-parser/.gitignore` — package-local ignores
- Create: `tavern-parser/src/index.js` — CLI + parser + formatter (single-file scope)
- Create: `tavern-parser/tests/png-parser.test.js` — PNG chunk parsing tests
- Create: `tavern-parser/tests/card-detection.test.js` — type detection/validation tests
- Create: `tavern-parser/tests/output-format.test.js` — Markdown/JSON/YAML tests
- Create: `tavern-parser/tests/cli-flow.test.js` — high-level flow tests (non-e2e)
- Modify: `docs/superpowers/plans/2026-03-26-tavern-parser.md` (this file)

---

## Chunk 1: Package scaffold + runnable CLI shell

### Task 1: Initialize standalone package (no nested git repo)

**Files:**
- Create: `tavern-parser/package.json`
- Create: `tavern-parser/.gitignore`
- Create: `tavern-parser/src/index.js`

- [ ] **Step 1: Write failing CLI smoke test**

Create `tavern-parser/tests/cli-flow.test.js`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProgram } from '../src/index.js';

test('CLI program is creatable', () => {
  const program = buildProgram();
  assert.equal(program.name(), 'tavern-parser');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix tavern-parser test -- tests/cli-flow.test.js`
Expected: FAIL (module/function not found)

- [ ] **Step 3: Add minimal package + CLI shell**

`package.json`:
```json
{
  "name": "tavern-parser",
  "version": "1.0.0",
  "type": "module",
  "bin": { "tavern-parser": "./src/index.js" },
  "scripts": {
    "test": "node --test",
    "test:one": "node --test"
  },
  "dependencies": {
    "chalk": "^5.3.0",
    "commander": "^12.1.0",
    "glob": "^10.4.5",
    "js-yaml": "^4.1.0",
    "png-chunks-extract": "^1.0.0"
  },
  "engines": { "node": ">=20" }
}
```

`src/index.js` (minimal):
```js
#!/usr/bin/env node
import { Command } from 'commander';

export function buildProgram() {
  return new Command().name('tavern-parser').description('Parse tavern PNG cards');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix tavern-parser test -- tests/cli-flow.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tavern-parser/package.json tavern-parser/src/index.js tavern-parser/tests/cli-flow.test.js tavern-parser/.gitignore
git commit -m "feat: scaffold tavern-parser package and CLI shell"
```

---

## Chunk 2: PNG metadata parser (real chunk parsing)

### Task 2: Parse tEXt/iTXt/zTXt with precedence

**Files:**
- Modify: `tavern-parser/src/index.js`
- Test: `tavern-parser/tests/png-parser.test.js`

- [ ] **Step 1: Write failing parser tests**

Create `tests/png-parser.test.js` with tests for:
1. decode `tEXt` keyword/value
2. decode compressed `zTXt`
3. decode UTF-8 `iTXt`
4. same keyword precedence (`iTXt` overrides `zTXt`/`tEXt`)

(Use small synthetic chunk payload helpers; do not depend on real PNG fixtures.)

- [ ] **Step 2: Run tests to verify fail**

Run: `npm --prefix tavern-parser test -- tests/png-parser.test.js`
Expected: FAIL

- [ ] **Step 3: Implement minimal parser functions**

In `src/index.js` add:
- `parseTextChunkData(chunkName, dataBuffer)`
- `extractPngTextMetadata(fileBuffer)` using `png-chunks-extract`
- rank map `{ tEXt: 1, zTXt: 2, iTXt: 3 }`
- deterministic overwrite by higher rank only

Key requirement:
- `tEXt`: latin1
- `zTXt`: inflate + latin1
- `iTXt`: UTF-8 (compressed or uncompressed)

- [ ] **Step 4: Run tests to verify pass**

Run: `npm --prefix tavern-parser test -- tests/png-parser.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tavern-parser/src/index.js tavern-parser/tests/png-parser.test.js
git commit -m "feat: implement PNG text metadata parser with chunk precedence"
```

---

## Chunk 3: Card extraction, normalization, validation

### Task 3: Support chara + ccv3 + worldbook validation

**Files:**
- Modify: `tavern-parser/src/index.js`
- Test: `tavern-parser/tests/card-detection.test.js`

- [ ] **Step 1: Write failing detection tests**

Create tests for:
1. `ccv3` base64 payload normalized to character data (`data.data`)
2. V2 `chara` payload detection
3. worldbook `entries[]` detection
4. invalid payload rejected

- [ ] **Step 2: Run tests to verify fail**

Run: `npm --prefix tavern-parser test -- tests/card-detection.test.js`
Expected: FAIL

- [ ] **Step 3: Implement extraction + detection + validation**

Add functions:
- `decodeBase64Json(value)`
- `extractCardPayload(metadata)` -> `{raw, sourceKey}`
- `normalizeCard(raw, sourceKey)` -> `{kind, format, data}`
- `validateNormalizedCard(normalized)`

Rules:
- `ccv3` valid when `spec/spec_version` present; payload data from `raw.data`
- worldbook metadata output must use `format: "worldbook"` (not character format)
- validation checks normalized `data` (fix V3 nested issue)

- [ ] **Step 4: Run tests to verify pass**

Run: `npm --prefix tavern-parser test -- tests/card-detection.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tavern-parser/src/index.js tavern-parser/tests/card-detection.test.js
git commit -m "feat: add card normalization and validation for v2/v3/worldbook"
```

---

## Chunk 4: Output formatters (MD/JSON/YAML)

### Task 4: Implement spec-compliant output content

**Files:**
- Modify: `tavern-parser/src/index.js`
- Test: `tavern-parser/tests/output-format.test.js`

- [ ] **Step 1: Write failing output tests**

Create tests for:
1. character markdown includes required sections
2. markdown contains `> 头像数据已省略` when avatar exists
3. worldbook metadata `format === "worldbook"`
4. `--include-avatar` controls JSON/YAML avatar field

- [ ] **Step 2: Run tests to verify fail**

Run: `npm --prefix tavern-parser test -- tests/output-format.test.js`
Expected: FAIL

- [ ] **Step 3: Implement formatters**

Add:
- `formatCharacterMarkdown(normalized, options)`
- `formatWorldbookMarkdown(normalized, options)`
- `formatJson(normalized, options)`
- `formatYaml(normalized, options)`

Requirements:
- character markdown must include avatar omission line when avatar exists
- if extracted avatar file exists, append `![头像](<file>)`
- worldbook JSON/YAML metadata:
  - `type: "worldbook"`
  - `metadata.format: "worldbook"`
- extracted embedded worldbook metadata includes `extracted_from_character`

- [ ] **Step 4: Run tests to verify pass**

Run: `npm --prefix tavern-parser test -- tests/output-format.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tavern-parser/src/index.js tavern-parser/tests/output-format.test.js
git commit -m "feat: add spec-compliant markdown json yaml formatters"
```

---

## Chunk 5: CLI flow (multi-input, skip accounting, safe entry)

### Task 5: Build executable command flow

**Files:**
- Modify: `tavern-parser/src/index.js`
- Modify: `tavern-parser/tests/cli-flow.test.js`

- [ ] **Step 1: Write failing CLI behavior tests**

Add tests for:
1. supports multiple inputs (`<inputs...>`)
2. expands directory to `*.png`
3. increments skip count when output conflict and no `--force/--suffix`
4. uses safe entry check (no `process.argv[1] === import.meta.url` bug)

- [ ] **Step 2: Run tests to verify fail**

Run: `npm --prefix tavern-parser test -- tests/cli-flow.test.js`
Expected: FAIL

- [ ] **Step 3: Implement CLI and execution path**

Implement:
- `buildProgram()` with `.argument('<inputs...>')`
- `collectInputFiles(inputs)` (glob + directory support)
- `resolveOutputPath(...)` returns `{path, skippedReason?}`
- `runParse(inputs, options)` updates stats `{success, failed, skipped}`
- entrypoint:
```js
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) await buildProgram().parseAsync(process.argv);
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm --prefix tavern-parser test -- tests/cli-flow.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tavern-parser/src/index.js tavern-parser/tests/cli-flow.test.js
git commit -m "feat: implement multi-input CLI flow and accurate skip accounting"
```

---

## Chunk 6: Embedded worldbook + avatar extraction naming

### Task 6: Match extraction naming and linkage requirements

**Files:**
- Modify: `tavern-parser/src/index.js`
- Modify: `tavern-parser/tests/output-format.test.js`

- [ ] **Step 1: Write failing extraction tests**

Add tests for:
1. embedded worldbook writes `{角色名}_worldbook.md/json/yaml`
2. avatar extract writes `{角色名}_avatar.png`
3. character metadata links extracted files

- [ ] **Step 2: Run tests to verify fail**

Run: `npm --prefix tavern-parser test -- tests/output-format.test.js`
Expected: FAIL

- [ ] **Step 3: Implement extraction outputs**

Implement helpers:
- `safeName(name)`
- `writeEmbeddedWorldbookFiles(characterName, worldbookData, options)`
- `extractAvatarFile(characterName, avatarBase64, options)`

Rules:
- filenames use character name, not source PNG filename
- embedded worldbook outputs all three formats
- add extraction source metadata + linkage in character output

- [ ] **Step 4: Run tests to verify pass**

Run: `npm --prefix tavern-parser test -- tests/output-format.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tavern-parser/src/index.js tavern-parser/tests/output-format.test.js
git commit -m "feat: extract embedded worldbook and avatar with character-name filenames"
```

---

## Chunk 7: Docs + final verification

### Task 7: README and release-safe commands

**Files:**
- Create: `tavern-parser/README.md`
- Modify: `tavern-parser/package.json`

- [ ] **Step 1: Write README with real commands only**

Include:
- install/local run
- single and multi-input examples
- output examples
- option table
- note: parser reads PNG metadata chunks (tEXt/iTXt/zTXt)

- [ ] **Step 2: Add package metadata without placeholders**

Set non-placeholder values or remove optional fields. Do not commit fake URLs.

- [ ] **Step 3: Run full tavern-parser tests**

Run: `npm --prefix tavern-parser test`
Expected: all tavern-parser tests PASS

- [ ] **Step 4: Run minimal smoke command**

Run: `node tavern-parser/src/index.js --help`
Expected: help text prints with options and exits 0

- [ ] **Step 5: Commit**

```bash
git add tavern-parser/README.md tavern-parser/package.json
git commit -m "docs: add standalone tavern-parser usage and package metadata"
```

---

## Final Quality Gate

- [ ] Run spec compliance review on implemented diffs
- [ ] Run code quality review on implemented diffs
- [ ] Ensure no broad staging commands used (`git add .` forbidden)
- [ ] Ensure no nested repo creation (`git init` forbidden)

---

## Notes for Execution in This Repository

- Implement under `C:/Users/PC/ai-novel-workshop-tavern-parser/tavern-parser/`
- Do **not** use root project tests as gate for this tool
- Use targeted tests under `tavern-parser/tests/`
