import { describe, it, expect } from 'vitest';
import { buildReviewPrompt, type ReviewPromptContext } from '../reviewPromptFactory';
import { reviewProfiles, type ReviewProfile } from '../reviewProfiles';

describe('reviewPromptFactory', () => {
  it('should build prompt correctly with context and target profile', () => {
    const context = {
      project: { title: 'Test Novel' },
      chapter: { title: 'Chapter 1', content: 'It was a dark night.' }
    };

    const messages = buildReviewPrompt('consistency', context);

    expect(messages.length).toBe(2);
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain(reviewProfiles['consistency'].systemPrompt);

    expect(messages[1].role).toBe('user');
    expect(messages[1].content).toContain('Test Novel');
    expect(messages[1].content).toContain('Chapter 1');
    expect(messages[1].content).toContain('[P0] It was a dark night.');
    expect(messages[1].content).toContain('paragraphIndex');
    expect(messages[1].content).toContain('textSnippet');
    expect(messages[1].content).toContain('suggestedFix');
    expect(messages[1].content).toContain('不要返回 actions');
  });

  it('includes project style profile for style reviews', () => {
    const context: ReviewPromptContext = {
      project: {
        title: 'Test Novel',
        config: {
          styleProfile: {
            name: '古典武侠',
            description: '江湖气浓',
            tone: '严肃',
            narrativePerspective: '第三人称',
            pacing: '舒缓',
            vocabulary: '典雅',
            sentenceStyle: '长短结合',
            dialogueStyle: '简洁',
            descriptionLevel: '适中',
            avoidList: ['网络流行语'],
            customInstructions: '保留留白',
          }
        }
      },
      chapter: { title: 'Chapter 1', content: 'It was a dark night.' }
    };

    const messages = buildReviewPrompt('style', context);

    expect(messages[0].content).toContain(reviewProfiles['style'].systemPrompt);
    expect(messages[1].content).toContain('【项目写作风格】');
    expect(messages[1].content).toContain('古典武侠');
    expect(messages[1].content).toContain('网络流行语');
  });

  it('should default to consistency profile if unknown profile provided', () => {
    const messages = buildReviewPrompt('unknown' as ReviewProfile, { project: null });
    expect(messages[0].content).toContain(reviewProfiles['consistency'].systemPrompt);
  });
});
