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
import { WorldbookInjector } from '@/services/worldbook-injector';
import { useSandboxStore } from '@/stores/sandbox';
import { getLogger } from '@/utils/logger';

const logger = getLogger('context:middlewares')

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
    const targetWordCount = project.config?.advancedSettings?.targetWordCount ?? 2000;
    const recentCount = project.config?.advancedSettings?.recentChaptersCount ?? 3;

    const recentChapters = payload.recentChapters;

    const promptVariables = {
      chapter: `第${currentChapter.number}章 ${currentChapter.title}`,
      characters: currentChapter.outline?.characters?.join('、') || '相关人物待补充',
      scenes: currentChapter.outline?.location || inferCurrentScene(recentChapters) || '场景信息待补充',
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

export class StyleMiddleware implements ContextMiddleware {
  name = 'STYLE_PROFILE';

  async process(payload: ContextPayload) {
    const styleProfile = payload.project.config?.styleProfile;
    if (!styleProfile) return;

    const parts = [
      '【项目写作风格 — 必须稳定遵循】',
      `风格名称：${styleProfile.name}`,
      `说明：${styleProfile.description}`,
      styleProfile.genre ? `适用题材：${styleProfile.genre}` : '',
      `基调：${styleProfile.tone}`,
      `叙事视角：${styleProfile.narrativePerspective}`,
      `节奏：${styleProfile.pacing}`,
      `词汇倾向：${styleProfile.vocabulary}`,
      `句式：${styleProfile.sentenceStyle}`,
      `对话：${styleProfile.dialogueStyle}`,
      `描写密度：${styleProfile.descriptionLevel}`,
      styleProfile.avoidList.length > 0 ? `避免：${styleProfile.avoidList.join('、')}` : '',
      styleProfile.examplePhrases.length > 0 ? `示例表达：${styleProfile.examplePhrases.join(' / ')}` : '',
      styleProfile.customInstructions ? `补充要求：${styleProfile.customInstructions}` : ''
    ].filter(Boolean).join('\n');

    const budget = payload.budget.distribution[this.name] || 1200;
    const styleText = enforceSectionBudget(payload, '写作风格', parts, budget);
    payload.builtSections.styleProfile = styleText;
    payload.systemParts.push(styleText);

    const tokens = estimateTokens(styleText);
    payload.budget.remaining -= tokens;
    payload.totalTokensUsed += tokens;
  }
}

export class AuthorsNoteMiddleware implements ContextMiddleware {
  name = 'AUTHORS_NOTE';

  async process(payload: ContextPayload) {
    const { currentChapter } = payload;
    const recentChapters = payload.recentChapters;

    let note = buildAuthorsNote(currentChapter.number, recentChapters);

    // Append rewrite direction prompt if present
    if (payload.rewriteDirectionPrompt) {
      note += `\n\n【改写方向指引】\n${payload.rewriteDirectionPrompt}`;
    }

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
    const { currentChapter } = payload;
    const involvedCharNames = currentChapter.outline?.characters || [];

    // V5: Get entity data from sandbox store
    const sandboxStore = useSandboxStore();
    const charEntities = sandboxStore.entities.filter((e: any) => e.type === 'CHARACTER');
    const activeState = sandboxStore.activeEntitiesState;
    let constraints = buildStateConstraints(charEntities, activeState, involvedCharNames);

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
    const { currentChapter } = payload;
    const recentChapters = payload.recentChapters;

    let charactersInfo = buildCharacterInfo(currentChapter, recentChapters);
    const budget = payload.budget.distribution[this.name] || 4000;

    charactersInfo = enforceSectionBudget(payload, '人物设定', charactersInfo, budget);
    payload.builtSections.characters = charactersInfo;

    // 核心角色摘要放 system，完整放 user
    // 此逻辑稍后在 contextToPromptPayload 处理，这里先存着
    if (charactersInfo) {
      payload.userHeadParts.push('【完整角色设定】\n' + charactersInfo);
      const tokens = estimateTokens(charactersInfo);
      payload.totalTokensUsed += tokens;
      payload.budget.remaining -= tokens;
    }
  }
}

export class WorldInfoMiddleware implements ContextMiddleware {
  name = 'WORLD_INFO';

  async process(payload: ContextPayload) {
    const { project, currentChapter } = payload;
    const recentChapters = payload.recentChapters;
    const recentContent = recentChapters.map(ch => ch.content || '').join('\n\n');

    let worldInfo = buildWorldInfo(project, currentChapter, recentChapters);
    const budget = payload.budget.distribution[this.name] || 5000;

    // V5: 接通 WorldbookInjector
    if (project.worldbook?.entries && project.worldbook.entries.length > 0) {
      try {
        const sandboxStore = useSandboxStore();
        const injector = new WorldbookInjector(project.worldbook);
        const injectionResult = injector.inject({
          projectId: project.id,
          currentChapter: currentChapter.number,
          currentContent: recentContent,
          characters: sandboxStore.entities.filter(e => e.type === 'CHARACTER'),
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
        logger.warn('WorldbookInjector 注入失败，跳过', e);
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

export class VectorContextMiddleware implements ContextMiddleware {
  name = 'VECTOR_CONTEXT';

  async process(payload: ContextPayload) {
    const { project, currentChapter } = payload;
    let vectorContextText = '';
    const budget = payload.budget.distribution[this.name] || 5000;

    if (payload.vectorService) {
      try {
        // V5: 从 SandboxStore 获取当前章节涉及的实体名 (图谱制导)
        let activeEntityNames: string[] = [];
        try {
          const sandboxStore = useSandboxStore();
          // O(S) build active entity ID set, then O(E) filter
          const activeEntityIds = new Set<string>()
          for (const ev of sandboxStore.stateEvents) {
            if (ev.chapterNumber <= currentChapter.number) {
              activeEntityIds.add(ev.entityId)
            }
          }
          activeEntityNames = sandboxStore.entities
            .filter(e => activeEntityIds.has(e.id))
            .map(e => e.name);
        } catch {
          // SandboxStore 可能未初始化，使用章节大纲中的人物名作为 fallback
          activeEntityNames = currentChapter.outline?.characters || [];
        }

        vectorContextText = await buildVectorContext(
          project,
          currentChapter,
          payload.vectorService,
          budget,
          activeEntityNames,
          {
            topK: payload.vectorConfig?.topK,
            minScore: payload.vectorConfig?.minScore,
            vectorWeight: payload.vectorConfig?.vectorWeight,
          }
        );
      } catch (error) {
        logger.warn('向量检索失败，将使用降级方案', error);
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

export class PlotAnchorMiddleware implements ContextMiddleware {
  name = 'PLOT_ANCHORS';

  async process(payload: ContextPayload) {
    const { project, currentChapter } = payload;
    let anchorText = '';

    // Find upcoming anchors in the next 10 chapters
    const upcomingAnchors: string[] = [];
    if (project.outline?.volumes) {
      for (const vol of project.outline.volumes) {
        if (vol.anchors) {
          for (const anchor of vol.anchors) {
            if (!anchor.isResolved && anchor.targetChapterNumber >= currentChapter.number && anchor.targetChapterNumber <= currentChapter.number + 10) {
              upcomingAnchors.push(`- 第${anchor.targetChapterNumber}章目标: ${anchor.description}`);
            }
          }
        }
      }
    }

    if (upcomingAnchors.length > 0) {
      anchorText = `【命运锚点预警】\n你正在接近以下关键剧情节点，请在接下来的生成中主动收束伏笔并向这些目标靠拢：\n${upcomingAnchors.join('\n')}`;
    }

    const budget = payload.budget.distribution[this.name] || 1000;
    anchorText = enforceSectionBudget(payload, '命运锚点', anchorText, budget);
    payload.builtSections.plotAnchors = anchorText;

    if (anchorText) {
      payload.systemParts.push(anchorText);
      const tokens = estimateTokens(anchorText);
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
