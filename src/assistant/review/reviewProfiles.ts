export type ReviewProfile = 'consistency' | 'quality' | 'editor';

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
  }
};
