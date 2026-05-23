import { afterEach, describe, expect, it, vi } from 'vitest'

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')

function restoreGlobal(name: 'window' | 'navigator', descriptor: PropertyDescriptor | undefined): void {
  if (descriptor) {
    Object.defineProperty(globalThis, name, descriptor)
    return
  }
  Reflect.deleteProperty(globalThis, name)
}

function setNavigatorOnline(value: boolean): void {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      get onLine() {
        return value
      },
    },
  })
}

function installWindowMock(): EventTarget {
  const target = new EventTarget()
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: target,
  })
  return target
}

async function importOnlineStatus() {
  vi.resetModules()
  return await import('./useOnlineStatus')
}

describe('useOnlineStatus', () => {
  afterEach(() => {
    restoreGlobal('window', originalWindow)
    restoreGlobal('navigator', originalNavigator)
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('initializes from navigator online state', async () => {
    installWindowMock()
    setNavigatorOnline(false)
    const { useOnlineStatus } = await importOnlineStatus()

    const status = useOnlineStatus()

    expect(status.isOnline.value).toBe(false)
    expect(status.isOffline.value).toBe(true)
  })

  it('updates when browser online and offline events fire', async () => {
    const windowMock = installWindowMock()
    setNavigatorOnline(true)
    const { useOnlineStatus } = await importOnlineStatus()
    const status = useOnlineStatus()
    expect(status.isOnline.value).toBe(true)

    windowMock.dispatchEvent(new Event('offline'))
    expect(status.isOnline.value).toBe(false)
    expect(status.lastChangedAt.value).toBeInstanceOf(Date)

    windowMock.dispatchEvent(new Event('online'))
    expect(status.isOnline.value).toBe(true)
  })

  it('attaches listeners only once for repeated composable calls', async () => {
    const windowMock = installWindowMock()
    setNavigatorOnline(true)
    const addListener = vi.spyOn(windowMock, 'addEventListener')
    const { useOnlineStatus } = await importOnlineStatus()

    useOnlineStatus()
    useOnlineStatus()

    expect(addListener.mock.calls.filter(call => call[0] === 'online')).toHaveLength(1)
    expect(addListener.mock.calls.filter(call => call[0] === 'offline')).toHaveLength(1)
  })
})
