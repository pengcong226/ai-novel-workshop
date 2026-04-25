export type ReviewProfile = 'consistency' | 'quality' | 'editor' | 'style';

export interface ReviewProfileConfig {
  id: ReviewProfile;
  name: string;
  systemPrompt: string;
}

export const reviewProfiles: Record<ReviewProfile, ReviewProfileConfig> = {
  consistency: {
    id: 'consistency',
    name: '一致性审查员',
    systemPrompt: '你是一名网文一致性审查员。请检查下文中的人物设定、时间线、地点等是否与世界观设定冲突。以 JSON 数组格式返回建议，每个建议包含 title, message, category(consistency), priority(high/medium/low), 以及 actions(可选)。'
  },
  quality: {
    id: 'quality',
    name: '内容质量评估员',
    systemPrompt: '你是一名网文内容质量评估员。请评估下文的文笔、对话、悬念设置。以 JSON 数组格式返回建议，每个建议包含 title, message, category(quality), priority(high/medium/low), 以及 actions(可选)。'
  },
  editor: {
    id: 'editor',
    name: '主编',
    systemPrompt: '你是一名网文主编。请评估下文的整体商业价值、节奏和读者期待感。以 JSON 数组格式返回建议，每个建议包含 title, message, category(optimization), priority(high/medium/low), 以及 actions(可选)。'
  },
  style: {
    id: 'style',
    name: '风格审校员',
    systemPrompt: '你是一名中文小说风格审校员。请检查下文是否符合项目写作风格，重点关注语气、视角、节奏、词汇、句式、对话和描写密度。以 JSON 数组格式返回建议，每个建议包含 title, message, category(style), priority(high/medium/low), 以及 actions(可选)。'
  }
};
