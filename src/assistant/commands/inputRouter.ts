import { builtinCommandRegistry } from './builtinCommands';

export type RouteResult =
  | { type: 'command'; output: string | void }
  | { type: 'chat'; text: string }
  | { type: 'error'; error: string };

export async function routeAssistantInput(text: string, context?: any): Promise<RouteResult> {
  if (text.startsWith('/')) {
    try {
      const output = await builtinCommandRegistry.executeCommand(text, context);
      return { type: 'command', output };
    } catch (e: any) {
      return { type: 'error', error: e.message };
    }
  }

  return { type: 'chat', text };
}
