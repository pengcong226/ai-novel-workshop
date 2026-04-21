import { reviewProfiles, type ReviewProfile } from './reviewProfiles';
import { useSandboxStore } from '@/stores/sandbox';

type SandboxStore = ReturnType<typeof useSandboxStore>;

export function buildReviewPrompt(profile: ReviewProfile, context: any, sandboxStore?: SandboxStore) {
  const profileConfig = reviewProfiles[profile] || reviewProfiles['consistency'];

  let userContent = `【项目信息】\n`;
  if (context.project) {
    userContent += `名称：${context.project.title || '未知'}\n`;
    if (sandboxStore) {
      const worldEntity = sandboxStore.entities.find(e => e.type === 'WORLD');
      if (worldEntity?.name) {
        userContent += `世界观：${worldEntity.name}\n`;
      }
    }
  }

  if (context.chapter) {
    userContent += `\n【待审校章节】\n标题：${context.chapter.title}\n内容：\n${context.chapter.content}\n`;
  } else {
    userContent += `\n【当前没有选中的章节进行审校】\n`;
  }

  userContent += `\n请根据您的角色设定，对上述内容进行审校，并以严格的 JSON 数组格式返回结果，使用 \`\`\`json 包裹。每个对象包含：
{
  "title": "建议标题",
  "message": "具体描述",
  "category": "consistency|quality|optimization",
  "priority": "high|medium|low"
}
`;

  return [
    { role: 'system', content: profileConfig.systemPrompt },
    { role: 'user', content: userContent }
  ];
}
