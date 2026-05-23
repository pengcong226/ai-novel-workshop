import type { Entity } from '../types/sandbox';

export function migrateLegacyWorldbookToEntities(legacyData: any): Entity[] {
  if (!legacyData || !Array.isArray(legacyData.entries)) {
    return [];
  }

  return legacyData.entries.map((entry: any) => {
    return {
      id: entry.id || entry.uid?.toString() || Math.random().toString(36).substring(7),
      projectId: entry.projectId || '',
      type: 'LORE', // Default type for worldbook
      name: entry.title || entry.name || (entry.key && entry.key.length > 0 ? entry.key[0] : 'Unknown'),
      category: entry.category || 'General',
      systemPrompt: entry.content || '',
      createdAt: entry.created_at || Date.now(),
      visualMeta: {
        color: '#8b5cf6',
      }
    } as Entity;
  });
}

export function migrateLegacyCharacterToEntities(legacyData: any[]): Entity[] {
  if (!legacyData || !Array.isArray(legacyData)) {
    return [];
  }

  return legacyData.map((char: any) => {
    return {
      id: char.id || Math.random().toString(36).substring(7),
      projectId: char.projectId || '',
      type: 'CHARACTER',
      name: char.name || 'Unknown Character',
      category: char.role || 'Supporting',
      systemPrompt: [char.description, char.personality].filter(Boolean).join('\n\n'),
      createdAt: Date.now(),
      visualMeta: {
        color: '#3b82f6',
      }
    } as Entity;
  });
}