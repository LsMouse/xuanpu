import { useCallback, useEffect, useRef, useState } from 'react'

type SpeechRecognitionErrorCode =
  | 'aborted'
  | 'audio-capture'
  | 'bad-grammar'
  | 'language-not-supported'
  | 'network'
  | 'no-speech'
  | 'not-allowed'
  | 'service-not-allowed'
  | string

interface SpeechRecognitionAlternative {
  transcript: string
}

interface SpeechRecognitionResultLike {
  isFinal: boolean
  [index: number]: SpeechRecognitionAlternative
}

interface SpeechRecognitionEventLike {
  resultIndex: number
  results: ArrayLike<SpeechRecognitionResultLike>
}

interface SpeechRecognitionErrorEventLike {
  error: SpeechRecognitionErrorCode
}

interface SpeechRecognitionInstance {
  continuous: boolean
  interimResults: boolean
  lang: string
  onend: (() => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  start: () => void
  stop: () => void
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionInstance
}

interface BrowserWindowWithSpeech extends Window {
  SpeechRecognition?: SpeechRecognitionConstructor
  webkitSpeechRecognition?: SpeechRecognitionConstructor
}

interface UseSpeechRecognitionOptions {
  lang?: string
  onFinalTranscript?: (transcript: string) => void
}

interface UseSpeechRecognitionResult {
  isSupported: boolean
  isListening: boolean
  interimTranscript: string
  error: SpeechRecognitionErrorCode | null
  unavailableReason: string | null
  startListening: () => void
  stopListening: () => void
  resetInterimTranscript: () => void
}

const UNSUPPORTED_REASON = 'Current environment does not support voice input'

function getDefaultRecognitionLanguage(): string {
  if (typeof navigator === 'undefined') return 'en-US'
  return navigator.language || 'en-US'
}

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null

  const speechWindow = window as BrowserWindowWithSpeech
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null
}

export function useSpeechRecognition(
  options: UseSpeechRecognitionOptions = {}
): UseSpeechRecognitionResult {
  const { lang = getDefaultRecognitionLanguage(), onFinalTranscript } = options
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const stopRequestedRef = useRef(false)
  const finalTranscriptCallbackRef = useRef(onFinalTranscript)
  const [interimTranscript, setInterimTranscript] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [error, setError] = useState<SpeechRecognitionErrorCode | null>(null)

  finalTranscriptCallbackRef.current = onFinalTranscript

  const SpeechRecognitionCtor = getSpeechRecognitionConstructor()
  const isSupported = SpeechRecognitionCtor != null

  const stopListening = useCallback(() => {
    stopRequestedRef.current = true
    recognitionRef.current?.stop()
    setIsListening(false)
  }, [])

  const resetInterimTranscript = useCallback(() => {
    setInterimTranscript('')
  }, [])

  const startListening = useCallback(() => {
    if (!SpeechRecognitionCtor) return

    stopRequestedRef.current = false
    setError(null)

    const recognition = new SpeechRecognitionCtor()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = lang

    recognition.onresult = (event) => {
      let nextInterim = ''

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]
        const transcript = result[0]?.transcript?.trim() ?? ''
        if (!transcript) continue

        if (result.isFinal) {
          finalTranscriptCallbackRef.current?.(transcript)
          nextInterim = ''
        } else {
          nextInterim = transcript
        }
      }

      setInterimTranscript(nextInterim)
    }

    recognition.onerror = (event) => {
      stopRequestedRef.current = true
      setError(event.error)
      setIsListening(false)
      setInterimTranscript('')
    }

    recognition.onend = () => {
      setInterimTranscript('')
      if (stopRequestedRef.current) {
        setIsListening(false)
        return
      }

      try {
        recognition.start()
        setIsListening(true)
      } catch {
        setIsListening(false)
        recognitionRef.current = null
      }
    }

    recognitionRef.current = recognition
    recognition.start()
    setIsListening(true)
  }, [SpeechRecognitionCtor, lang])

  useEffect(() => {
    return () => {
      stopRequestedRef.current = true
      recognitionRef.current?.stop()
      recognitionRef.current = null
    }
  }, [])

  return {
    isSupported,
    isListening,
    interimTranscript,
    error,
    unavailableReason: isSupported ? null : UNSUPPORTED_REASON,
    startListening,
    stopListening,
    resetInterimTranscript
  }
}
