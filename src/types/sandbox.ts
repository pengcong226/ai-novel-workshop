export type EntityType = 'CHARACTER' | 'FACTION' | 'LOCATION' | 'LORE' | 'ITEM';

export interface Entity {
  id: string;
  projectId: string;
  type: EntityType;
  name: string;
  category: string;
  systemPrompt: string;
  visualMeta?: {
    color?: string;
    icon?: string;
    defaultCoordinates?: { x: number; y: number };
  };
  createdAt: number;
}

export type StateEventType = 'PROPERTY_UPDATE' | 'RELATION_ADD' | 'RELATION_REMOVE' | 'RELATION_UPDATE' | 'LOCATION_MOVE';

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
  };
  source: 'MANUAL' | 'AI_EXTRACTED';
}
