import { getLogger } from '@/utils/logger'

const logger = getLogger('action-envelope')

export interface ActionEnvelope {
  action: string;
  data: any;
}

export interface ParseResult {
  parsed: ActionEnvelope | null;
  rawMatch: string;
}

export function parseActionEnvelope(text: string): ParseResult {
  const jsonMatch = text.match(/```json\s*(\{[\s\S]*?"action"\s*:[\s\S]*?\})\s*```/);

  if (jsonMatch) {
    try {
      const parsedData = JSON.parse(jsonMatch[1]);

      if (parsedData && typeof parsedData === 'object' && 'action' in parsedData) {
        return {
          parsed: parsedData as ActionEnvelope,
          rawMatch: jsonMatch[0]
        };
      }
    } catch (e) {
      logger.warn('Failed to parse action envelope JSON:', e)
    }
  }

  return {
    parsed: null,
    rawMatch: ''
  };
}
