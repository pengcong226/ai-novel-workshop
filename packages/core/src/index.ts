/**
 * @ai-novel-workshop/core
 *
 * Core pipeline and agent logic extracted for CLI and external use.
 * This package re-exports from the main src/ directory.
 */

// Pipeline
export { PipelineRunner } from '../../../src/services/pipeline/PipelineRunner'
export { BatchContinueScheduler } from '../../../src/services/pipeline/BatchContinueScheduler'
export type { PipelineConfig, ChapterPipelineResult, WriteNextChapterOptions } from '../../../src/services/pipeline/types'

// Agents
export { ContinuityAuditor, AUDIT_DIMENSIONS } from '../../../src/agents/ContinuityAuditor'
export { ComposerAgent } from '../../../src/agents/ComposerAgent'
export { ReviserAgent } from '../../../src/agents/ReviserAgent'
export { StateSettler } from '../../../src/agents/StateSettler'
export { ObserverAgent } from '../../../src/agents/ObserverAgent'
export { StyleAnalyzerAgent } from '../../../src/agents/StyleAnalyzerAgent'

// Genre Profiles
export { getGenreProfile, registerGenreProfile, getAllGenreProfiles, GENRE_IDS, GENRE_LABELS } from '../../../src/types/genreProfile'
export { registerAllGenres } from '../../../src/data/genres'

// Natural Language Router
export { NaturalLanguageRouter } from '../../../src/services/NaturalLanguageRouter'

// Daemon
export { DaemonService } from '../../../src/services/DaemonService'
