import type { AIActionHandlerContribution, PluginContext, ActionContext } from '../types';
import { useProjectStore } from '@/stores/project';
import { ElMessage } from 'element-plus';

/**
 * 内置AI动作处理器贡献
 */
export const createCharacterActionContribution: AIActionHandlerContribution = {
  type: 'create_character',
  handler: async (data: any, context: ActionContext) => {
    const projectStore = useProjectStore();
    if (!projectStore.currentProject) {
      throw new Error('No active project');
    }

    projectStore.currentProject.characters.push({
      id: crypto.randomUUID(),
      name: data.name || '新角色',
      aliases: [],
      gender: data.gender || 'other',
      age: data.age || 20,
      appearance: data.appearance || '',
      personality: [],
      values: [],
      background: data.background || '',
      motivation: '',
      abilities: [],
      relationships: [],
      appearances: [],
      development: [],
      tags: ['supporting'],
      stateHistory: [],
      aiGenerated: true
    } as any);

    await projectStore.saveCurrentProject();
    ElMessage.success(`✅ 成功添加人物：${data.name}`);
  }
};

/**
 * 插件清单
 */
export const manifest = {
  id: 'assistant-actions',
  name: 'Assistant Actions',
  version: '1.0.0',
  author: 'AI Novel Workshop',
  description: '内置的 AI 助手动作处理器',
  permissions: ['project-data'],
  contributes: {
    aiActionHandlers: [createCharacterActionContribution]
  }
};
