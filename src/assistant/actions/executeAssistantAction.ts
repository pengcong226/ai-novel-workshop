import { pluginManager } from '@/plugins/manager';
import type { ActionEnvelope } from './actionEnvelope';
import { getLogger } from '@/utils/logger'
const logger = getLogger('assistant:actions:executeAssistantAction')

export async function executeAssistantAction(actionEnv: ActionEnvelope): Promise<boolean> {
  try {
    await pluginManager.executeAction(actionEnv.action, actionEnv.data);
    return true;
  } catch (error) {
    logger.error(`Failed to execute assistant action: ${actionEnv.action}`, error);
    return false;
  }
}
