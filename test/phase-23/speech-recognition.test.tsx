import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSpeechRecognition } from '../../src/renderer/src/hooks/useSpeechRecognition'

type SpeechEventHandler = ((event?: unknown) => void) | null

class FakeSpeechRecognition {
  static instances: FakeSpeechRecognition[] = []

  continuous = false
  interimResults = false
  lang = ''
  onend: SpeechEventHandler = null
  onerror: SpeechEventHandler = null
  onresult: SpeechEventHandler = null
  start = vi.fn()
  stop = vi.fn(() => {
    this.onend?.()
  })

  constructor() {
    FakeSpeechRecognition.instances.push(this)
  }
}

function setSpeechRecognition(value: unknown): void {
  Object.defineProperty(window, 'webkitSpeechRecognition', {
    writable: true,
    configurable: true,
    value
  })
}

function emitResult(instance: FakeSpeechRecognition, text: string, isFinal: boolean): void {
  instance.onresult?.({
    resultIndex: 0,
    results: [
      {
        isFinal,
        0: { transcript: text }
      }
    ]
  })
}

beforeEach(() => {
  FakeSpeechRecognition.instances = []
  Object.defineProperty(navigator, 'language', {
    configurable: true,
    value: 'en-US'
  })
  Reflect.deleteProperty(window, 'SpeechRecognition')
  Reflect.deleteProperty(window, 'webkitSpeechRecognition')
})

describe('useSpeechRecognition', () => {
  it('reports unsupported when no browser speech recognition API exists', () => {
    const { result } = renderHook(() => useSpeechRecognition())

    expect(result.current.isSupported).toBe(false)
    expect(result.current.unavailableReason).toBe('Current environment does not support voice input')
  })

  it('starts and stops continuous interim recognition', () => {
    setSpeechRecognition(FakeSpeechRecognition)
    const { result } = renderHook(() => useSpeechRecognition())

    act(() => {
      result.current.startListening()
    })

    const instance = FakeSpeechRecognition.instances[0]
    expect(result.current.isListening).toBe(true)
    expect(instance.continuous).toBe(true)
    expect(instance.interimResults).toBe(true)
    expect(instance.lang).toBe('en-US')
    expect(instance.start).toHaveBeenCalledTimes(1)

    act(() => {
      result.current.stopListening()
    })

    expect(result.current.isListening).toBe(false)
    expect(instance.stop).toHaveBeenCalledTimes(1)
  })

  it('defaults recognition language to the browser language', () => {
    Object.defineProperty(navigator, 'language', {
      configurable: true,
      value: 'zh-CN'
    })
    setSpeechRecognition(FakeSpeechRecognition)
    const { result } = renderHook(() => useSpeechRecognition())

    act(() => {
      result.current.startListening()
    })

    expect(FakeSpeechRecognition.instances[0].lang).toBe('zh-CN')
  })

  it('restarts recognition when the browser ends listening unexpectedly', () => {
    setSpeechRecognition(FakeSpeechRecognition)
    const { result } = renderHook(() => useSpeechRecognition())

    act(() => {
      result.current.startListening()
    })
    const instance = FakeSpeechRecognition.instances[0]

    act(() => {
      instance.onend?.()
    })

    expect(result.current.isListening).toBe(true)
    expect(instance.start).toHaveBeenCalledTimes(2)
  })

  it('separates interim and final transcript updates', () => {
    setSpeechRecognition(FakeSpeechRecognition)
    const onFinalTranscript = vi.fn()
    const { result } = renderHook(() => useSpeechRecognition({ onFinalTranscript }))

    act(() => {
      result.current.startListening()
    })
    const instance = FakeSpeechRecognition.instances[0]

    act(() => {
      emitResult(instance, 'hello', false)
    })
    expect(result.current.interimTranscript).toBe('hello')
    expect(onFinalTranscript).not.toHaveBeenCalled()

    act(() => {
      emitResult(instance, 'hello world', true)
    })
    expect(result.current.interimTranscript).toBe('')
    expect(onFinalTranscript).toHaveBeenCalledWith('hello world')
  })

  it('stores recognition errors and stops listening', () => {
    setSpeechRecognition(FakeSpeechRecognition)
    const { result } = renderHook(() => useSpeechRecognition())

    act(() => {
      result.current.startListening()
    })
    const instance = FakeSpeechRecognition.instances[0]

    act(() => {
      instance.onerror?.({ error: 'not-allowed' })
    })

    expect(result.current.isListening).toBe(false)
    expect(result.current.error).toBe('not-allowed')
  })
})
