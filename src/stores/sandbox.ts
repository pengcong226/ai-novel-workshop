import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Entity, StateEvent } from '../types/sandbox';

export interface EntityRelation {
  targetId: string;
  type: string;
}

export interface ActiveEntityState extends Entity {
  properties: Record<string, string>;
  relations: EntityRelation[];
  location: { x: number, y: number } | null;
}

export const useSandboxStore = defineStore('sandbox', () => {
  const entities = ref<Entity[]>([]);
  const stateEvents = ref<StateEvent[]>([]);
  const pendingStateEvents = ref<StateEvent[]>([]);
  const isLoading = ref(false);
  const isLoaded = ref(false);
  const currentChapter = ref<number>(1);

  async function loadData(projectId: string) {
    if (isLoaded.value || isLoading.value) return;
    isLoading.value = true;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const entitiesJson = await invoke<string>('load_entities', { projectId });
      entities.value = JSON.parse(entitiesJson);

      const eventsJson = await invoke<string>('load_state_events', { projectId });
      const parsedEvents = JSON.parse(eventsJson);
      // Pre-sort events when loaded to avoid sorting on every compute tick
      stateEvents.value = parsedEvents.sort((a: StateEvent, b: StateEvent) => a.chapterNumber - b.chapterNumber);

      isLoaded.value = true;
    } catch (e) {
      console.error("Failed to load sandbox data", e);
    } finally {
      isLoading.value = false;
    }
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
    const combinedEvents = [...stateEvents.value, ...pendingStateEvents.value];

    // Sort combined events if there are pending events (stateEvents are already pre-sorted)
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

  return { entities, stateEvents, pendingStateEvents, currentChapter, activeEntitiesState, isLoading, isLoaded, loadData };
});