import { describe, it, expect } from 'vitest';
import { parseActionEnvelope } from '../actionEnvelope';

describe('actionEnvelope', () => {
  it('should parse valid action JSON wrapped in markdown', () => {
    const text = `Here is the action you requested:
\`\`\`json
{
  "action": "create_character",
  "data": {
    "name": "Alice"
  }
}
\`\`\``;

    const result = parseActionEnvelope(text);

    expect(result.parsed).not.toBeNull();
    expect(result.parsed!.action).toBe('create_character');
    expect(result.parsed!.data.name).toBe('Alice');

    // Original match block should be returned so caller can strip it
    expect(result.rawMatch).toContain('```json');
  });

  it('should return null when no valid JSON block is found', () => {
    const text = `Just chatting with you.`;
    const result = parseActionEnvelope(text);
    expect(result.parsed).toBeNull();
  });

  it('should strip markdown and parse correctly even with surrounding text', () => {
    const text = `
Sure, I can help with that.
\`\`\`json
{
  "action": "test",
  "data": {"value": 123}
}
\`\`\`
And that's it!
`;
    const result = parseActionEnvelope(text);
    expect(result.parsed).toEqual({ action: "test", data: { value: 123 } });
  });

  it('should ignore invalid JSON', () => {
    const text = `
\`\`\`json
{ "action": "test", "data": bad JSON }
\`\`\`
`;
    const result = parseActionEnvelope(text);
    expect(result.parsed).toBeNull();
  });
});
