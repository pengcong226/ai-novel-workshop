import { pluginManager } from '@/plugins/manager';
import type { ActionEnvelope } from './actionEnvelope';

export async function executeAssistantAction(actionEnv: ActionEnvelope): Promise<boolean> {
  try {
    await pluginManager.executeAction(actionEnv.action, actionEnv.data);
    return true;
  } catch (error) {
    console.error(`Failed to execute assistant action: ${actionEnv.action}`, error);
    return false;
  }
}
