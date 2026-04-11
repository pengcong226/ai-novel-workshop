import { describe, it, expect, vi } from 'vitest';
import { routeAssistantInput } from '../inputRouter';
import { builtinCommandRegistry } from '../builtinCommands';

describe('inputRouter', () => {
  it('should route text starting with / to command registry', async () => {
    const executeSpy = vi.spyOn(builtinCommandRegistry, 'executeCommand').mockResolvedValue('command output');

    const result = await routeAssistantInput('/help');

    expect(result.type).toBe('command');
    expect((result as any).output).toBe('command output');
    expect(executeSpy).toHaveBeenCalledWith('/help', undefined);

    executeSpy.mockRestore();
  });

  it('should pass context to command registry', async () => {
    const executeSpy = vi.spyOn(builtinCommandRegistry, 'executeCommand').mockResolvedValue('context ok');
    const mockContext = { someData: true };

    const result = await routeAssistantInput('/test arg', mockContext);

    expect(result.type).toBe('command');
    expect(executeSpy).toHaveBeenCalledWith('/test arg', mockContext);

    executeSpy.mockRestore();
  });

  it('should route normal text as chat message', async () => {
    const result = await routeAssistantInput('hello world');

    expect(result.type).toBe('chat');
    expect((result as any).text).toBe('hello world');
  });

  it('should handle command execution errors', async () => {
    const executeSpy = vi.spyOn(builtinCommandRegistry, 'executeCommand').mockRejectedValue(new Error('Test error'));

    const result = await routeAssistantInput('/unknown');

    expect(result.type).toBe('error');
    expect((result as any).error).toBe('Test error');

    executeSpy.mockRestore();
  });
});
