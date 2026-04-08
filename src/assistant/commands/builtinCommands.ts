import { CommandRegistry } from './registry';
import type { AssistantCommand } from './types';

export const builtinCommandRegistry = new CommandRegistry();

// Basic help command
const helpCommand: AssistantCommand = {
  name: 'help',
  description: 'Show available commands',
  execute: async (_, context) => {
    const commands = builtinCommandRegistry.getAllCommands();
    let helpText = 'Available commands:\\n\\n';
    for (const cmd of commands) {
      helpText += `/${cmd.name} - ${cmd.description}\\n`;
    }
    return helpText;
  }
};

builtinCommandRegistry.register(helpCommand);
