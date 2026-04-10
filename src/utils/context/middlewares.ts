import type { ContextMiddleware, ContextPayload } from './pipeline';
import { estimateTokens, truncateToTokens } from './pipeline';
import { buildSystemPrompt, getPromptDefinition } from '../promptHelper';
import {
  inferCurrentScene,
  buildAuthorsNote,
  buildWorldInfo,
  buildCharacterInfo,
  buildStateConstraints,
  buildSummary,
  buildRecentChapters,
  buildOutline,
  buildVectorContext
} from '../contextBuilder';
import { generateMemoryPrompt, initNovelMemory } from '../tableMemory';
import { WorldbookInjector } from '@/services/worldbook-injector';
import { getVectorService } from '../vectorService';

function enforceSectionBudget(payload: ContextPayload, sectionName: string, text: string, budget: number): string {
  if (!text || budget <= 0) return '';
  const sectionTokens = estimateTokens(text);
  if (sectionTokens <= budget) return text;

  payload.warnings.push(`${sectionName}已从${sectionTokens} tokens裁剪到${budget} tokens以内`);
  return truncateToTokens(text, budget);
}

export class SystemPromptMiddleware implements ContextMiddleware {
  name = 'SYSTEM_PROMPT';

  async process(payload: ContextPayload) {
    const { project, currentChapter } = payload;
    const recentCount = project.config?.advancedSettings?.recentChaptersCount ?? 3;
    const targetWordCount = project.config?.advancedSettings?.targetWordCount ?? 2000;

    const chapters = project.chapters || [];
    const recentChapters = chapters
      .filter(ch => ch.number < currentChapter.number && ch.number >= currentChapter.number - recentCount)
      .sort((a, b) => b.number - a.number);

    const promptVariables = {
      chapter: `第${currentChapter.number}章 ${currentChapter.title}`,
      characters: currentChapter.outline?.characters?.join('、') || '相关人物待补充',
      scenes: currentChapter.outline?.location || inferCurrentScene(recentChapters, project) || '场景信息待补充',
      context: `题材：${project.genre}\n目标字数：${targetWordCount}\n写作深度：${project.config?.writingDepth || 'standard'}\n最近章节数：${recentCount}`,
      genre: project.genre || '未指定题材',
      style: project.config?.writingDepth || 'standard',
      tone: project.config?.preset || 'standard'
    };

    let systemPrompt = buildSystemPrompt(project.config, 'writing', promptVariables);
    const definition = getPromptDefinition(project.config, 'writing');
    payload.warnings.push(`写作系统提示词已通过 Prompt Registry 注入，模板版本：v${definition.version}`);

    const budget = payload.budget.distribution[this.name] || 4000;
    systemPrompt = enforceSectionBudget(payload, '系统提示', systemPrompt, budget);

    payload.builtSections.systemPrompt = systemPrompt;
    payload.systemParts.push(systemPrompt);

    const tokens = estimateTokens(systemPrompt);
    payload.budget.remaining -= tokens;
    payload.totalTokensUsed += tokens;
  }
}

export class AuthorsNoteMiddleware implements ContextMiddleware {
  name = 'AUTHORS_NOTE';

  async process(payload: ContextPayload) {
    const { project, currentChapter } = payload;
    const recentCount = project.config?.advancedSettings?.recentChaptersCount ?? 3;
    const chapters = project.chapters || [];
    const recentChapters = chapters
      .filter(ch => ch.number < currentChapter.number && ch.number >= currentChapter.number - recentCount)
      .sort((a, b) => b.number - a.number);

    let note = buildAuthorsNote(currentChapter.number, recentChapters, project);
    const budget = payload.budget.distribution[this.name] || 1000;

    note = enforceSectionBudget(payload, '作者注释', note, budget);
    payload.builtSections.authorsNote = note;
    payload.systemParts.push(note);

    const tokens = estimateTokens(note);
    payload.budget.remaining -= tokens;
    payload.totalTokensUsed += tokens;
  }
}

export class StateConstraintsMiddleware implements ContextMiddleware {
  name = 'STATE_CONSTRAINTS';

