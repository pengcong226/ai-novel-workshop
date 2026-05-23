import { CommandRegistry } from './registry';
import type { AssistantCommand } from './types';
import { runReview } from '../review/reviewRunner';
import type { ReviewProfile } from '../review/reviewProfiles';
import type { Chapter } from '@/types';
import { getErrorMessage } from '@/utils/getErrorMessage';

export const builtinCommandRegistry = new CommandRegistry();

// Basic help command
const helpCommand: AssistantCommand = {
  name: 'help',
  description: '显示所有可用命令 (Show available commands)',
  execute: async () => {
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
  description: '多角色审校当前小说内容。支持参数：consistency(默认) | quality | editor | style',
  execute: async (args) => {
    let profile: ReviewProfile = 'consistency';
    const profileArg = args[0];

    if (profileArg === 'quality' || profileArg === 'editor' || profileArg === 'style') {
      profile = profileArg;
    } else if (profileArg && profileArg !== 'consistency') {
      return `未知的审校角色：${profileArg}。支持的角色有：consistency, quality, editor, style`;
    }

    try {
      const { useAIStore } = await import('@/stores/ai');
      const { useProjectStore } = await import('@/stores/project');

      const aiStore = useAIStore();
      const projectStore = useProjectStore();

      if (!aiStore.checkInitialized()) {
        return '请先配置并启用 AI 提供商。';
      }

      const project = projectStore.currentProject;
      let chapter: Pick<Chapter, 'id' | 'number' | 'title' | 'content'> | null = null;

      if (project && project.chapters && project.chapters.length > 0) {
        const latestChapter = project.chapters.reduce((latest, current) =>
          current.generationTime > latest.generationTime ? current : latest,
        project.chapters[0]);
        const loadedChapter = await projectStore.loadChapter(latestChapter.id);
        chapter = loadedChapter
          ? {
              id: loadedChapter.id,
              number: loadedChapter.number,
              title: loadedChapter.title,
              content: loadedChapter.content,
            }
          : latestChapter;
      }

      // Allow overriding chapter text from args (if any)
      const customText = args.slice(1).join(' ');
      if (customText) {
        chapter = { id: 'custom-review', number: 0, title: '自定义文本', content: customText };
      }

      const { suggestionsAdded, rawContent } = await runReview({
        profile,
        project,
        chapter,
      });

      if (suggestionsAdded > 0) {
        return `✅ 审校完成！已为您生成 ${suggestionsAdded} 条建议，请前往“建议”标签页查看。`;
      } else {
        return `✅ 审校完成！本次审校没有发现明显问题。\n\nAI原始回复：\n${rawContent}`;
      }

    } catch (e: unknown) {
      return `❌ 审校执行失败：${getErrorMessage(e)}`;
    }
  }
};

builtinCommandRegistry.register(helpCommand);
builtinCommandRegistry.register(reviewCommand);
