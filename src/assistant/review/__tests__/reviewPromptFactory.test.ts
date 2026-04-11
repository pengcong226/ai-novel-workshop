import { describe, it, expect } from 'vitest';
import { buildReviewPrompt } from '../reviewPromptFactory';
import { reviewProfiles } from '../reviewProfiles';

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
    expect(messages[1].content).toContain('It was a dark night.');
  });

  it('should default to consistency profile if unknown profile provided', () => {
    const messages = buildReviewPrompt('unknown' as any, { project: {} });
    expect(messages[0].content).toContain(reviewProfiles['consistency'].systemPrompt);
  });
});