  async process(payload: ContextPayload) {
    const { project, currentChapter } = payload;
    const involvedCharNames = currentChapter.outline?.characters || [];
    let constraints = buildStateConstraints(project.characters || [], involvedCharNames);

    // 约束不应该被轻易裁剪，但如果过长也需要控制
    const budget = payload.budget.distribution['SYSTEM_PROMPT'] || 1000;
    constraints = enforceSectionBudget(payload, '状态约束', constraints, budget);

    payload.builtSections.stateConstraints = constraints;
    if (constraints) {
      payload.systemParts.push(constraints);
    }
  }
}

export class CharacterInfoMiddleware implements ContextMiddleware {
  name = 'CHARACTERS';

  async process(payload: ContextPayload) {
    const { project, currentChapter } = payload;
    const recentCount = project.config?.advancedSettings?.recentChaptersCount ?? 3;
    const chapters = project.chapters || [];
    const recentChapters = chapters
      .filter(ch => ch.number < currentChapter.number && ch.number >= currentChapter.number - recentCount)
      .sort((a, b) => b.number - a.number);

    let charactersInfo = buildCharacterInfo(project, currentChapter, recentChapters);
    const budget = payload.budget.distribution[this.name] || 4000;

    charactersInfo = enforceSectionBudget(payload, '人物设定', charactersInfo, budget);
    payload.builtSections.characters = charactersInfo;

    // 核心角色摘要放 system，完整放 user
    // 此逻辑稍后在 contextToPromptPayload 处理，这里先存着
    if (charactersInfo) {
      payload.userHeadParts.push('【完整角色设定】\n' + charactersInfo);
      payload.totalTokensUsed += estimateTokens(charactersInfo);
      payload.budget.remaining -= estimateTokens(charactersInfo);
    }
  }
}

export class WorldInfoMiddleware implements ContextMiddleware {
  name = 'WORLD_INFO';

  async process(payload: ContextPayload) {
    const { project, currentChapter } = payload;
    const recentCount = project.config?.advancedSettings?.recentChaptersCount ?? 3;
    const chapters = project.chapters || [];
    const recentChapters = chapters
      .filter(ch => ch.number < currentChapter.number && ch.number >= currentChapter.number - recentCount)
      .sort((a, b) => b.number - a.number);
    const recentContent = recentChapters.map(ch => ch.content || '').join('\n\n');

    let worldInfo = buildWorldInfo(project, currentChapter, recentChapters);
    let budget = payload.budget.distribution[this.name] || 5000;

    // V3: 接通 WorldbookInjector
    if (project.worldbook?.entries && project.worldbook.entries.length > 0) {
      try {
        const injector = new WorldbookInjector(project.worldbook);
        const injectionResult = injector.inject({
          projectId: project.id,
          currentChapter: currentChapter.number,
          currentContent: recentContent,
          characters: project.characters || [],
          recentEvents: [],
          worldState: {},
          chapterContext: {
            title: currentChapter.title,
            location: currentChapter.outline?.location,
            characterIds: currentChapter.outline?.characters,
          },
          tokenBudget: budget
        });

        if (injectionResult.injectedContent) {
          worldInfo += '\n\n【世界书动态注入】\n' + injectionResult.injectedContent;
          payload.warnings.push(`世界书注入了 ${injectionResult.stats.injected} 个词条（共 ${injectionResult.totalTokens} tokens）`);
        }
      } catch (e) {
        console.warn('[ContextBuilder] WorldbookInjector 注入失败，跳过:', e);
      }
    }

    worldInfo = enforceSectionBudget(payload, '世界观设定', worldInfo, budget);
    payload.builtSections.worldInfo = worldInfo;

    if (worldInfo) {
      payload.userHeadParts.push('【世界观设定】\n' + worldInfo);
      const tokens = estimateTokens(worldInfo);
      payload.budget.remaining -= tokens;
      payload.totalTokensUsed += tokens;
    }
  }
}

export class MemoryTableMiddleware implements ContextMiddleware {
  name = 'MEMORY_TABLES';

