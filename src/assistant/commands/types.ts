export interface CommandParam {
  name: string;
  description: string;
  required?: boolean;
}

export interface AssistantCommand {
  name: string; // e.g., "review", "help"
  description: string;
  params?: CommandParam[];
  execute: (args: string[], context?: any) => Promise<string | void>;
}

export interface ParsedCommand {
  name: string;
  args: string[];
  rawText: string;
}
