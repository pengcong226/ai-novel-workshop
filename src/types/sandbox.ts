export type EntityType = 'CHARACTER' | 'FACTION' | 'LOCATION' | 'LORE' | 'ITEM' | 'CONCEPT' | 'WORLD';
export type EntityImportance = 'critical' | 'major' | 'minor' | 'background';

export interface SpeechPattern {
  formality: 'formal' | 'casual' | 'mixed'
  vocabulary: 'simple' | 'moderate' | 'literary'
  sentenceLength: 'short' | 'medium' | 'long'
  quirks: string[]
  catchphrases: string[]
}

export interface Entity {
  id: string;
  projectId: string;
  type: EntityType;
  name: string;
  aliases: string[];
  importance: EntityImportance;
  category: string;
  systemPrompt: string;
  /** 实体描述（兼容旧代码） */
  description?: string;
  /** 角色语言风格档案（可选） */
  speechProfile?: SpeechPattern;
  visualMeta?: {
    color?: string;
    icon?: string;
    defaultCoordinates?: { x: number; y: number };
    worldbookUid?: string;
  };
  isArchived: boolean;
  createdAt: number;
}

export interface EntityRelation {
  targetId: string;
  type: string;
  attitude?: string;
}

export type StateEventType =
  | 'PROPERTY_UPDATE'
  | 'RELATION_ADD'
  | 'RELATION_REMOVE'
  | 'RELATION_UPDATE'
  | 'LOCATION_MOVE'
  | 'VITAL_STATUS_CHANGE'
  | 'ABILITY_CHANGE';

export interface StateEvent {
  id: string;
  projectId: string;
  chapterNumber: number;
  entityId: string;
  eventType: StateEventType;
  payload: {
    key?: string;
    value?: string;
    targetId?: string;
    relationType?: string;
    attitude?: string;
    coordinates?: { x: number; y: number };
    status?: string;
    abilityName?: string;
    abilityStatus?: string;
  };
  source: 'MANUAL' | 'AI_EXTRACTED' | 'MIGRATION';
}
