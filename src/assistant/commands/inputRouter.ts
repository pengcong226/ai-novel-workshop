import { builtinCommandRegistry } from './builtinCommands';
import { getErrorMessage } from '@/utils/getErrorMessage';

export type RouteResult =
  | { type: 'command'; output: string | void }
  | { type: 'chat'; text: string }
  | { type: 'error'; error: string };

export async function routeAssistantInput(text: string, context?: any): Promise<RouteResult> {
  if (text.startsWith('/')) {
    try {
      const output = await builtinCommandRegistry.executeCommand(text, context);
      return { type: 'command', output };
    } catch (e: unknown) {
      return { type: 'error', error: getErrorMessage(e) };
    }
  }

  return { type: 'chat', text };
}
