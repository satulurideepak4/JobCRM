import { useState, useRef, useCallback, useEffect } from 'react'

// Voice preference order — first match wins
const VOICE_PRIORITY = [
  'Google US English',
  'Google US English Male',
  'Google US English Female',
  'Samantha',
  'Alex',
  'Microsoft Zira Desktop',
  'Microsoft David Desktop',
]

function pickBestVoice(voices) {
  for (const preferred of VOICE_PRIORITY) {
    const match = voices.find(v => v.name === preferred)
    if (match) return match
  }
  // Fall back to any en-US voice
  return voices.find(v => v.lang === 'en-US') || voices[0] || null
}

export function useSpeechSynthesis() {
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [selectedVoice, setSelectedVoice] = useState(null)
  const [isReady, setIsReady] = useState(false)
  const utteranceRef = useRef(null)
  const selectedVoiceRef = useRef(null)
  const isCancelledRef = useRef(false)

  useEffect(() => {
    selectedVoiceRef.current = selectedVoice
  }, [selectedVoice])

  useEffect(() => {
    const load = () => {
      const voices = window.speechSynthesis.getVoices()
      if (voices.length) {
        const best = pickBestVoice(voices)
        setSelectedVoice(best)
        selectedVoiceRef.current = best
        setIsReady(true)
      }
    }
    load()
    window.speechSynthesis.onvoiceschanged = load
    return () => { window.speechSynthesis.onvoiceschanged = null }
  }, [])

  const speak = useCallback((text, { onEnd } = {}) => {
    window.speechSynthesis.cancel()
    isCancelledRef.current = false

    // Split into sentences for smoother playback (avoids Chrome 15s cut-off bug)
    const sentences = text.match(/[^.!?]+[.!?]*/g) || [text]
    let index = 0
    let onEndFired = false  // prevent Chrome duplicate-onend from firing callback twice

    const speakNext = () => {
      if (isCancelledRef.current) {
        setIsSpeaking(false)
        return
      }
      if (index >= sentences.length) {
        setIsSpeaking(false)
        if (onEnd && !onEndFired) {
          onEndFired = true
          onEnd()
        }
        return
      }
      const sentence = sentences[index++].trim()
      if (!sentence) { speakNext(); return }

      const utterance = new SpeechSynthesisUtterance(sentence)
      const voice = selectedVoiceRef.current
      if (voice) utterance.voice = voice
      utterance.rate = 0.92
      utterance.pitch = 1.0
      utterance.volume = 1.0

      // Fallback timeout: if onend never fires (headless browser, some mobile browsers),
      // advance after estimated duration so the interview doesn't get permanently stuck.
      // ~13 chars/sec at rate 0.92 + 1s buffer, clamped between 2s and 20s.
      let fallbackTimer = null
      const estimatedMs = Math.min(Math.max((sentence.length / 13) * 1000 + 1000, 2000), 20000)

      const advance = () => {
        if (fallbackTimer) { clearTimeout(fallbackTimer); fallbackTimer = null }
        utterance.onend = null
        utterance.onerror = null
        speakNext()
      }

      fallbackTimer = setTimeout(advance, estimatedMs)

      // Null out handlers on first fire — Chrome fires onend twice per utterance sometimes
      utterance.onend = () => advance()
      utterance.onerror = () => advance()  // skip broken sentence, keep going

      utteranceRef.current = utterance
      setIsSpeaking(true)
      window.speechSynthesis.speak(utterance)
    }

    speakNext()
  }, [])

  const stop = useCallback(() => {
    isCancelledRef.current = true
    window.speechSynthesis.cancel()
    setIsSpeaking(false)
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isCancelledRef.current = true
      window.speechSynthesis.cancel()
    }
  }, [])

  return { speak, stop, isSpeaking, isReady, selectedVoice }
}
