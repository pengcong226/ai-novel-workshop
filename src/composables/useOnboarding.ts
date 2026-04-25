import { computed, ref, type ComputedRef, type Ref } from 'vue'

export const ONBOARDING_COMPLETED_KEY = 'ai-novel-workshop:onboarding:c2:completed'

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
    isVisible.value = !readCompleted(storage)
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
    isVisible.value = false
  }

  function reset(): void {
    try {
      storage?.removeItem(ONBOARDING_COMPLETED_KEY)
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

const onboardingState = createOnboardingState()

export function useOnboarding(): OnboardingState {
  return onboardingState
}
