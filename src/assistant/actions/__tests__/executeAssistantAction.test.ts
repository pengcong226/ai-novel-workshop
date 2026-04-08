import { describe, it, expect, vi } from 'vitest';
import { executeAssistantAction } from '../executeAssistantAction';
import { pluginManager } from '@/plugins/manager';

describe('executeAssistantAction', () => {
  it('should call executeAction on pluginManager with correct action payload', async () => {
    const executeSpy = vi.spyOn(pluginManager, 'executeAction').mockResolvedValue(true);

    const action = {
      action: 'create_character',
      data: { name: 'Bob' }
    };

    const result = await executeAssistantAction(action);

    expect(result).toBe(true);
    expect(executeSpy).toHaveBeenCalledWith('create_character', { name: 'Bob' });

    executeSpy.mockRestore();
  });

  it('should return false if action fails', async () => {
    const executeSpy = vi.spyOn(pluginManager, 'executeAction').mockRejectedValue(new Error('Failed'));

    const action = {
      action: 'unknown_action',
      data: {}
    };

    const result = await executeAssistantAction(action);

    expect(result).toBe(false);

    executeSpy.mockRestore();
  });
});
