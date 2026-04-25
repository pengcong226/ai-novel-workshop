import type { AIActionHandlerContribution, ActionContext } from '../types';
import { useProjectStore } from '@/stores/project';
import { useSandboxStore } from '@/stores/sandbox';
import { ElMessage } from 'element-plus';

/**
 * 内置AI动作处理器贡献
 */
export const createCharacterActionContribution: AIActionHandlerContribution = {
  type: 'create_character',
  handler: async (data: any, _context: ActionContext) => {
    const projectStore = useProjectStore();
    const sandboxStore = useSandboxStore();
    if (!projectStore.currentProject) {
      throw new Error('No active project');
    }

    const projectId = projectStore.currentProject.id;
    await sandboxStore.addEntity({
      id: crypto.randomUUID(),
      projectId,
      type: 'CHARACTER',
      name: data.name || '新角色',
      aliases: [],
      importance: 'major',
      category: 'ai-assistant',
      systemPrompt: data.background || '',
      visualMeta: {},
      isArchived: false,
      createdAt: Date.now()
    });

    ElMessage.success(`成功添加人物：${data.name}`);
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
