import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { v4 as uuidv4 } from 'uuid';
import type { Entity, StateEvent, EntityRelation } from '../types/sandbox';
import type { EntityStateSnapshot } from '../types/rewrite-continuation';
import { captureSnapshot, replayReducer } from '@/utils/stateDiff';
import { buildNameToIdMapFromEntities } from '@/utils/entityHelpers';
import { getLogger } from '@/utils/logger';
import { isWebRuntime } from '@/utils/anthropic-guard';
import { buildStateEventIndexes, sortStateEventsByChapter } from '@/utils/stateEventIndexes';

const logger = getLogger('sandbox:store');

const ENTITY_TYPES = new Set([
  'CHARACTER', 'FACTION', 'LOCATION', 'LORE', 'ITEM', 'CONCEPT', 'WORLD'
] as const);

const ENTITY_IMPORTANCE = new Set(['critical', 'major', 'minor', 'background'] as const);

const STATE_EVENT_TYPES = new Set([
  'PROPERTY_UPDATE',
  'RELATION_ADD',
  'RELATION_REMOVE',
  'RELATION_UPDATE',
  'LOCATION_MOVE',
  'VITAL_STATUS_CHANGE',
  'ABILITY_CHANGE'
] as const);

const STATE_EVENT_SOURCES = new Set(['MANUAL', 'AI_EXTRACTED', 'MIGRATION'] as const);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function isLoadedEntity(value: unknown): value is Omit<Entity, 'projectId'> & { projectId?: string } {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === 'string' &&
    (value.projectId === undefined || typeof value.projectId === 'string') &&
    typeof value.type === 'string' &&
    ENTITY_TYPES.has(value.type as Entity['type']) &&
    typeof value.name === 'string' &&
    isStringArray(value.aliases) &&
    typeof value.importance === 'string' &&
    ENTITY_IMPORTANCE.has(value.importance as Entity['importance']) &&
    typeof value.category === 'string' &&
    typeof value.systemPrompt === 'string' &&
    typeof value.isArchived === 'boolean' &&
    typeof value.createdAt === 'number'
  );
}

function isLoadedStateEvent(value: unknown): value is Omit<StateEvent, 'projectId'> & { projectId?: string } {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === 'string' &&
    (value.projectId === undefined || typeof value.projectId === 'string') &&
    typeof value.chapterNumber === 'number' &&
    typeof value.entityId === 'string' &&
    typeof value.eventType === 'string' &&
    STATE_EVENT_TYPES.has(value.eventType as StateEvent['eventType']) &&
    isRecord(value.payload) &&
    typeof value.source === 'string' &&
    STATE_EVENT_SOURCES.has(value.source as StateEvent['source'])
  );
}

function parseEntityArray(rawJson: string, fallbackProjectId: string): Entity[] | null {
  try {
    const parsed: unknown = JSON.parse(rawJson);
    if (!Array.isArray(parsed) || !parsed.every(isLoadedEntity)) return null;
    return parsed.map(entity => ({
      ...entity,
      projectId: entity.projectId ?? fallbackProjectId
    }));
  } catch {
    return null;
  }
}

function parseStateEventArray(rawJson: string, fallbackProjectId: string): StateEvent[] | null {
  try {
    const parsed: unknown = JSON.parse(rawJson);
    if (!Array.isArray(parsed) || !parsed.every(isLoadedStateEvent)) return null;
    return parsed.map(event => ({
      ...event,
      projectId: event.projectId ?? fallbackProjectId
    }));
  } catch {
    return null;
  }
}

export interface AbilityRecord {
  name: string;
  status: 'active' | 'sealed' | 'lost';
  acquiredChapter: number;
}

export interface ResolvedEntity extends Entity {
  properties: Record<string, string>;
  relations: EntityRelation[];
  location: { x: number, y: number } | null;
  vitalStatus: string;
  abilities: AbilityRecord[];
}

const WEB_SANDBOX_PREFIX = 'ai-novel-workshop:sandbox'

function webSandboxKey(projectId: string, kind: 'entities' | 'state-events'): string {
  return `${WEB_SANDBOX_PREFIX}:${projectId}:${kind}`
}

function loadWebSandboxEntities(projectId: string): Entity[] | null {
  return parseEntityArray(localStorage.getItem(webSandboxKey(projectId, 'entities')) ?? '[]', projectId)
}

function loadWebSandboxStateEvents(projectId: string): StateEvent[] | null {
  return parseStateEventArray(localStorage.getItem(webSandboxKey(projectId, 'state-events')) ?? '[]', projectId)
}

