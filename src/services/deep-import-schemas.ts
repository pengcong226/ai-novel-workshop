/**
 * Deep Novel Import Pipeline — JSON Schema Constants for Tool Calling
 *
 * Three schemas for LLM structured output:
 *   1. EXTRACT_NOVEL_ENTITIES_SCHEMA — identify entities, updates, and relations
 *   2. EXTRACT_STATE_EVENTS_SCHEMA   — extract state changes per chapter
 *   3. EXTRACT_PLOT_EVENTS_SCHEMA    — extract plot-level events (Phase 3)
 *
 * Design rules:
 *   - additionalProperties: false on EVERY object (OpenAI Structured Outputs requirement)
 *   - All properties listed in required (no optional at schema level)
 *   - Non-applicable string fields use "" empty string instead of being optional
 *   - importanceChange uses enum with "" meaning "no change"
 *   - Every extracted item includes an evidence sub-object with quote + offset
 */

// Shared evidence sub-schema (inline in every item)
const evidenceSchema = {
  type: 'object' as const,
  additionalProperties: false,
  properties: {
    quote: { type: 'string' as const, description: 'Original text quote supporting this extraction (max 80 chars)' },
    offset: { type: 'number' as const, description: 'Character offset of the quote within the chapter content' }
  },
  required: ['quote', 'offset']
}

// ============================================================================
// Schema 1: extract_novel_entities
// ============================================================================

export const EXTRACT_NOVEL_ENTITIES_SCHEMA = {
  name: 'extract_novel_entities',
  description: 'Identify new entities, updates to known entities, and relations from a novel chapter',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      newEntities: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            chapterNumber: { type: 'number', description: '章节编号' },
            name: { type: 'string', description: 'Entity display name as it appears in the text' },
            aliases: {
              type: 'array',
              items: { type: 'string' },
              description: 'Alternative names, nicknames, titles used in the text'
            },
            type: {
              type: 'string',
              enum: ['CHARACTER', 'FACTION', 'LOCATION', 'LORE', 'ITEM', 'CONCEPT', 'WORLD'],
              description: 'Entity type classification'
            },
            importance: {
              type: 'string',
              enum: ['critical', 'major', 'minor', 'background'],
              description: 'How important this entity is to the story'
            },
            category: { type: 'string', description: 'Free-form category label (e.g., "protagonist", "sect", "weapon")' },
            description: { type: 'string', description: 'Detailed description or background of the entity' },
            evidence: evidenceSchema
          },
          required: ['chapterNumber', 'name', 'aliases', 'type', 'importance', 'category', 'description', 'evidence']
        }
      },
      entityUpdates: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            chapterNumber: { type: 'number', description: '该更新所在的章节编号' },
            entityName: { type: 'string', description: 'Name of a KNOWN entity that appears in this chapter with new information' },
            updatedDescription: { type: 'string', description: 'Updated description or additional background revealed in this chapter' },
            newAliases: {
              type: 'array',
              items: { type: 'string' },
              description: 'New aliases discovered in this chapter'
            },
            importanceChange: {
              type: 'string',
              enum: ['', 'critical', 'major', 'minor', 'background'],
              description: 'Importance change if chapter reveals a reclassification. Empty string means no change.'
            },
            evidence: evidenceSchema
          },
          required: ['chapterNumber', 'entityName', 'updatedDescription', 'newAliases', 'importanceChange', 'evidence']
        }
      },
      relations: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            chapterNumber: { type: 'number', description: '该关系出现的章节编号' },
            sourceName: { type: 'string', description: 'Source entity name' },
            targetName: { type: 'string', description: 'Target entity name' },
            relationType: { type: 'string', description: 'Relation type (e.g., master-disciple, ally, rival, parent-child)' },
            attitude: { type: 'string', description: 'Attitude descriptor (e.g., loyal, hostile, neutral, ambivalent)' },
            evidence: evidenceSchema
          },
          required: ['chapterNumber', 'sourceName', 'targetName', 'relationType', 'attitude', 'evidence']
        }
      }
    },
    required: ['newEntities', 'entityUpdates', 'relations']
  }
} as const

// ============================================================================
// Schema 2: extract_state_events
// ============================================================================

