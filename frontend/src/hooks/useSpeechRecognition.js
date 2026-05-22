import { useState, useRef, useCallback, useEffect } from 'react'

const isBrowserSupported = () =>
  'webkitSpeechRecognition' in window || 'SpeechRecognition' in window

export function useSpeechRecognition({ onFinalTranscript, silenceSeconds = 2 }) {
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')
  const [error, setError] = useState(null)
  const recognitionRef = useRef(null)
  const silenceTimerRef = useRef(null)
  const finalRef = useRef('')
  const shouldRestartRef = useRef(false)
  const onFinalRef = useRef(onFinalTranscript)

  // Keep callback ref up to date without re-creating startListening
  useEffect(() => {
    onFinalRef.current = onFinalTranscript
  }, [onFinalTranscript])

  const clearSilenceTimer = () => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
  }

  const resetSilenceTimer = useCallback((currentFinal) => {
    clearSilenceTimer()
    silenceTimerRef.current = setTimeout(() => {
      if (currentFinal.trim()) {
        shouldRestartRef.current = false
        if (recognitionRef.current) recognitionRef.current.stop()
        onFinalRef.current(currentFinal.trim())
      }
    }, silenceSeconds * 1000)
  }, [silenceSeconds])

  const startListening = useCallback(() => {
    if (!isBrowserSupported()) {
      setError('Speech recognition not supported. Please use Chrome.')
      return
    }
    setTranscript('')
    setInterimTranscript('')
    setError(null)
    finalRef.current = ''
    shouldRestartRef.current = true

    const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition
    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'
    recognition.maxAlternatives = 1
    recognitionRef.current = recognition

    recognition.onstart = () => setIsListening(true)

    recognition.onresult = (event) => {
      let interim = ''
      let finalChunk = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          finalChunk += result[0].transcript
        } else {
          interim += result[0].transcript
        }
      }
      if (finalChunk) {
        finalRef.current += ' ' + finalChunk
        finalRef.current = finalRef.current.trim()
        setTranscript(finalRef.current)
        resetSilenceTimer(finalRef.current)
      }
      setInterimTranscript(interim)
    }

    recognition.onerror = (event) => {
      if (event.error === 'no-speech') return // just silence, ignore
      if (event.error === 'aborted') return
      setError(`Mic error: ${event.error}. Check microphone permissions.`)
      setIsListening(false)
    }

    recognition.onend = () => {
      // Chrome stops recognition frequently even with continuous:true — always restart
      // unless we intentionally stopped (shouldRestartRef set to false by silence timer)
      if (shouldRestartRef.current) {
        try { recognition.start() } catch (_) {}
      } else {
        setIsListening(false)
        setInterimTranscript('')
      }
    }

    recognition.start()
  }, [resetSilenceTimer])

  const stopListening = useCallback(() => {
    shouldRestartRef.current = false
    clearSilenceTimer()
    if (recognitionRef.current) recognitionRef.current.stop()
    setIsListening(false)
  }, [])

  const reset = useCallback(() => {
    stopListening()
    setTranscript('')
    setInterimTranscript('')
    finalRef.current = ''
  }, [stopListening])

  useEffect(() => () => {
    clearSilenceTimer()
    shouldRestartRef.current = false
  }, [])

  return {
    isListening,
    transcript,
    interimTranscript,
    error,
    isSupported: isBrowserSupported(),
    startListening,
    stopListening,
    reset,
  }
}