  async process(payload: ContextPayload) {
    const { project, currentChapter, memorySystem } = payload;
    const recentCount = project.config?.advancedSettings?.recentChaptersCount ?? 3;
    const chapters = project.chapters || [];
    const recentContent = chapters
      .filter(c => c.number < currentChapter.number && c.number >= currentChapter.number - recentCount)
      .map(c => c.content)
      .join('\n\n');

    let memoryText = '';
    if (memorySystem) {
      memoryText = generateMemoryPrompt(memorySystem, recentContent);
    } else {
      const newMemory = initNovelMemory(project);
      memoryText = generateMemoryPrompt(newMemory, recentContent);
    }

    if (!memoryText) return;

    const budget = payload.budget.distribution[this.name] || 4000;
    memoryText = enforceSectionBudget(payload, '表格记忆', memoryText, budget);
    payload.builtSections.memoryTables = memoryText;

    payload.userHeadParts.push('【记忆追踪】\n' + memoryText);
    const tokens = estimateTokens(memoryText);
    payload.budget.remaining -= tokens;
    payload.totalTokensUsed += tokens;
  }
}

export class VectorContextMiddleware implements ContextMiddleware {
  name = 'VECTOR_CONTEXT';

  async process(payload: ContextPayload) {
    const { project, currentChapter } = payload;
    let vectorContextText = '';
    const budget = payload.budget.distribution[this.name] || 5000;

    if (payload.vectorService) {
      try {
        vectorContextText = await buildVectorContext(project, currentChapter, payload.vectorService, budget);
      } catch (error) {
        console.warn('[ContextBuilder] 向量检索失败，将使用降级方案:', error);
        payload.warnings.push('向量检索失败，已使用降级方案');
      }
    }

    vectorContextText = enforceSectionBudget(payload, '向量检索上下文', vectorContextText, budget);
    payload.builtSections.vectorContext = vectorContextText;

    if (vectorContextText) {
      payload.userHeadParts.push('【历史相关片段】\n' + vectorContextText);
      const tokens = estimateTokens(vectorContextText);
      payload.budget.remaining -= tokens;
      payload.totalTokensUsed += tokens;
    }
  }
}

export class SummaryMiddleware implements ContextMiddleware {
  name = 'SUMMARY';

  async process(payload: ContextPayload) {
    const { project, currentChapter } = payload;
    let summaryText = buildSummary(project.chapters || [], currentChapter.number).summary;
    const budget = payload.budget.distribution[this.name] || 4000;

    summaryText = enforceSectionBudget(payload, '历史摘要', summaryText, budget);
    payload.builtSections.summary = summaryText;

    if (summaryText) {
      payload.userHeadParts.push('【历史摘要】\n' + summaryText);
      const tokens = estimateTokens(summaryText);
      payload.budget.remaining -= tokens;
      payload.totalTokensUsed += tokens;
    }
  }
}

export class RecentChaptersMiddleware implements ContextMiddleware {
  name = 'RECENT_CHAPTERS';

  async process(payload: ContextPayload) {
    const { project, currentChapter } = payload;
    const recentCount = project.config?.advancedSettings?.recentChaptersCount ?? 3;
    const maxContextTokens = project.config?.advancedSettings?.maxContextTokens ?? 8192;
    let recentBudget = maxContextTokens - 2000;
    if (recentBudget < 2000) recentBudget = 2000;

    let recentChaptersText = buildRecentChapters(project.chapters || [], currentChapter.number, recentBudget, recentCount);

    // 这里因为 buildRecentChapters 内部已经做了精细截断，只需再保险检查一次
    recentChaptersText = enforceSectionBudget(payload, '最近章节', recentChaptersText, recentBudget);
    payload.builtSections.recentChapters = recentChaptersText;

    if (recentChaptersText) {
      payload.userTailParts.push('【最近章节正文】\n' + recentChaptersText);
      const tokens = estimateTokens(recentChaptersText);
      payload.budget.remaining -= tokens;
      payload.totalTokensUsed += tokens;
    }
  }
}

export class OutlineMiddleware implements ContextMiddleware {
  name = 'OUTLINE';

  async process(payload: ContextPayload) {
    const { currentChapter } = payload;
    let outlineText = buildOutline(currentChapter.outline);
    const budget = payload.budget.distribution[this.name] || 2000;

    outlineText = enforceSectionBudget(payload, '章节大纲', outlineText, budget);
    payload.builtSections.outline = outlineText;

    if (outlineText) {
      payload.userTailParts.push('【本章大纲】\n' + outlineText);
      const tokens = estimateTokens(outlineText);
      payload.budget.remaining -= tokens;
      payload.totalTokensUsed += tokens;
    }
  }
}
