import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Entity, StateEvent, EntityRelation } from '../types/sandbox';

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
  async function loadData(projectId: string) {
    isLoaded.value = true;
    // mock implementation
  }

  // Computed state reducer
  const activeEntitiesState = computed(() => {
    // Return a shallow copy of base entities structure
    const reducedState: Record<string, any> = {};

    entities.value.forEach(entity => {
      reducedState[entity.id] = {
        ...entity,
        properties: {} as Record<string, string>,
        relations: [] as any[],
        location: null as { x: number, y: number } | null
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
          if (event.payload.key && event.payload.value) {
            target.properties[event.payload.key] = event.payload.value;
          }
          break;
        case 'RELATION_ADD':
          if (event.payload.targetId && event.payload.relationType) {
            target.relations.push({ targetId: event.payload.targetId, type: event.payload.relationType });
          }
          break;
        case 'RELATION_REMOVE':
          if (event.payload.targetId) {
            target.relations = target.relations.filter((r: any) => r.targetId !== event.payload.targetId);
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
    
    // Save draft entities
    for (const entity of draftEntities.value) {
      await invoke('save_entity', { 
        projectId: entity.projectId, 
        entityJson: JSON.stringify(entity) 
      });
    }

    // Save draft relations as StateEvents (assume chapter 1 or baseline)
    for (const draftRel of draftRelations.value) {
      const event: StateEvent = {
        id: crypto.randomUUID(),
        projectId: draftEntities.value[0]?.projectId || '',
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
      
      await invoke('save_state_event', {
        projectId: event.projectId,
        eventJson: JSON.stringify(event)
      });
    }

    // Reload the store
    const projectId = draftEntities.value[0]?.projectId;
    clearDrafts();
    if (projectId) {
      isLoaded.value = false;
      await loadData(projectId);
    }
  }

  return { 
    entities, stateEvents, currentChapter, activeEntitiesState, 
    isLoading, isLoaded, loadData,
    draftEntities, draftRelations, isWizardMode, clearDrafts, addDraftEntity, addDraftRelation, commitDrafts
  };
});