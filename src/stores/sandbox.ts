import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Entity, StateEvent, EntityRelation } from '../types/sandbox';

export interface ActiveEntityState extends Entity {
  properties: Record<string, string>;
  relations: EntityRelation[];
  location: { x: number, y: number } | null;
}

export const useSandboxStore = defineStore('sandbox', () => {
  const entities = ref<Entity[]>([]);
  const stateEvents = ref<StateEvent[]>([]);
  const currentChapter = ref<number>(1);

  const draftEntities = ref<Entity[]>([]);
  const draftRelations = ref<{ sourceId: string; relation: EntityRelation }[]>([]);
  const isWizardMode = ref(false);
  const isLoaded = ref(false);
  const isLoading = ref(false);

  // Note: loadData is mocked since it's used in commitDrafts but not implemented in this minimal version
  async function loadData(_projectId: string) {
    isLoaded.value = true;
    // mock implementation
  }
  // Computed state reducer
  const activeEntitiesState = computed(() => {
    // Return a shallow copy of base entities structure
    const reducedState: Record<string, ActiveEntityState> = {};

    entities.value.forEach(entity => {
      reducedState[entity.id] = {
        ...entity,
        properties: {},
        relations: [],
        location: null
      };
    });

    // Reduce stateEvents up to currentChapter
    const relevantEvents = stateEvents.value
      .filter(event => event.chapterNumber <= currentChapter.value)
      .sort((a, b) => a.chapterNumber - b.chapterNumber);

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
            target.relations = target.relations.filter((r: EntityRelation) => r.targetId !== event.payload.targetId);
          }
          break;
        case 'LOCATION_MOVE':
          if (event.payload.coordinates) {
            target.location = event.payload.coordinates;
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
      console.warn("No project ID found to commit drafts");
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
          id: crypto.randomUUID(),
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
      console.error("Failed to commit some drafts:", e);
      throw e;
    }
  }

  return {
    entities, stateEvents, currentChapter, activeEntitiesState,
    isLoading, isLoaded, loadData,
    draftEntities, draftRelations, isWizardMode, clearDrafts, addDraftEntity, addDraftRelation, commitDrafts
  };
});