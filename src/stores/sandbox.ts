import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { v4 as uuidv4 } from 'uuid';
import type { Entity, StateEvent, EntityRelation } from '../types/sandbox';
import { getLogger } from '@/utils/logger';

const logger = getLogger('sandbox:store');

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

  async function loadData(projectId: string) {
    if (!projectId) return;

    isLoading.value = true;
    try {
      const { invoke } = await import('@tauri-apps/api/core');

      const entitiesJson = await invoke<string>('load_entities', { projectId });
      entities.value = JSON.parse(entitiesJson);

      const eventsJson = await invoke<string>('load_state_events', { projectId });
      stateEvents.value = JSON.parse(eventsJson);

      isLoaded.value = true;
    } catch (e) {
      logger.error('Failed to load sandbox data:', e);
      entities.value = [];
      stateEvents.value = [];
    } finally {
      isLoading.value = false;
    }
  }

  async function addEntity(entity: Entity) {
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
    const { invoke } = await import('@tauri-apps/api/core');
    try {
      await invoke('save_state_event', {
        projectId: event.projectId,
        eventJson: JSON.stringify(event)
      });
      stateEvents.value.push(event);
      stateEvents.value.sort((a, b) => a.chapterNumber - b.chapterNumber);
    } catch (e) {
      logger.error('Failed to add state event:', e);
      throw e;
    }
  }
  async function deleteEntity(id: string) {
    const entity = entities.value.find(e => e.id === id);
    if (!entity) return;

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

  // Computed state reducer
  const activeEntitiesState = computed(() => {
    const reducedState: Record<string, ResolvedEntity> = {};

    entities.value.forEach(entity => {
      reducedState[entity.id] = {
        ...entity,
        properties: {},
        relations: [],
        location: null,
        vitalStatus: 'alive',
        abilities: []
      };
    });

    const combinedEvents = [...stateEvents.value, ...pendingStateEvents.value];

    if (pendingStateEvents.value.length > 0) {
      combinedEvents.sort((a, b) => a.chapterNumber - b.chapterNumber);
    }

    const relevantEvents = combinedEvents
      .filter(event => event.chapterNumber <= currentChapter.value);

    relevantEvents.forEach(event => {
      const target = reducedState[event.entityId];
      if (!target) return;

      switch (event.eventType) {
        case 'PROPERTY_UPDATE':
          if (event.payload.key && event.payload.value !== undefined) {
            target.properties[event.payload.key] = event.payload.value;
          }
          break;
        case 'RELATION_ADD':
          if (event.payload.targetId && event.payload.relationType) {
            target.relations.push({
              targetId: event.payload.targetId,
              type: event.payload.relationType,
              attitude: event.payload.attitude
            });
          }
          break;
        case 'RELATION_REMOVE':
          if (event.payload.targetId) {
            target.relations = target.relations.filter((r: EntityRelation) => r.targetId !== event.payload.targetId || (event.payload.relationType && r.type !== event.payload.relationType));
          }
          break;
        case 'RELATION_UPDATE':
          if (event.payload.targetId && event.payload.attitude) {
            const rel = target.relations.find((r: EntityRelation) => r.targetId === event.payload.targetId);
            if (rel) {
              rel.attitude = event.payload.attitude;
            }
          }
          break;
        case 'LOCATION_MOVE':
          if (event.payload.coordinates) {
            target.location = event.payload.coordinates;
          }
          break;
        case 'VITAL_STATUS_CHANGE':
          if (event.payload.status) {
            target.vitalStatus = event.payload.status;
          }
          break;
        case 'ABILITY_CHANGE':
          if (event.payload.abilityName && event.payload.abilityStatus) {
            const existing = target.abilities.find(a => a.name === event.payload.abilityName);
            if (existing) {
              existing.status = event.payload.abilityStatus as AbilityRecord['status'];
            } else {
              target.abilities.push({
                name: event.payload.abilityName,
                status: event.payload.abilityStatus as AbilityRecord['status'],
                acquiredChapter: event.chapterNumber
              });
            }
          }
          break;
      }
    });

    return reducedState;
  });

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
    const { invoke } = await import('@tauri-apps/api/core');

    const projectId = draftEntities.value[0]?.projectId || entities.value[0]?.projectId || '';

    if (!projectId) {
      logger.warn("No project ID found to commit drafts");
      return;
    }

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

  return {
    entities, stateEvents, pendingStateEvents, currentChapter, activeEntitiesState,
    isLoading, isLoaded, loadData,
    draftEntities, draftRelations, isWizardMode, clearDrafts, addDraftEntity, addDraftRelation, commitDrafts,
    addEntity, updateEntity, deleteEntity, addStateEvent, deleteStateEvent
  };
});