import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Entity, StateEvent } from '../types/sandbox';

export const useSandboxStore = defineStore('sandbox', () => {
  const entities = ref<Entity[]>([]);
  const stateEvents = ref<StateEvent[]>([]);
  const currentChapter = ref<number>(1);

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

  return { entities, stateEvents, currentChapter, activeEntitiesState };
});