export const EXTRACT_STATE_EVENTS_SCHEMA = {
  name: 'extract_state_events',
  description: 'Extract state changes (property updates, relation changes, location moves, vital status changes, ability changes) from a novel chapter',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      events: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            chapterNumber: { type: 'number', description: '该状态事件发生的章节编号' },
            entityName: { type: 'string', description: 'Name of the entity this event applies to' },
            eventType: {
              type: 'string',
              enum: ['PROPERTY_UPDATE', 'RELATION_ADD', 'RELATION_REMOVE', 'RELATION_UPDATE', 'LOCATION_MOVE', 'VITAL_STATUS_CHANGE', 'ABILITY_CHANGE'],
              description: 'The state event type'
            },
            key: { type: 'string', description: 'For PROPERTY_UPDATE: the property key. Empty string if not applicable.' },
            value: { type: 'string', description: 'For PROPERTY_UPDATE: the new value. Empty string if not applicable.' },
            targetName: { type: 'string', description: 'For RELATION events: target entity name. Empty string if not applicable.' },
            relationType: { type: 'string', description: 'For RELATION_ADD/REMOVE: relation type. Empty string if not applicable.' },
            attitude: { type: 'string', description: 'For RELATION_UPDATE: new attitude. Empty string if not applicable.' },
            status: { type: 'string', description: 'For VITAL_STATUS_CHANGE: the new status. Empty string if not applicable.' },
            abilityName: { type: 'string', description: 'For ABILITY_CHANGE: ability name. Empty string if not applicable.' },
            abilityStatus: { type: 'string', description: 'For ABILITY_CHANGE: ability status (active/sealed/lost). Empty string if not applicable.' },
            locationDescription: { type: 'string', description: 'For LOCATION_MOVE: new location description. Empty string if not applicable.' },
            evidence: evidenceSchema
          },
          required: ['chapterNumber', 'entityName', 'eventType', 'key', 'value', 'targetName', 'relationType', 'attitude', 'status', 'abilityName', 'abilityStatus', 'locationDescription', 'evidence']
        }
      }
    },
    required: ['events']
  }
} as const

// ============================================================================
// Schema 3: extract_plot_events (defined now, invoked in Phase 3)
// ============================================================================

export const PLOT_EXTRACTION_SYSTEM = `你是一位专业的情节分析师。你的任务是从给定章节中提取关键的情节事件。

规则：
1. 只提取对整体剧情有重大影响的事件
2. foreshadowing_planted: 埋下伏笔或悬念
3. foreshadowing_resolved: 回收之前的伏笔
4. turning_point: 重大转折点
5. climax: 高潮场景
6. revelation: 重大真相揭露
7. betrayal: 背叛事件
8. alliance_formed/broken: 联盟的建立或破裂
9. power_shift: 力量格局变化
10. sacrifice: 重大牺牲
11. importance: 1-10分，10为世界级影响
12. 每个事件必须附带原文引用和字符偏移`

export const EXTRACT_PLOT_EVENTS_SCHEMA = {
  name: 'extract_plot_events',
  description: 'Extract plot-level events (foreshadowing, turning points, climax, betrayals, alliances) from a novel chapter for rewrite and continuation workflows',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      plotEvents: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            chapterNumber: { type: 'number', description: '该情节事件所在的章节编号' },
            description: { type: 'string', description: 'What happened in this plot event' },
            type: {
              type: 'string',
              enum: ['foreshadowing_planted', 'foreshadowing_resolved', 'turning_point', 'climax', 'revelation', 'betrayal', 'alliance_formed', 'alliance_broken', 'power_shift', 'sacrifice'],
              description: 'Classification of the plot event'
            },
            importance: {
              type: 'number',
              description: 'Importance on a 1-10 scale where 10 is world-changing'
            },
            involvedEntities: {
              type: 'array',
              items: { type: 'string' },
              description: 'Entity names involved in this event'
            },
            estimatedResolutionChapter: {
              type: 'number',
              description: 'If foreshadowing_planted: best guess for which chapter resolves it. 0 if unknown.'
            },
            resolvedForeshadowingFromChapter: {
              type: 'number',
              description: 'If foreshadowing_resolved: which chapter planted it. 0 if not applicable.'
            },
            evidence: evidenceSchema
          },
          required: ['chapterNumber', 'description', 'type', 'importance', 'involvedEntities', 'estimatedResolutionChapter', 'resolvedForeshadowingFromChapter', 'evidence']
        }
      }
    },
    required: ['plotEvents']
  }
} as const

// ============================================================================
// Schema 4: quick_scan_chapter (Smart Sampling mode only)
// ============================================================================

export const QUICK_SCAN_CHAPTER_SCHEMA = {
  name: 'quick_scan_chapter',
  description: 'Quickly determine if a chapter is a key chapter for entity/state extraction',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      isKeyChapter: { type: 'boolean', description: 'Whether this chapter introduces significant new entities or state changes' },
      reason: { type: 'string', description: 'Brief reason for the classification' },
      mentionedEntities: {
        type: 'array',
        items: { type: 'string' },
        description: 'Entity names mentioned in this chapter'
      }
    },
    required: ['isKeyChapter', 'reason', 'mentionedEntities']
  }
} as const
