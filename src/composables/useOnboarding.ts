import { computed, ref, type ComputedRef, type Ref } from 'vue'

export const ONBOARDING_COMPLETED_KEY = 'ai-novel-workshop:onboarding:c2:completed'
export const ONBOARDING_DISMISSED_KEY = 'ai-novel-workshop:onboarding:c2:dismissed-at'

interface OnboardingStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface OnboardingState {
  isVisible: Ref<boolean>
  currentStep: Ref<number>
  isCompleted: ComputedRef<boolean>
  initialize: () => void
  nextStep: () => void
  previousStep: () => void
  complete: () => void
  dismiss: () => void
  reset: () => void
}

function getDefaultStorage(): OnboardingStorage | undefined {
  return typeof window === 'undefined' ? undefined : window.localStorage
}

export function createOnboardingState(storage = getDefaultStorage(), stepCount = 4): OnboardingState {
  const isVisible = ref(false)
  const currentStep = ref(0)
  const isCompleted = computed(() => readCompleted(storage))
  const maxStep = Math.max(0, stepCount - 1)

  function initialize(): void {
    if (readCompleted(storage)) {
      isVisible.value = false
      return
    }
    const dismissedAt = readDismissedAt(storage)
    if (dismissedAt && Date.now() - dismissedAt < 24 * 60 * 60 * 1000) {
      isVisible.value = false
      return
    }
    isVisible.value = true
    currentStep.value = 0
  }

  function nextStep(): void {
    currentStep.value = Math.min(maxStep, currentStep.value + 1)
  }

  function previousStep(): void {
    currentStep.value = Math.max(0, currentStep.value - 1)
  }

  function complete(): void {
    try {
      storage?.setItem(ONBOARDING_COMPLETED_KEY, 'true')
      isVisible.value = false
    } catch {
      isVisible.value = false
    }
  }

  function dismiss(): void {
    try {
      storage?.setItem(ONBOARDING_DISMISSED_KEY, String(Date.now()))
    } catch {
      // ignore
    }
    isVisible.value = false
  }

  function reset(): void {
    try {
      storage?.removeItem(ONBOARDING_COMPLETED_KEY)
      storage?.removeItem(ONBOARDING_DISMISSED_KEY)
    } catch {
      // Fail open: users should be able to see onboarding again when persistence is unavailable.
    }
    currentStep.value = 0
    isVisible.value = true
  }

  return {
    isVisible,
    currentStep,
    isCompleted,
    initialize,
    nextStep,
    previousStep,
    complete,
    dismiss,
    reset,
  }
}

function readCompleted(storage?: OnboardingStorage): boolean {
  try {
    return storage?.getItem(ONBOARDING_COMPLETED_KEY) === 'true'
  } catch {
    return false
  }
}

function readDismissedAt(storage?: OnboardingStorage): number | null {
  try {
    const val = storage?.getItem(ONBOARDING_DISMISSED_KEY)
    return val ? Number(val) : null
  } catch {
    return null
  }
}

const onboardingState = createOnboardingState()

export function useOnboarding(): OnboardingState {
  return onboardingState
}
