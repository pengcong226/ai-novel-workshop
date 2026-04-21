import { CommandRegistry } from './registry';
import type { AssistantCommand } from './types';
import { buildReviewPrompt } from '../review/reviewPromptFactory';
import type { ReviewProfile } from '../review/reviewProfiles';
import { useSandboxStore } from '@/stores/sandbox';

export const builtinCommandRegistry = new CommandRegistry();

// Basic help command
const helpCommand: AssistantCommand = {
  name: 'help',
  description: '显示所有可用命令 (Show available commands)',
  execute: async (_, context) => {
    const commands = builtinCommandRegistry.getAllCommands();
    let helpText = '可用命令列表：\n\n';
    for (const cmd of commands) {
      helpText += `**/${cmd.name}** - ${cmd.description}\n`;
    }
    return helpText;
  }
};

// Review command
const reviewCommand: AssistantCommand = {
  name: 'review',
  description: '多角色审校当前小说内容。支持参数：consistency(默认) | quality | editor',
  execute: async (args, context) => {
    let profile: ReviewProfile = 'consistency';
    const profileArg = args[0];

    if (profileArg === 'quality' || profileArg === 'editor') {
      profile = profileArg;
    } else if (profileArg && profileArg !== 'consistency') {
      return `未知的审校角色：${profileArg}。支持的角色有：consistency, quality, editor`;
    }

    try {
      const { useAIStore } = await import('@/stores/ai');
      const { useProjectStore } = await import('@/stores/project');
      const { useSuggestionsStore } = await import('@/stores/suggestions');

      const aiStore = useAIStore();
      const projectStore = useProjectStore();
      const suggestionsStore = useSuggestionsStore();

      if (!aiStore.checkInitialized()) {
        return '请先配置并启用 AI 提供商。';
      }

      const project = projectStore.currentProject;
      let chapter = null;

      // If we can't find an active chapter in context, try finding the last modified chapter.
      if (project && project.chapters && project.chapters.length > 0) {
        chapter = project.chapters.reduce((latest, current) => {
          const l = latest as any;
          const c = current as any;
          const lDate = l.updatedAt || l.generationTime;
          const cDate = c.updatedAt || c.generationTime;

          if (!lDate) return current;
          if (!cDate) return latest;
          return new Date(cDate) > new Date(lDate) ? current : latest;
        }, project.chapters[0]);
      }

      // Allow overriding chapter text from args (if any)
      const customText = args.slice(1).join(' ');
      if (customText) {
        chapter = { title: '自定义文本', content: customText };
      }

      const promptContext = { project, chapter };
      const apiMessages = buildReviewPrompt(profile, promptContext, useSandboxStore()) as any[];

      const response = await aiStore.chat(apiMessages, { type: 'assistant' as any, complexity: 'high', priority: 'balanced' });
      const rawContent = response.content;

      // Extract JSON from response
      const jsonMatch = rawContent.match(/```json\s*([\s\S]*?)\s*```/);
      let suggestionsAdded = 0;

      if (jsonMatch) {
        try {
          const parsedArray = JSON.parse(jsonMatch[1]);
          if (Array.isArray(parsedArray)) {
            for (const item of parsedArray) {
              if (item.title && item.message) {
                suggestionsStore.addSuggestion({
                  type: 'improvement',
                  category: item.category || 'optimization',
                  priority: item.priority || 'medium',
                  title: `[${profile}] ${item.title}`,
                  message: item.message,
                  location: { type: 'global' } as any,
                  actions: item.actions
                });
                suggestionsAdded++;
              }
            }
          }
        } catch (e) {
          console.warn('解析审校建议 JSON 失败', e);
        }
      }

      if (suggestionsAdded > 0) {
        return `✅ 审校完成！已为您生成 ${suggestionsAdded} 条建议，请前往“建议”标签页查看。`;
      } else {
        return `✅ 审校完成！本次审校没有发现明显问题。\n\nAI原始回复：\n${rawContent}`;
      }

    } catch (e: any) {
      return `❌ 审校执行失败：${e.message}`;
    }
  }
};

builtinCommandRegistry.register(helpCommand);
builtinCommandRegistry.register(reviewCommand);
