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

    // Split into sentences for smoother playback (avoids Chrome 15s bug)
    const sentences = text.match(/[^.!?]+[.!?]*/g) || [text]
    let index = 0

    const speakNext = () => {
      if (isCancelledRef.current) {
        setIsSpeaking(false)
        return
      }
      if (index >= sentences.length) {
        setIsSpeaking(false)
        if (onEnd) onEnd()
        return
      }
      const sentence = sentences[index++].trim()
      if (!sentence) { speakNext(); return }

      const utterance = new SpeechSynthesisUtterance(sentence)
      const voice = selectedVoiceRef.current
      if (voice) utterance.voice = voice
      utterance.rate = 0.92    // slightly slower = clearer
      utterance.pitch = 1.0
      utterance.volume = 1.0
      utterance.onend = speakNext
      utterance.onerror = speakNext // skip broken sentence
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
