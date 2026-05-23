import type { AssistantCommand, ParsedCommand } from './types';

export class CommandRegistry {
  private commands: Map<string, AssistantCommand> = new Map();

  register(command: AssistantCommand) {
    this.commands.set(command.name, command);
  }

  getCommand(name: string): AssistantCommand | undefined {
    return this.commands.get(name);
  }

  getAllCommands(): AssistantCommand[] {
    return Array.from(this.commands.values());
  }

  parseCommandText(text: string): ParsedCommand | null {
    if (!text.startsWith('/')) return null;

    // Use regex to match parts: spaces outside quotes, and quotes.
    // For this simple implementation, basic string split will handle quotes if preserved.
    // Let's improve the match to handle 'test arg1 "arg 2"' properly.
    const match = text.match(/^\/([a-zA-Z0-9_-]+)(?:\s+(.+))?$/);
    if (!match) return null;

    const name = match[1];
    const argsStr = match[2] || '';

    // Advanced parse: split by spaces but respect quotes.
    const args: string[] = [];
    if (argsStr) {
      // Very simple tokenization matching words or quoted phrases
      const regex = /"([^"]+)"|'([^']+)'|(\S+)/g;
      let m;
      while ((m = regex.exec(argsStr)) !== null) {
        // match 1 is double quotes, 2 is single quotes, 3 is unquoted
        args.push(m[1] || m[2] || m[3]);
      }
    }

    return {
      name,
      args,
      rawText: text
    };
  }

  async executeCommand(text: string, context?: any): Promise<string | void> {
    const parsed = this.parseCommandText(text);
    if (!parsed) {
      throw new Error('Not a valid command');
    }

    const command = this.getCommand(parsed.name);
    if (!command) {
      throw new Error(`Command not found: ${parsed.name}`);
    }

    return await command.execute(parsed.args, context);
  }
}
