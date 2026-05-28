import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Mic, MicOff, RefreshCw, X, ChevronDown, ChevronUp, Send } from 'lucide-react'
import api from '../api/client'
import { useSpeechSynthesis } from '../hooks/useSpeechSynthesis'
import { useSpeechRecognition } from '../hooks/useSpeechRecognition'
import { useTheme } from '../contexts/ThemeContext'

const STATE = {
  LOADING: 'loading',
  SPEAKING: 'speaking',
  LISTENING: 'listening',
  PROCESSING: 'processing',
  DEBRIEF: 'debrief',
  ERROR: 'error',
}

// Animated waveform bars
function WaveformBars({ active, isDark }) {
  return (
    <div className="flex items-center gap-1 h-10">
      {[0.6, 1.0, 0.7, 1.0, 0.5, 0.9, 0.6].map((h, i) => (
        <div
          key={i}
          className="w-1 rounded-sm transition-colors duration-300"
          style={{
            background: active ? '#6366f1' : (isDark ? '#1e293b' : '#cbd5e1'),
            height: `${h * 100}%`,
            animation: active ? `wave ${0.8 + i * 0.1}s ease-in-out ${i * 0.08}s infinite alternate` : 'none',
          }}
        />
      ))}
      <style>{`
        @keyframes wave {
          from { transform: scaleY(0.3); }
          to   { transform: scaleY(1); }
        }
      `}</style>
    </div>
  )
}