function saveWebSandboxEntities(projectId: string, nextEntities: Entity[]): void {
  localStorage.setItem(webSandboxKey(projectId, 'entities'), JSON.stringify(nextEntities))
}

function saveWebSandboxStateEvents(projectId: string, nextEvents: StateEvent[]): void {
  localStorage.setItem(webSandboxKey(projectId, 'state-events'), JSON.stringify(nextEvents))
}

export const useSandboxStore = defineStore('sandbox', () => {
  const entities = ref<Entity[]>([]);
  const stateEvents = ref<StateEvent[]>([]);
  const pendingStateEvents = ref<StateEvent[]>([]);
  const isLoading = ref(false);
  const isLoaded = ref(false);
  const currentChapter = ref<number>(1);
  const draftEntities = ref<Entity[]>([]);
  const draftRelations = ref<{ sourceId: string; relation: EntityRelation }[]>([]);
  const isWizardMode = ref(false);

  // Pre-filtered entity views by type (non-archived)
  const activeEntities = computed(() => entities.value.filter(e => !e.isArchived));
  const characterEntities = computed(() => activeEntities.value.filter(e => e.type === 'CHARACTER'));
  const loreEntities = computed(() => activeEntities.value.filter(e => e.type === 'LORE'));
  const locationEntities = computed(() => activeEntities.value.filter(e => e.type === 'LOCATION'));
  const factionEntities = computed(() => activeEntities.value.filter(e => e.type === 'FACTION'));

  function entitiesByType(type: Entity['type']): Entity[] {
    return activeEntities.value.filter(e => e.type === type);
  }

  async function loadData(projectId: string) {
    if (!projectId) return;

    isLoading.value = true;
    try {
      if (isWebRuntime()) {
        const parsedEntities = loadWebSandboxEntities(projectId);
        const parsedStateEvents = loadWebSandboxStateEvents(projectId);

        if (!parsedEntities || !parsedStateEvents) {
          entities.value = [];
          stateEvents.value = [];
          isLoaded.value = false;
          return;
        }

        entities.value = parsedEntities;
        stateEvents.value = sortStateEventsByChapter(parsedStateEvents);
        isLoaded.value = true;
        return;
      }

      const { invoke } = await import('@tauri-apps/api/core');

      const [entitiesJson, eventsJson] = await Promise.all([
        invoke<string>('load_entities', { projectId }),
        invoke<string>('load_state_events', { projectId })
      ]);

      const parsedEntities = parseEntityArray(entitiesJson, projectId);
      const parsedStateEvents = parseStateEventArray(eventsJson, projectId);

      if (!parsedEntities) {
        logger.error('Failed to parse or validate entities JSON');
      }

      if (!parsedStateEvents) {
        logger.error('Failed to parse or validate state events JSON');
      }

      if (!parsedEntities || !parsedStateEvents) {
        entities.value = [];
        stateEvents.value = [];
        isLoaded.value = false;
        return;
      }

      entities.value = parsedEntities;
      stateEvents.value = sortStateEventsByChapter(parsedStateEvents);
      isLoaded.value = true;
    } catch (e) {
      logger.error('Failed to load sandbox data:', e);
      entities.value = [];
      stateEvents.value = [];
      isLoaded.value = false;
    } finally {
      isLoading.value = false;
    }
  }

  async function addEntity(entity: Entity) {
    if (isWebRuntime()) {
      const merged = new Map(entities.value.map(existing => [existing.id, existing]));
      merged.set(entity.id, entity);
      const nextEntities = [...merged.values()];
      saveWebSandboxEntities(entity.projectId, nextEntities);
      entities.value = nextEntities;
      return;
    }

    const { invoke } = await import('@tauri-apps/api/core');
    try {
      await invoke('save_entity', {
        projectId: entity.projectId,
        entityJson: JSON.stringify(entity)
      });
      entities.value.push(entity);
    } catch (e) {
      logger.error('Failed to add entity:', e);
      throw e;
    }
  }

  async function updateEntity(id: string, updates: Partial<Entity>) {
    const index = entities.value.findIndex(e => e.id === id);
    if (index === -1) return;

    const updated = { ...entities.value[index], ...updates };

    if (isWebRuntime()) {
      saveWebSandboxEntities(updated.projectId, [
        ...entities.value.slice(0, index),
        updated,
        ...entities.value.slice(index + 1),
      ]);
      entities.value[index] = updated;
      return;
    }

    const { invoke } = await import('@tauri-apps/api/core');
    try {
      await invoke('save_entity', {
        projectId: updated.projectId,
        entityJson: JSON.stringify(updated)
      });
      entities.value[index] = updated;
    } catch (e) {
      logger.error('Failed to update entity:', e);
      throw e;
    }
  }

  async function addStateEvent(event: StateEvent) {
    if (isWebRuntime()) {
      const merged = new Map(stateEvents.value.map(existing => [existing.id, existing]));
      merged.set(event.id, event);
      const nextEvents = sortStateEventsByChapter([...merged.values()]);
      saveWebSandboxStateEvents(event.projectId, nextEvents);
      stateEvents.value = nextEvents;
      return;
    }

    const { invoke } = await import('@tauri-apps/api/core');
    try {
      await invoke('save_state_event', {
        projectId: event.projectId,
        eventJson: JSON.stringify(event)
      });
      stateEvents.value.push(event);
      stateEvents.value = sortStateEventsByChapter(stateEvents.value);
    } catch (e) {
      logger.error('Failed to add state event:', e);
      throw e;
    }
  }
  async function deleteEntity(id: string) {
    const entity = entities.value.find(e => e.id === id);
    if (!entity) return;

    if (isWebRuntime()) {
      const nextEntities = entities.value.filter(e => e.id !== id);
      const nextEvents = stateEvents.value.filter(e => e.entityId !== id);
      saveWebSandboxEntities(entity.projectId, nextEntities);
      saveWebSandboxStateEvents(entity.projectId, nextEvents);
      entities.value = nextEntities;
      stateEvents.value = nextEvents;
      return;
    }

    const { invoke } = await import('@tauri-apps/api/core');
    try {
      await invoke('delete_entity', {
        projectId: entity.projectId,
        entityId: id
      });
      entities.value = entities.value.filter(e => e.id !== id);
      stateEvents.value = stateEvents.value.filter(e => e.entityId !== id);
    } catch (e) {
      logger.error('Failed to delete entity:', e);
      throw e;
    }
  }

  async function deleteStateEvent(id: string) {
    const event = stateEvents.value.find(e => e.id === id);
    if (!event) return;

    if (isWebRuntime()) {
      const nextEvents = stateEvents.value.filter(e => e.id !== id);
      saveWebSandboxStateEvents(event.projectId, nextEvents);
      stateEvents.value = nextEvents;
      return;
    }

    const { invoke } = await import('@tauri-apps/api/core');
    try {
      await invoke('delete_state_event', {
        projectId: event.projectId,
        eventId: id
      });
      stateEvents.value = stateEvents.value.filter(e => e.id !== id);
    } catch (e) {
      logger.error('Failed to delete state event:', e);
      throw e;
    }
  }

  // Computed state reducer — delegates to the canonical replayReducer in stateDiff.ts
  const activeEntitiesState = computed(() => {
    const combinedEvents = [...stateEvents.value, ...pendingStateEvents.value];
    const reduced = replayReducer(entities.value, combinedEvents, currentChapter.value);

    // Map ReducedEntity → ResolvedEntity (merge Entity base fields with reducer output)
    const result: Record<string, ResolvedEntity> = {};
    for (const entity of entities.value) {
      const r = reduced[entity.id];
      if (!r) continue;
      result[entity.id] = {
        ...entity,
        properties: r.properties,
        relations: r.relations.map(rel => ({ targetId: rel.targetId, type: rel.type, attitude: rel.attitude })),
        location: r.location ? (() => {
          const parts = r.location.split(',');
          return parts.length === 2 ? { x: Number(parts[0]), y: Number(parts[1]) } : null;
        })() : null,
        vitalStatus: r.vitalStatus,
        abilities: r.abilities.map(a => ({ name: a.name, status: a.status as AbilityRecord['status'], acquiredChapter: a.acquiredChapter }))
      };
    }
    return result;
  });

  const stateEventIndexes = computed(() => buildStateEventIndexes(stateEvents.value));

  function clearDrafts() {
    draftEntities.value = [];
    draftRelations.value = [];
  }

  function addDraftEntity(entity: Entity) {
    draftEntities.value.push(entity);
  }

  function addDraftRelation(sourceId: string, relation: EntityRelation) {
    draftRelations.value.push({ sourceId, relation });
  }

  async function commitDrafts() {
    const projectId = draftEntities.value[0]?.projectId || entities.value[0]?.projectId || '';

    if (!projectId) {
      logger.warn("No project ID found to commit drafts");
      return;
    }

    if (isWebRuntime()) {
      const relationEvents = draftRelations.value.map(draftRel => ({
        id: uuidv4(),
        projectId,
        chapterNumber: 0,
        entityId: draftRel.sourceId,
        eventType: 'RELATION_ADD' as const,
        payload: {
          targetId: draftRel.relation.targetId,
          relationType: draftRel.relation.type,
          attitude: draftRel.relation.attitude
        },
        source: 'MANUAL' as const
      }));
      await batchAddEntities(draftEntities.value);
      await batchAddStateEvents(relationEvents);
      clearDrafts();
      return;
    }

    const { invoke } = await import('@tauri-apps/api/core');

    try {
      // Save draft entities
      const entityPromises = draftEntities.value.map(entity =>
        invoke('save_entity', {
          projectId: entity.projectId,
          entityJson: JSON.stringify(entity)
        })
      );
      await Promise.all(entityPromises);

      // Save draft relations as StateEvents (assume chapter 1 or baseline)
      const relationPromises = draftRelations.value.map(draftRel => {
        const event: StateEvent = {
          id: uuidv4(),
          projectId,
          chapterNumber: 0,
          entityId: draftRel.sourceId,
          eventType: 'RELATION_ADD',
          payload: {
            targetId: draftRel.relation.targetId,
            relationType: draftRel.relation.type,
            attitude: draftRel.relation.attitude
          },
          source: 'MANUAL'
        };

        return invoke('save_state_event', {
          projectId: event.projectId,
          eventJson: JSON.stringify(event)
        });
      });
      await Promise.all(relationPromises);

      // Reload the store
      clearDrafts();
      isLoaded.value = false;
      await loadData(projectId);
    } catch (e) {
      logger.error("Failed to commit some drafts:", e);
      throw e;
    }
  }

  async function batchAddEntities(newEntities: Entity[]) {
    if (newEntities.length === 0) return;

    if (isWebRuntime()) {
      const projectId = newEntities[0].projectId;
      if (!projectId) throw new Error('batchAddEntities: entities must have a projectId');
      const merged = new Map(entities.value.map(entity => [entity.id, entity]));
      for (const entity of newEntities) {
        merged.set(entity.id, entity);
      }
      const nextEntities = [...merged.values()];
      saveWebSandboxEntities(projectId, nextEntities);
      entities.value = nextEntities;
      return;
    }

    const { invoke } = await import('@tauri-apps/api/core');
    const projectId = newEntities[0].projectId;
    if (!projectId) throw new Error('batchAddEntities: entities must have a projectId');
    try {
      await invoke('batch_save_entities', {
        projectId,
        entitiesJson: JSON.stringify(newEntities)
      });

      const merged = new Map(entities.value.map(entity => [entity.id, entity]));
      for (const entity of newEntities) {
        merged.set(entity.id, entity);
      }
      entities.value = [...merged.values()];
    } catch (e) {
      logger.error('Failed to batch add entities:', e);
      throw e;
    }
  }

  async function batchAddStateEvents(events: StateEvent[]) {
    if (events.length === 0) return;

    if (isWebRuntime()) {
      const projectId = events[0].projectId;
      if (!projectId) throw new Error('batchAddStateEvents: events must have a projectId');
      const merged = new Map(stateEvents.value.map(event => [event.id, event]));
      for (const event of events) {
        merged.set(event.id, event);
      }
      const nextEvents = sortStateEventsByChapter([...merged.values()]);
      saveWebSandboxStateEvents(projectId, nextEvents);
      stateEvents.value = nextEvents;
      return;
    }

    const { invoke } = await import('@tauri-apps/api/core');
    const projectId = events[0].projectId;
    if (!projectId) throw new Error('batchAddStateEvents: events must have a projectId');
    try {
      await invoke('batch_save_state_events', {
        projectId,
        eventsJson: JSON.stringify(events)
      });

      const merged = new Map(stateEvents.value.map(event => [event.id, event]));
      for (const event of events) {
        merged.set(event.id, event);
      }
      stateEvents.value = sortStateEventsByChapter([...merged.values()]);
    } catch (e) {
      logger.error('Failed to batch add state events:', e);
      throw e;
    }
  }

  async function deleteStateEventsByChapterRange(startChapter: number, endChapter: number) {
    const projectId = stateEvents.value[0]?.projectId || entities.value[0]?.projectId;
    if (!projectId) throw new Error('deleteStateEventsByChapterRange: no project loaded');

    if (isWebRuntime()) {
      const nextEvents = stateEvents.value.filter(
        e => e.chapterNumber < startChapter || e.chapterNumber > endChapter
      );
      saveWebSandboxStateEvents(projectId, nextEvents);
      stateEvents.value = nextEvents;
      return;
    }

    const { invoke } = await import('@tauri-apps/api/core');

    try {
      await invoke('delete_state_events_by_range', { projectId, startChapter, endChapter });
      stateEvents.value = stateEvents.value.filter(
        e => e.chapterNumber < startChapter || e.chapterNumber > endChapter
      );
    } catch (e) {
      logger.error('Failed to delete state events by range:', e);
      throw e;
    }
  }

  async function deleteEntitiesByIds(ids: string[]) {
    if (ids.length === 0) return;

    const uniqueIds = [...new Set(ids)];
    const existingIdSet = new Set(entities.value.map(e => e.id));
    const idsToDelete = uniqueIds.filter(id => existingIdSet.has(id));
    if (idsToDelete.length === 0) return;

    const idSet = new Set(idsToDelete);
    const projectId =
      entities.value.find(e => idSet.has(e.id))?.projectId ||
      entities.value[0]?.projectId ||
      stateEvents.value[0]?.projectId;

    if (!projectId) throw new Error('deleteEntitiesByIds: no project loaded');

    if (isWebRuntime()) {
      const nextEntities = entities.value.filter(e => !idSet.has(e.id));
      const nextEvents = stateEvents.value.filter(e => !idSet.has(e.entityId));
      saveWebSandboxEntities(projectId, nextEntities);
      saveWebSandboxStateEvents(projectId, nextEvents);
      entities.value = nextEntities;
      stateEvents.value = nextEvents;
      return;
    }

    const { invoke } = await import('@tauri-apps/api/core');
    const results = await Promise.allSettled(
      idsToDelete.map(id => invoke('delete_entity', { projectId, entityId: id }))
    );

    const deletedIds = new Set<string>();
    const failures: Array<{ id: string; reason: string }> = [];

    results.forEach((result, index) => {
      const id = idsToDelete[index];
      if (result.status === 'fulfilled') {
        deletedIds.add(id);
        return;
      }

      const reason = result.reason instanceof Error
        ? result.reason.message
        : String(result.reason);
      failures.push({ id, reason });
    });

    if (failures.length === 0) {
      entities.value = entities.value.filter(e => !deletedIds.has(e.id));
      stateEvents.value = stateEvents.value.filter(e => !deletedIds.has(e.entityId));
      return;
    }

    const failureSummary = failures.map(f => `${f.id}(${f.reason})`).join(', ');
    logger.error('Failed to delete some entities by IDs:', failures);

    try {
      await loadData(projectId);
      if (!isLoaded.value) {
        throw new Error('Sandbox reload returned invalid data');
      }
    } catch (reloadError) {
      logger.error('Failed to reload sandbox data after partial deletion:', reloadError);
      if (deletedIds.size > 0) {
        entities.value = entities.value.filter(e => !deletedIds.has(e.id));
        stateEvents.value = stateEvents.value.filter(e => !deletedIds.has(e.entityId));
      }
      const reloadMessage = reloadError instanceof Error
        ? reloadError.message
        : String(reloadError);
      throw new Error(`Failed to delete entities: ${failureSummary}; reload failed: ${reloadMessage}`);
    }

    throw new Error(`Failed to delete entities: ${failureSummary}`);
  }

  function getStateSnapshotAt(chapterNumber: number): EntityStateSnapshot[] {
    return captureSnapshot(entities.value, stateEvents.value, chapterNumber);
  }

  function buildNameToIdMap(): Record<string, string> {
    return buildNameToIdMapFromEntities(entities.value);
  }

  return {
    entities, stateEvents, pendingStateEvents, currentChapter, activeEntitiesState, stateEventIndexes,
    activeEntities, characterEntities, loreEntities, locationEntities, factionEntities, entitiesByType,
    isLoading, isLoaded, loadData,
    draftEntities, draftRelations, isWizardMode, clearDrafts, addDraftEntity, addDraftRelation, commitDrafts,
    addEntity, updateEntity, deleteEntity, addStateEvent, deleteStateEvent,
    batchAddEntities, batchAddStateEvents,
    deleteStateEventsByChapterRange, deleteEntitiesByIds, getStateSnapshotAt, buildNameToIdMap
  };
});