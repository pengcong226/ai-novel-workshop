import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CommandRegistry } from '../registry';
import type { AssistantCommand } from '../types';

describe('CommandRegistry', () => {
  let registry: CommandRegistry;

  beforeEach(() => {
    registry = new CommandRegistry();
  });

  it('should register and retrieve a command', () => {
    const cmd: AssistantCommand = {
      name: 'test',
      description: 'A test command',
      execute: async () => 'test executed'
    };
    registry.register(cmd);

    expect(registry.getCommand('test')).toBe(cmd);
    expect(registry.getAllCommands()).toContain(cmd);
  });

  it('should return undefined for unregistered command', () => {
    expect(registry.getCommand('unknown')).toBeUndefined();
  });

  it('should parse valid command text', () => {
    const parsed = registry.parseCommandText('/test arg1 "arg 2"');
    expect(parsed).toEqual({
      name: 'test',
      args: ['arg1', 'arg 2'], // basic split by space for now
      rawText: '/test arg1 "arg 2"'
    });
  });

  it('should parse command without args', () => {
    const parsed = registry.parseCommandText('/help');
    expect(parsed).toEqual({
      name: 'help',
      args: [],
      rawText: '/help'
    });
  });

  it('should return null for non-command text', () => {
    expect(registry.parseCommandText('hello world')).toBeNull();
    expect(registry.parseCommandText('/')).toBeNull(); // empty command name
  });

  it('should execute registered command', async () => {
    const executeSpy = vi.fn().mockResolvedValue('success');
    registry.register({
      name: 'do',
      description: 'do something',
      execute: executeSpy
    });

    const result = await registry.executeCommand('/do it now');
    expect(result).toBe('success');
    expect(executeSpy).toHaveBeenCalledWith(['it', 'now'], undefined);
  });

  it('should throw error when executing unregistered command', async () => {
    await expect(registry.executeCommand('/unknown')).rejects.toThrow('Command not found: unknown');
  });

  it('should throw error when executing non-command text', async () => {
    await expect(registry.executeCommand('just text')).rejects.toThrow('Not a valid command');
  });
});