// rAF-based progress bar filling over silenceMs
function CountdownBar({ running, silenceMs = 3000, isDark }) {
  const [progress, setProgress] = useState(0)
  const startRef = useRef(null)
  const rafRef = useRef(null)

  useEffect(() => {
    if (running) {
      startRef.current = Date.now()
      const tick = () => {
        const p = Math.min((Date.now() - startRef.current) / silenceMs, 1)
        setProgress(p)
        if (p < 1) rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    } else {
      setProgress(0)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [running, silenceMs])

  return (
    <div className={`w-full h-[3px] rounded-full overflow-hidden ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`}>
      <div
        className="h-full bg-red-500 rounded-full"
        style={{ width: `${progress * 100}%`, transition: 'width 0.05s linear' }}
      />
    </div>
  )
}

// Pulsing mic orb — also a button to start/stop recording
function PulsingMic({ active, onClick, isDark, label }) {
  return (
    <button
      onClick={onClick}
      className="relative w-28 h-28 flex flex-col items-center justify-center gap-2 group focus:outline-none"
      title={active ? 'Recording — tap to stop' : 'Tap to start recording'}
    >
      {active && (
        <>
          <div className="absolute w-28 h-28 rounded-full bg-red-500/20 animate-ping" />
          <div className="absolute w-20 h-20 rounded-full bg-red-500/10" style={{ animation: 'pulse 1.5s ease-out infinite 0.3s' }} />
        </>
      )}
      <div
        className="relative z-10 w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 group-hover:scale-105 group-active:scale-95 shadow-lg"
        style={{
          background: active ? '#ef4444' : (isDark ? '#1e293b' : '#e2e8f0'),
          boxShadow: active ? '0 0 0 4px rgba(239,68,68,0.2)' : 'none',
        }}
      >
        {active
          ? <Mic size={26} color="#fff" />
          : <MicOff size={26} color={isDark ? '#475569' : '#94a3b8'} />
        }
      </div>
      {label && (
        <span className={`text-xs font-medium z-10 ${active ? 'text-red-400' : (isDark ? 'text-slate-500' : 'text-slate-400')}`}>
          {label}
        </span>
      )}
    </button>
  )
}

function Spinner({ isDark }) {
  return (
    <div className={`w-8 h-8 border-[3px] border-t-brand rounded-full animate-spin ${isDark ? 'border-slate-700' : 'border-slate-300'}`} />
  )
}

export default function InterviewRoom() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const { isDark } = useTheme()

  const [roomState, setRoomState] = useState(STATE.LOADING)
  const [session, setSession] = useState(null)
  const [currentQuestion, setCurrentQuestion] = useState('')
  const [questionNumber, setQuestionNumber] = useState(1)
  const [totalQuestions, setTotalQuestions] = useState(10)
  const [debrief, setDebrief] = useState(null)
  const [showTranscript, setShowTranscript] = useState(false)
  const [errorMsg, setErrorMsg] = useState(null)
  const [endingEarly, setEndingEarly] = useState(false)
  const [textAnswer, setTextAnswer] = useState('')
  const [useTextMode, setUseTextMode] = useState(false)
  const [micBlocked, setMicBlocked] = useState(false)
  const [noMicFound, setNoMicFound] = useState(false)
  const [checkingMic, setCheckingMic] = useState(false)
  const [pendingListen, setPendingListen] = useState(false)

  const { speak, stop: stopSpeaking, isSpeaking } = useSpeechSynthesis()

  // Always-current ref to startListening — avoids stale closure in speak() callbacks
  const startListeningRef = useRef(null)

  const handleFinalTranscript = useCallback(async (text) => {
    setRoomState(STATE.PROCESSING)
    try {
      const res = await api.post(`/api/interview/${sessionId}/respond`, { answer: text })
      const data = res.data

      if (data.is_final) {
        setCurrentQuestion(data.closing || 'That concludes our interview.')
        setRoomState(STATE.SPEAKING)
        speak(data.closing || 'That concludes our interview.', {
          onEnd: () => {
            setDebrief(data.debrief)
            setRoomState(STATE.DEBRIEF)
          },
        })
      } else {
        setCurrentQuestion(data.question)
        setQuestionNumber(data.question_number)
        setRoomState(STATE.SPEAKING)
        speak(data.question, {
          // Don't start mic here — set pendingListen and let the isSpeaking
          // watcher open the mic only after TTS audio is fully done
          onEnd: () => setPendingListen(true),
        })
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.detail || err.message || 'Failed to submit answer.')
      setRoomState(STATE.ERROR)
    }
  }, [sessionId, speak]) // eslint-disable-line

  const {
    isListening,
    transcript,
    interimTranscript,
    isSilenceWindowActive,
    error: micError,
    isSupported,
    startListening,
    stopListening,
    submitNow,
    reset: resetRecognition,
  } = useSpeechRecognition({
    onFinalTranscript: handleFinalTranscript,
    silenceSeconds: 3,
  })

  // Keep ref current so speak() callbacks always use latest startListening
  useEffect(() => { startListeningRef.current = startListening }, [startListening])

  // Auto-switch to text mode if mic not supported
  useEffect(() => {
    if (!isSupported) setUseTextMode(true)
  }, [isSupported])

  // When TTS finishes AND pendingListen is set → actually open the mic
  // Using isSpeaking as a gate prevents the mic from picking up TTS audio echo
  useEffect(() => {
    if (pendingListen && !isSpeaking) {
      setPendingListen(false)
      setRoomState(STATE.LISTENING)
      setTimeout(async () => {
        if (useTextMode) return
        // Only auto-start recognition if the mic is already permitted.
        // Calling recognition.start() without a user gesture (from setTimeout) gives
        // an immediate 'not-allowed' in incognito and some Chrome configurations —
        // no dialog is shown, the user just sees the blocked card.
        // When permission is 'prompt' or unknown, leave the orb in inactive state
        // so the user taps it themselves (which IS a user gesture and triggers the dialog).
        if (navigator.permissions) {
          try {
            const status = await navigator.permissions.query({ name: 'microphone' })
            if (status.state === 'granted') startListeningRef.current?.()
            // 'prompt' or 'denied': show inactive orb, require user tap
          } catch {
            startListeningRef.current?.() // Permissions API unsupported — try optimistically
          }
        } else {
          startListeningRef.current?.() // No Permissions API — try optimistically
        }
      }, 400)
    }
  }, [pendingListen, isSpeaking, useTextMode])

  // Handle mic errors surfaced by the hook.
  // Only show the blocked card for genuine mic permission denials.
  // Hardware-missing and speech-service errors switch to text mode instead.
  useEffect(() => {
    if (!micError) return
    if (micError === 'mic-not-found') {
      // No microphone hardware — don't show the permissions card, go to text mode
      setNoMicFound(true)
      setMicBlocked(false)
      setUseTextMode(true)
    }
    if (micError === 'mic-not-allowed') setMicBlocked(true)
    if (micError === 'mic-service-not-allowed') { setMicBlocked(false); setUseTextMode(true) }
  }, [micError])

  // Guard ref: prevent concurrent handleMicRetry calls (React Strict Mode double-invoke
  // + polling effect re-runs can fire this multiple times simultaneously).
  const micRetryRunningRef = useRef(false)

  // handleMicRetry — called when user taps mic orb, "Try Again", or "Use mic".
  // Uses the Speech Recognition probe directly — NO getUserMedia pre-check.
  //
  // Why skip getUserMedia? On some Chrome/macOS combos, getUserMedia() returns
  // NotFoundError even when the mic is present and Chrome has full OS + site
  // permission. The Speech Recognition API (webkitSpeechRecognition) uses a
  // different internal code path and works correctly in those cases.
  // The probe gives us all the same diagnostics:
  //   onstart              → mic + service OK → start real recognition
  //   onerror: audio-capture   → no mic hardware
  //   onerror: not-allowed     → permission denied
  //   onerror: service-not-allowed → incognito / service blocked
  //
  // IMPORTANT: defined before the polling useEffect that depends on it.
  const handleMicRetry = useCallback(async () => {
    if (micRetryRunningRef.current) {
      console.log('[MIC] handleMicRetry skipped — already running')
      return
    }
    micRetryRunningRef.current = true
    console.log('[MIC] handleMicRetry started')
    setCheckingMic(true)

    const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition
    if (!SpeechRecognition) {
      console.warn('[MIC] webkitSpeechRecognition not available → text mode')
      micRetryRunningRef.current = false
      setCheckingMic(false)
      setUseTextMode(true)
      return
    }

    // ── Probe: start a silent recognition session to test mic + service ────────────
    console.log('[MIC] Probing speech recognition...')
    const probeResult = await new Promise(resolve => {
      const probe = new SpeechRecognition()
      probe.continuous = false
      probe.interimResults = false
      let done = false
      const finish = (outcome) => {
        if (done) return
        done = true
        try { probe.abort() } catch {}
        resolve(outcome)
      }
      probe.onstart = () => { console.log('[MIC] Probe onstart → mic OK'); finish('ok') }
      probe.onerror = (e) => {
        console.warn('[MIC] Probe onerror:', e.error)
        if (e.error === 'not-allowed')         finish('permission-denied')
        else if (e.error === 'service-not-allowed') finish('service-blocked')
        else if (e.error === 'audio-capture')  finish('no-device')
        else                                   finish('ok') // unknown — let real recognition decide
      }
      probe.onend = () => { console.log('[MIC] Probe onend'); finish('ok') }
      setTimeout(() => { console.log('[MIC] Probe timeout → assume OK'); finish('ok') }, 3000)
      try { probe.start() } catch (e) { console.error('[MIC] Probe start() threw:', e); finish('no-device') }
    })

    micRetryRunningRef.current = false
    setCheckingMic(false)
    console.log('[MIC] Probe result:', probeResult)

    if (probeResult === 'permission-denied') {
      setNoMicFound(false)
      setMicBlocked(true)
    } else if (probeResult === 'service-blocked') {
      setMicBlocked(false)
      setNoMicFound(false)
      setUseTextMode(true)
    } else if (probeResult === 'no-device') {
      setNoMicFound(true)
      setMicBlocked(false)
      setUseTextMode(true)
    } else {
      // 'ok' — mic and service are good
      console.log('[MIC] All clear → starting real recognition')
      setMicBlocked(false)
      setNoMicFound(false)
      setUseTextMode(false)
      startListeningRef.current?.()
    }
  }, [])

  // When the blocked card is showing, poll the Permissions API every 2s.
  // The moment user grants mic access in browser settings, auto-retry via getUserMedia.
  // NOTE: We use handleMicRetry (not startListening directly) because Chrome caches the
  // not-allowed state for webkitSpeechRecognition — getUserMedia must be called first.
  useEffect(() => {
    if (!micBlocked) return
    if (!navigator.permissions) return

    let status = null
    let interval = null

    const check = () => {
      if (status?.state === 'granted') handleMicRetry()
    }

    navigator.permissions.query({ name: 'microphone' }).then(s => {
      status = s
      // Already granted by the time we check — retry immediately
      if (s.state === 'granted') { handleMicRetry(); return }

      s.addEventListener('change', check)

      // Also poll every 2s in case the change event doesn't fire (Firefox, Safari)
      interval = setInterval(() => {
        navigator.permissions.query({ name: 'microphone' }).then(s2 => {
          if (s2.state === 'granted') { clearInterval(interval); handleMicRetry() }
        })
      }, 2000)
    }).catch(() => {})

    // Cleanup: remove listener + clear interval — correctly placed as useEffect return
    return () => {
      if (status) status.removeEventListener('change', check)
      clearInterval(interval)
    }
  }, [micBlocked, handleMicRetry])

  // Handle mic orb tap — start or stop.
  // Always go through handleMicRetry when starting (not startListening directly)
  // so getUserMedia is called first. This:
  //   1. Shows a prominent permission dialog on first use (instead of the subtle address-bar chip)
  //   2. Ensures the mic stream is established before recognition attempts to start
  //   3. Works correctly in incognito and other restricted contexts
  const handleMicTap = useCallback(() => {
    if (isListening) {
      stopListening()
    } else {
      handleMicRetry()
    }
  }, [isListening, stopListening, handleMicRetry])

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get(`/api/interview/${sessionId}`)
        const data = res.data
        setSession(data)
        setTotalQuestions(data.total_questions)
        setQuestionNumber(data.question_count)

        if (data.status === 'completed' && data.debrief) {
          setDebrief(data.debrief)
          const lastQ = (data.conversation || []).findLast
            ? data.conversation.findLast(m => m.role === 'assistant')
            : [...(data.conversation || [])].reverse().find(m => m.role === 'assistant')
          setCurrentQuestion(lastQ?.content || '')
          setRoomState(STATE.DEBRIEF)
          return
        }

        const firstMsg = (data.conversation || [])[0]
        if (firstMsg?.role === 'assistant') {
          setCurrentQuestion(firstMsg.content)
          setRoomState(STATE.SPEAKING)
          speak(firstMsg.content, {
            onEnd: () => setPendingListen(true),
          })
        } else {
          setRoomState(STATE.ERROR)
          setErrorMsg('Could not load interview session.')
        }
      } catch (err) {
        setErrorMsg(err.response?.data?.detail || 'Failed to load interview session.')
        setRoomState(STATE.ERROR)
      }
    }
    load()
  }, [sessionId]) // eslint-disable-line

  const handleReRecord = () => {
    stopSpeaking()
    resetRecognition()
    setTextAnswer('')
    setMicBlocked(false)
    setNoMicFound(false)
    setCheckingMic(false)
    setRoomState(STATE.LISTENING)
    if (!useTextMode) handleMicRetry()
  }

  const handleTextSubmit = useCallback(async () => {
    const text = textAnswer.trim()
    if (!text) return
    setTextAnswer('')
    await handleFinalTranscript(text)
  }, [textAnswer, handleFinalTranscript])

  const handleManualSubmit = () => {
    // submitNow fires the onFinalTranscript with whatever is confirmed so far
    const submitted = submitNow()
    if (!submitted) {
      // Nothing confirmed yet — try text fallback
      if (textAnswer.trim()) handleTextSubmit()
    }
  }

  const handleEndEarly = async () => {
    if (endingEarly) return
    setEndingEarly(true)
    stopSpeaking()
    stopListening()
    try {
      const res = await api.post(`/api/interview/${sessionId}/end`)
      setDebrief(res.data.debrief || 'Interview ended early.')
      setRoomState(STATE.DEBRIEF)
    } catch {
      setDebrief('Interview ended early. Not enough data for a full debrief.')
      setRoomState(STATE.DEBRIEF)
    } finally {
      setEndingEarly(false)
    }
  }

  const statusLabel = () => {
    switch (roomState) {
      case STATE.LOADING:     return 'Loading session...'
      case STATE.SPEAKING:    return 'Interviewer is speaking...'
      case STATE.LISTENING:   return useTextMode ? 'Type your answer below' : 'Your turn to answer...'
      case STATE.PROCESSING:  return 'Processing your answer...'
      case STATE.DEBRIEF:     return 'Interview Complete'
      case STATE.ERROR:       return 'Something went wrong'
      default: return ''
    }
  }

  // Theme shorthands
  const bg       = isDark ? 'bg-[#0f1117]'  : 'bg-[#f4f6fa]'
  const cardBg   = isDark ? 'bg-[#1e2330]'  : 'bg-white'
  const border   = isDark ? 'border-slate-700/60' : 'border-gray-300'
  const textMain = isDark ? 'text-slate-100' : 'text-slate-900'
  const textSub  = isDark ? 'text-slate-400' : 'text-slate-600'
  const textMuted= isDark ? 'text-slate-600' : 'text-slate-400'

  // ─── DEBRIEF VIEW ────────────────────────────────────────────────────────────
  if (roomState === STATE.DEBRIEF) {
    const conversation = session?.conversation || []
    const qaPairs = []
    for (let i = 0; i < conversation.length - 1; i++) {
      if (conversation[i].role === 'assistant' && conversation[i + 1]?.role === 'user') {
        qaPairs.push({ q: conversation[i].content, a: conversation[i + 1].content })
      }
    }

    return (
      <div className={`min-h-screen ${bg} py-10 px-6`}>
        <div className="max-w-2xl mx-auto">
          {/* Hero */}
          <div className="text-center mb-10">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-500 to-brand flex items-center justify-center text-3xl mx-auto mb-4 shadow-lg shadow-brand/20">
              ✓
            </div>
            <h1 className={`text-[28px] font-bold ${textMain} mb-2`}>Interview Complete</h1>
            <p className={`${textSub} text-[15px]`}>Here is your personalized feedback</p>
          </div>

          {/* Debrief card */}
          <div className={`${cardBg} border ${border} rounded-2xl p-7 mb-5`}>
            <h2 className={`text-xs font-bold uppercase tracking-widest ${textMuted} mb-5`}>Feedback</h2>
            <div className={`text-sm ${textSub} leading-relaxed space-y-2.5`}>
              {(debrief || '').split('\n').map((line, i) => (
                <p key={i} className={line.trim() === '' ? 'h-2' : ''}>{line || null}</p>
              ))}
            </div>
          </div>

          {/* Transcript toggle */}
          <div className={`${cardBg} border ${border} rounded-2xl mb-5 overflow-hidden`}>
            <button
              onClick={() => setShowTranscript(t => !t)}
              className={`w-full px-5 py-4 flex items-center justify-between transition-colors ${isDark ? 'hover:bg-slate-800/30' : 'hover:bg-slate-50'}`}
            >
              <span className={`text-sm font-semibold ${textSub}`}>
                View Full Transcript ({qaPairs.length} Q&A pairs)
              </span>
              {showTranscript
                ? <ChevronUp size={16} className={textMuted} />
                : <ChevronDown size={16} className={textMuted} />
              }
            </button>

            {showTranscript && (
              <div className={`px-5 pb-5 border-t ${border}`}>
                {qaPairs.map((pair, i) => (
                  <div key={i} className="mt-5">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-brand mb-1.5">Q{i + 1}</div>
                    <p className={`${textMain} text-sm leading-relaxed mb-2`}>{pair.q}</p>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-500 mb-1.5">Your Answer</div>
                    <p className={`${textSub} text-sm leading-relaxed`}>{pair.a}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={() => navigate('/interview')}
            className="w-full py-3.5 rounded-xl bg-brand hover:bg-brand-hover text-white font-semibold text-[15px] transition-colors"
          >
            Start New Interview
          </button>
        </div>
      </div>
    )
  }

  // ─── ERROR VIEW ───────────────────────────────────────────────────────────────
  if (roomState === STATE.ERROR) {
    return (
      <div className={`min-h-screen ${bg} flex flex-col items-center justify-center px-6`}>
        <div className="text-red-400 text-lg mb-3">Something went wrong</div>
        <div className={`${textSub} text-sm mb-6 text-center max-w-sm`}>
          {errorMsg || micError || 'Unknown error'}
        </div>
        <button
          onClick={() => navigate('/interview')}
          className="px-6 py-2.5 rounded-lg bg-brand hover:bg-brand-hover text-white font-medium transition-colors"
        >
          Back to Interview Setup
        </button>
      </div>
    )
  }

  // ─── MAIN INTERVIEW UI ────────────────────────────────────────────────────────
  const isBlocked = endingEarly || roomState === STATE.LOADING || roomState === STATE.PROCESSING
  const hasAnswer = transcript.trim().length > 0 || textAnswer.trim().length > 0

  return (
    <div className={`min-h-screen ${bg} flex flex-col`}>
      {/* Top bar */}
      <div className={`flex items-center justify-between px-6 py-4 border-b ${isDark ? 'border-slate-800/80' : 'border-gray-200'} flex-shrink-0`}>
        <div className={`${textMuted} text-sm font-medium`}>Mock Interview</div>

        <div className={`${textMain} text-sm font-semibold`}>
          {roomState === STATE.LOADING ? '...' : `Question ${questionNumber} of ${totalQuestions}`}
        </div>

        <button
          onClick={handleEndEarly}
          disabled={isBlocked}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed
            ${isDark
              ? 'border-slate-700 text-slate-500 hover:border-slate-600 hover:text-slate-400'
              : 'border-gray-300 text-slate-500 hover:border-gray-400 hover:text-slate-600'
            }`}
        >
          <X size={12} />
          {endingEarly ? 'Ending...' : 'End Early'}
        </button>
      </div>

      {/* Center stage */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        {/* AI avatar */}
        <div
          className="w-20 h-20 rounded-full bg-gradient-to-br from-brand to-violet-500 flex items-center justify-center text-[32px] mb-6 transition-all duration-300"
          style={{ boxShadow: roomState === STATE.SPEAKING ? '0 0 0 6px rgba(99,102,241,0.18), 0 0 0 12px rgba(99,102,241,0.08)' : 'none' }}
        >
          🎙
        </div>

        {/* Status label */}
        <div className={`${textMuted} text-xs font-semibold uppercase tracking-widest mb-4`}>
          {statusLabel()}
        </div>

        {/* Current question text */}
        {roomState !== STATE.LOADING && (
          <div className={`max-w-xl text-center ${textMain} text-xl leading-relaxed font-light mb-10 min-h-[80px]`}>
            {currentQuestion}
          </div>
        )}

        {/* Dynamic bottom section */}
        <div className="flex flex-col items-center gap-4 w-full max-w-md">

          {roomState === STATE.LOADING && <Spinner isDark={isDark} />}

          {roomState === STATE.SPEAKING && <WaveformBars active={isSpeaking} isDark={isDark} />}

          {roomState === STATE.PROCESSING && (
            <div className="flex flex-col items-center gap-3">
              <Spinner isDark={isDark} />
              <div className={`${textMuted} text-sm`}>Thinking...</div>
            </div>
          )}

          {roomState === STATE.LISTENING && (
            <>
              {/* ── Voice mode ── */}
              {!useTextMode && (
                <>
                  {/* Mic permission blocked — step-by-step recovery */}
                  {micBlocked ? (
                    <div className={`w-full ${cardBg} border border-red-500/30 rounded-2xl px-6 py-7 flex flex-col items-center gap-5`}>
                      <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center flex-shrink-0">
                        <MicOff size={28} className="text-red-400" />
                      </div>

                      <div className="w-full space-y-3">
                        <p className="text-red-400 font-semibold text-sm text-center mb-1">Microphone access blocked</p>

                        {/* Step 1 */}
                        <div className={`flex items-start gap-3 ${isDark ? 'bg-slate-800/50' : 'bg-slate-100'} rounded-xl px-4 py-3`}>
                          <span className="text-brand font-bold text-sm mt-0.5 flex-shrink-0">1</span>
                          <p className={`text-xs ${textSub} leading-relaxed`}>
                            Click the <strong>🔒 lock icon</strong> in your browser address bar and set <strong>Microphone → Allow</strong>
                          </p>
                        </div>

                        {/* Step 2 */}
                        <div className={`flex items-start gap-3 ${isDark ? 'bg-slate-800/50' : 'bg-slate-100'} rounded-xl px-4 py-3`}>
                          <span className="text-brand font-bold text-sm mt-0.5 flex-shrink-0">2</span>
                          <p className={`text-xs ${textSub} leading-relaxed`}>
                            Click <strong>Try Again</strong> below. If it's still blocked, use the reload link to apply the new permission.
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-2 w-full">
                        <button
                          onClick={handleMicRetry}
                          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-brand hover:bg-brand-hover text-white text-sm font-semibold transition-colors"
                        >
                          <Mic size={14} /> Try Again
                        </button>
                        <button
                          onClick={() => setUseTextMode(true)}
                          className={`flex-1 py-2.5 rounded-lg border text-sm transition-colors
                            ${isDark ? 'border-slate-700 text-slate-400 hover:border-slate-600' : 'border-gray-300 text-slate-600 hover:border-gray-400'}`}
                        >
                          Type Instead
                        </button>
                      </div>
                      <button
                        onClick={() => window.location.reload()}
                        className={`text-xs ${textMuted} underline underline-offset-2 hover:opacity-70 transition-opacity`}
                      >
                        Still blocked? Reload the page
                      </button>
                    </div>
                  ) : checkingMic ? (
                    /* Checking mic — show spinner so user sees something is happening */
                    <div className="flex flex-col items-center gap-3">
                      <Spinner isDark={isDark} />
                      <div className={`${textMuted} text-sm`}>Checking microphone…</div>
                    </div>
                  ) : (
                    <>
                      {/* Big tap-to-record mic orb */}
                      <PulsingMic
                        active={isListening}
                        onClick={handleMicTap}
                        isDark={isDark}
                        label={isListening ? 'Recording — tap to stop' : 'Tap to start recording'}
                      />

                      {/* Live transcript box */}
                      <div className={`w-full min-h-[80px] ${cardBg} border ${isDark ? 'border-slate-700/60' : 'border-gray-300'} rounded-xl px-4 py-3.5`}>
                        {(transcript || interimTranscript) ? (
                          <p className={`${textSub} text-sm leading-relaxed italic m-0`}>
                            {transcript}
                            {interimTranscript && (
                              <span className={textMuted}>{transcript ? ' ' : ''}{interimTranscript}</span>
                            )}
                          </p>
                        ) : (
                          <p className={`${textMuted} text-sm italic m-0`}>
                            {isListening ? 'Listening… speak your answer' : 'Tap the mic above to start recording'}
                          </p>
                        )}
                      </div>

                      {/* Silence countdown bar */}
                      {isSilenceWindowActive && (
                        <div className="w-full">
                          <CountdownBar running={isSilenceWindowActive} silenceMs={3000} isDark={isDark} />
                          <div className={`${textMuted} text-xs text-center mt-1.5`}>
                            Auto-submitting in 3s… or click Submit now
                          </div>
                        </div>
                      )}

                      {/* Action row */}
                      <div className="flex items-center gap-2 w-full">
                        <button
                          onClick={handleReRecord}
                          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg border text-sm transition-colors
                            ${isDark
                              ? 'border-slate-700 text-slate-500 hover:border-slate-600 hover:text-slate-400'
                              : 'border-gray-300 text-slate-500 hover:border-gray-400 hover:text-slate-600'
                            }`}
                        >
                          <RefreshCw size={13} /> Re-record
                        </button>

                        <button
                          onClick={handleManualSubmit}
                          disabled={!hasAnswer}
                          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-brand hover:bg-brand-hover text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Send size={13} /> Submit Answer
                        </button>
                      </div>

                      {/* Switch to text mode */}
                      <button
                        onClick={() => { stopListening(); setUseTextMode(true) }}
                        className={`text-xs ${textMuted} underline underline-offset-2 hover:opacity-70 transition-opacity`}
                      >
                        Having mic issues? Type instead
                      </button>

                      {/* Non-permission mic error (transient — e.g. network hiccup) */}
                      {micError && !micBlocked && micError !== 'mic-not-allowed' && micError !== 'mic-service-not-allowed' && micError !== 'mic-not-found' && (
                        <div className="text-amber-400 text-xs text-center">{micError}</div>
                      )}
                    </>
                  )}
                </>
              )}

              {/* ── Text input mode ── */}
              {useTextMode && (
                <>
                  {/* No microphone hardware found (or macOS blocked it at OS level) */}
                  {noMicFound && (
                    <div className={`w-full flex items-start gap-2 text-xs ${isDark ? 'bg-slate-800/60 text-slate-300 border-slate-700/60' : 'bg-slate-100 text-slate-700 border-slate-300'} border rounded-lg px-3 py-2.5`}>
                      <span className="flex-shrink-0 mt-0.5">🎤</span>
                      <div className="space-y-1">
                        <span className="block">No microphone was detected. Text mode is active — your interview continues normally.</span>
                        <span className={`block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                          On Mac: <strong>System Settings → Privacy &amp; Security → Microphone</strong> and enable your browser. Then tap <strong>Use mic</strong>.
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Show why we fell back to text mode (e.g. incognito speech service block) */}
                  {!noMicFound && micError === 'mic-service-not-allowed' && (
                    <div className={`w-full flex items-start gap-2 text-xs ${isDark ? 'bg-amber-900/20 text-amber-300 border-amber-700/40' : 'bg-amber-50 text-amber-700 border-amber-200'} border rounded-lg px-3 py-2.5`}>
                      <span className="flex-shrink-0 mt-0.5">⚠️</span>
                      <span>Speech recognition is unavailable in this browser context (e.g. incognito mode). Text mode is active — your interview continues normally.</span>
                    </div>
                  )}
                  <textarea
                    className={`w-full min-h-[120px] ${cardBg} border ${border} rounded-xl px-4 py-3.5 text-sm leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-brand/50 ${textMain}`}
                    placeholder="Type your answer here…"
                    value={textAnswer}
                    onChange={e => setTextAnswer(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleTextSubmit()
                    }}
                    autoFocus
                  />

                  <div className="flex items-center gap-2 w-full">
                    {isSupported && (
                      <button
                        onClick={() => {
                          console.log('[MIC] Use mic button clicked')
                          setMicBlocked(false)
                          setNoMicFound(false)
                          setUseTextMode(false)
                          handleMicRetry()
                        }}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-lg border text-sm transition-colors
                          ${isDark
                            ? 'border-slate-700 text-slate-500 hover:border-slate-600 hover:text-slate-400'
                            : 'border-gray-300 text-slate-500 hover:border-gray-400 hover:text-slate-600'
                          }`}
                      >
                        <Mic size={13} /> Use mic
                      </button>
                    )}

                    <button
                      onClick={handleTextSubmit}
                      disabled={!textAnswer.trim()}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-brand hover:bg-brand-hover text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Send size={13} /> Submit Answer
                    </button>
                  </div>

                  <div className={`text-xs ${textMuted}`}>⌘ + Enter to submit</div>
                </>
              )}

              {!isSupported && (
                <div className="text-amber-500 text-xs text-center bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                  ⚠️ Speech recognition requires Google Chrome. Text mode is active.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
