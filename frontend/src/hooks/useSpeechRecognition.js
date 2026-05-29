import { useState, useRef, useCallback, useEffect } from 'react'

const isBrowserSupported = () =>
  'webkitSpeechRecognition' in window || 'SpeechRecognition' in window

export function useSpeechRecognition({
  onFinalTranscript,
  silenceSeconds = 3,
  autoSubmitOnSilence = true,
}) {
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')
  const [error, setError] = useState(null)
  const [isSilenceWindowActive, setIsSilenceWindowActive] = useState(false)

  const recognitionRef = useRef(null)
  const silenceTimerRef = useRef(null)
  const finalRef = useRef('')
  const shouldRestartRef = useRef(false)
  const onFinalRef = useRef(onFinalTranscript)

  useEffect(() => {
    onFinalRef.current = onFinalTranscript
  }, [onFinalTranscript])

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
    setIsSilenceWindowActive(false)
  }, [])

  const resetSilenceTimer = useCallback((currentFinal) => {
    if (!autoSubmitOnSilence) return
    clearSilenceTimer()
    if (!currentFinal?.trim()) return

    // Silence window starts — show the countdown bar
    setIsSilenceWindowActive(true)

    silenceTimerRef.current = setTimeout(() => {
      setIsSilenceWindowActive(false)
      if (currentFinal.trim()) {
        shouldRestartRef.current = false
        if (recognitionRef.current) {
          try { recognitionRef.current.stop() } catch (_) {}
        }
        onFinalRef.current(currentFinal.trim())
      }
    }, silenceSeconds * 1000)
  }, [autoSubmitOnSilence, silenceSeconds, clearSilenceTimer])

  const startListening = useCallback(() => {
    if (!isBrowserSupported()) {
      setError('Speech recognition is not supported. Please use Google Chrome.')
      return
    }

    // Clean up any previous recognition instance
    if (recognitionRef.current) {
      shouldRestartRef.current = false
      try { recognitionRef.current.stop() } catch (_) {}
    }

    setTranscript('')
    setInterimTranscript('')
    setError(null)
    setIsSilenceWindowActive(false)
    finalRef.current = ''
    shouldRestartRef.current = true

    const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition
    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'
    recognition.maxAlternatives = 1
    recognitionRef.current = recognition

    recognition.onstart = () => {
      setIsListening(true)
      setError(null)
    }

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
        finalRef.current = (finalRef.current + ' ' + finalChunk).trim()
        setTranscript(finalRef.current)
      }

      setInterimTranscript(interim)

      // KEY FIX: reset silence timer on ANY speech activity — final OR interim.
      // Without this, the timer fires mid-sentence when Chrome emits interim-only results.
      // Always pass finalRef.current so only confirmed text is submitted when timer fires.
      if (autoSubmitOnSilence && (finalChunk || interim)) {
        resetSilenceTimer(finalRef.current)
      }
    }

    recognition.onerror = (event) => {
      // Stale error from a superseded recognition instance — ignore.
      // Without this, the old onerror fires AFTER startListening() has already
      // created a new instance and cleared micBlocked, causing micBlocked to be
      // set back to true immediately.
      if (recognitionRef.current !== recognition) return

      if (event.error === 'no-speech') {
        // Chrome fires this during silence — not a real error, recognition will onend+restart
        return
      }
      if (event.error === 'aborted') {
        // Intentional stop — ignore
        return
      }
      if (event.error === 'network') {
        // Transient network hiccup — attempt restart after short delay
        setError('Network issue with mic — reconnecting...')
        setTimeout(() => {
          setError(null)
          if (shouldRestartRef.current) {
            try { recognition.start() } catch (_) {}
          }
        }, 1500)
        return
      }
      if (event.error === 'audio-capture') {
        // No microphone hardware available — same as getUserMedia NotFoundError
        setError('mic-not-found')
        setIsListening(false)
        shouldRestartRef.current = false
        return
      }
      if (event.error === 'not-allowed') {
        // Mic permission denied by the user or browser
        setError('mic-not-allowed')
        setIsListening(false)
        shouldRestartRef.current = false
        return
      }
      if (event.error === 'service-not-allowed') {
        // Speech recognition SERVICE is blocked (not the mic). Common in incognito
        // mode because Chrome blocks audio being sent to Google's speech servers.
        // getUserMedia still works, but the recognition service never starts.
        // Signal with a distinct code so the UI can fall back to text mode.
        setError('mic-service-not-allowed')
        setIsListening(false)
        shouldRestartRef.current = false
        return
      }
      // Unknown error — show but try to keep going
      setError(`Mic error: ${event.error}`)
    }

    recognition.onend = () => {
      // If startListening() was called again after this instance was created,
      // recognitionRef.current will point to the newer instance. In that case,
      // this stale onend must NOT restart — doing so would fight the new instance
      // (both call start(), Chrome errors one or both, user sees nothing happen).
      if (recognitionRef.current !== recognition) return

      // Chrome with continuous:true still stops frequently — always restart
      // unless we intentionally stopped (shouldRestartRef = false via silence timer)
      if (shouldRestartRef.current) {
        try {
          recognition.start()
        } catch (_) {
          // If start fails, mark as not listening
          setIsListening(false)
        }
      } else {
        setIsListening(false)
        setInterimTranscript('')
        setIsSilenceWindowActive(false)
      }
    }

    try {
      recognition.start()
    } catch (err) {
      setError('Failed to start microphone. Is another app using the mic?')
    }
  }, [autoSubmitOnSilence, resetSilenceTimer])

  const stopListening = useCallback(() => {
    shouldRestartRef.current = false
    clearSilenceTimer()
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch (_) {}
    }
    setIsListening(false)
    setIsSilenceWindowActive(false)
  }, [clearSilenceTimer])

  // Manual submit — immediately submit whatever we have without waiting for silence
  const submitNow = useCallback(() => {
    const text = finalRef.current.trim()
    if (!text) return false
    clearSilenceTimer()
    shouldRestartRef.current = false
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch (_) {}
    }
    onFinalRef.current(text)
    return true
  }, [clearSilenceTimer])

  const reset = useCallback(() => {
    stopListening()
    setTranscript('')
    setInterimTranscript('')
    setIsSilenceWindowActive(false)
    finalRef.current = ''
  }, [stopListening])

  useEffect(() => () => {
    clearSilenceTimer()
    shouldRestartRef.current = false
  }, [clearSilenceTimer])

  return {
    isListening,
    transcript,
    interimTranscript,
    isSilenceWindowActive,  // true only during the actual silence countdown
    error,
    isSupported: isBrowserSupported(),
    startListening,
    stopListening,
    submitNow,   // manual submit without waiting for silence
    reset,
  }
}
