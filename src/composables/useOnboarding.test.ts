import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createOnboardingState, ONBOARDING_COMPLETED_KEY } from '@/composables/useOnboarding'

function createStorage() {
  const values = new Map<string, string>()
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value) }),
    removeItem: vi.fn((key: string) => { values.delete(key) }),
  }
}

describe('createOnboardingState', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('shows onboarding when completion key is absent', () => {
    const storage = createStorage()
    const onboarding = createOnboardingState(storage)

    onboarding.initialize()

    expect(onboarding.isVisible.value).toBe(true)
    expect(onboarding.currentStep.value).toBe(0)
  })

  it('hides onboarding when completion key exists', () => {
    const storage = createStorage()
    storage.setItem(ONBOARDING_COMPLETED_KEY, 'true')
    const onboarding = createOnboardingState(storage)

    onboarding.initialize()

    expect(onboarding.isVisible.value).toBe(false)
  })

  it('moves forward and backward within bounded steps', () => {
    const onboarding = createOnboardingState(createStorage(), 3)

    onboarding.nextStep()
    onboarding.nextStep()
    onboarding.nextStep()
    expect(onboarding.currentStep.value).toBe(2)

    onboarding.previousStep()
    onboarding.previousStep()
    onboarding.previousStep()
    expect(onboarding.currentStep.value).toBe(0)
  })

  it('completes onboarding and persists completion', () => {
    const storage = createStorage()
    const onboarding = createOnboardingState(storage)

    onboarding.initialize()
    onboarding.complete()

    expect(onboarding.isVisible.value).toBe(false)
    expect(storage.setItem).toHaveBeenCalledWith(ONBOARDING_COMPLETED_KEY, 'true')
  })

  it('dismisses without marking completion', () => {
    const storage = createStorage()
    const onboarding = createOnboardingState(storage)

    onboarding.initialize()
    onboarding.dismiss()

    expect(onboarding.isVisible.value).toBe(false)
    expect(storage.setItem).not.toHaveBeenCalledWith(ONBOARDING_COMPLETED_KEY, 'true')
  })

  it('resets completion and shows onboarding from the first step', () => {
    const storage = createStorage()
    const onboarding = createOnboardingState(storage)

    onboarding.complete()
    onboarding.currentStep.value = 2
    onboarding.reset()

    expect(storage.removeItem).toHaveBeenCalledWith(ONBOARDING_COMPLETED_KEY)
    expect(onboarding.isVisible.value).toBe(true)
    expect(onboarding.currentStep.value).toBe(0)
  })

  it('fails open when storage is unavailable', () => {
    const storage = {
      getItem: vi.fn(() => { throw new Error('blocked') }),
      setItem: vi.fn(() => { throw new Error('blocked') }),
      removeItem: vi.fn(() => { throw new Error('blocked') }),
    }
    const onboarding = createOnboardingState(storage)

    onboarding.initialize()
    onboarding.complete()
    onboarding.reset()

    expect(onboarding.isVisible.value).toBe(true)
    expect(onboarding.currentStep.value).toBe(0)
  })
})
