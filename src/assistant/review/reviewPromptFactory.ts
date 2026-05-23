import { reviewProfiles, type ReviewProfile } from './reviewProfiles';
import { formatNumberedReviewContent } from './reviewParagraphs';
import { useSandboxStore } from '@/stores/sandbox';
import type { Chapter, StyleProfile } from '@/types';
import type { ChatMessage } from '@/types/ai';

type SandboxStore = ReturnType<typeof useSandboxStore>;

export interface ReviewPromptContext {
  project?: {
    title?: string
    config?: {
      styleProfile?: Partial<StyleProfile>
    }
  } | null
  chapter?: Pick<Chapter, 'title' | 'content'> | null
}

export function buildReviewPrompt(profile: ReviewProfile, context: ReviewPromptContext, sandboxStore?: SandboxStore): ChatMessage[] {
  const profileConfig = reviewProfiles[profile] || reviewProfiles['consistency'];

  let userContent = `【项目信息】\n`;
  if (context.project) {
    userContent += `名称：${context.project.title || '未知'}\n`;
    if (context.project.config?.styleProfile) {
      const style = context.project.config.styleProfile;
      userContent += `\n【项目写作风格】\n名称：${style.name}\n说明：${style.description}\n基调：${style.tone}\n视角：${style.narrativePerspective}\n节奏：${style.pacing}\n词汇：${style.vocabulary}\n句式：${style.sentenceStyle}\n对话：${style.dialogueStyle}\n描写密度：${style.descriptionLevel}\n避免：${style.avoidList?.join('、') || '无'}\n补充要求：${style.customInstructions || '无'}\n`;
    }
    if (sandboxStore) {
      const worldEntity = sandboxStore.entities.find(e => e.type === 'WORLD');
      if (worldEntity?.name) {
        userContent += `世界观：${worldEntity.name}\n`;
      }
    }
  }

  if (context.chapter) {
    const numberedContent = formatNumberedReviewContent(context.chapter.content || '')
    userContent += `\n【待审校章节】\n标题：${context.chapter.title}\n内容（每段前标注了段落编号 [P#]）：\n${numberedContent || '（正文为空）'}\n`;
  } else {
    userContent += `\n【当前没有选中的章节进行审校】\n`;
  }

  userContent += `\n请根据您的角色设定，对上述内容进行审校，并以严格的 JSON 数组格式返回结果，使用 \`\`\`json 包裹。每个对象包含：
{
  "title": "建议标题",
  "message": "具体描述（说明问题所在及原因）",
  "category": "consistency|quality|optimization|style",
  "priority": "high|medium|low",
  "paragraphIndex": 0,
  "textSnippet": "问题所在的原文片段（必须是对应段落中的原文）",
  "suggestedFix": "建议修改后的纯文本（可选）"
}

重要：paragraphIndex 必须对应 [P#] 标注的段落编号；textSnippet 必须是该段落中的精确原文；suggestedFix 只能是纯文本。不要返回 actions、命令、HTML 或链接。
`;

  return [
    { role: 'system', content: profileConfig.systemPrompt },
    { role: 'user', content: userContent }
  ];
}
