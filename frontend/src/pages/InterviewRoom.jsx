import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Mic, MicOff, RefreshCw, X, ChevronDown, ChevronUp } from 'lucide-react'
import api from '../api/client'
import { useSpeechSynthesis } from '../hooks/useSpeechSynthesis'
import { useSpeechRecognition } from '../hooks/useSpeechRecognition'

// States the interview room can be in
const STATE = {
  LOADING: 'loading',
  SPEAKING: 'speaking',
  LISTENING: 'listening',
  PROCESSING: 'processing',
  DEBRIEF: 'debrief',
  ERROR: 'error',
}

// Animated waveform bars for speaking indicator
function WaveformBars({ active }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', height: '40px' }}>
      {[0.6, 1.0, 0.7, 1.0, 0.5, 0.9, 0.6].map((h, i) => (
        <div
          key={i}
          style={{
            width: '4px',
            borderRadius: '2px',
            background: active ? '#6366f1' : '#334155',
            height: `${h * 100}%`,
            animation: active ? `wave ${0.8 + i * 0.1}s ease-in-out infinite alternate` : 'none',
            animationDelay: `${i * 0.08}s`,
            transition: 'background 0.3s',
          }}
        />
      ))}
      <style>{`
        @keyframes wave {
          from { transform: scaleY(0.3); }
          to { transform: scaleY(1); }
        }
      `}</style>
    </div>
  )
}

// Countdown bar (fills over silenceMs)
function CountdownBar({ running, silenceMs = 2000 }) {
  const [progress, setProgress] = useState(0)
  const startRef = useRef(null)
  const rafRef = useRef(null)

  useEffect(() => {
    if (running) {
      startRef.current = Date.now()
      const tick = () => {
        const elapsed = Date.now() - startRef.current
        const p = Math.min(elapsed / silenceMs, 1)
        setProgress(p)
        if (p < 1) {
          rafRef.current = requestAnimationFrame(tick)
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    } else {
      setProgress(0)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [running, silenceMs])

  return (
    <div style={{ width: '100%', height: '3px', background: '#1e293b', borderRadius: '2px', overflow: 'hidden' }}>
      <div style={{
        height: '100%',
        width: `${progress * 100}%`,
        background: '#ef4444',
        borderRadius: '2px',
        transition: 'width 0.05s linear',
      }} />
    </div>
  )
}

// Pulsing mic indicator
function PulsingMic({ active }) {
  return (
    <div style={{ position: 'relative', width: '80px', height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {active && (
        <>
          <div style={{
            position: 'absolute',
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            background: '#ef444430',
            animation: 'pulse 1.5s ease-out infinite',
          }} />
          <div style={{
            position: 'absolute',
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: '#ef444420',
            animation: 'pulse 1.5s ease-out infinite 0.3s',
          }} />
        </>
      )}
      <div style={{
        width: '48px',
        height: '48px',
        borderRadius: '50%',
        background: active ? '#ef4444' : '#334155',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background 0.3s',
        position: 'relative',
        zIndex: 1,
      }}>
        {active ? <Mic size={22} color="#fff" /> : <MicOff size={22} color="#64748b" />}
      </div>
      <style>{`
        @keyframes pulse {
          0% { transform: scale(0.8); opacity: 1; }
          100% { transform: scale(1.5); opacity: 0; }
        }
      `}</style>
    </div>
  )
}

// Spinner
function Spinner() {
  return (
    <div style={{
      width: '32px',
      height: '32px',
      border: '3px solid #334155',
      borderTop: '3px solid #6366f1',
      borderRadius: '50%',
      animation: 'spin 0.8s linear infinite',
    }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

export default function InterviewRoom() {
  const { sessionId } = useParams()
  const navigate = useNavigate()

  const [roomState, setRoomState] = useState(STATE.LOADING)
  const [session, setSession] = useState(null)
  const [currentQuestion, setCurrentQuestion] = useState('')
  const [questionNumber, setQuestionNumber] = useState(1)
  const [totalQuestions, setTotalQuestions] = useState(10)
  const [debrief, setDebrief] = useState(null)
  const [showTranscript, setShowTranscript] = useState(false)
  const [errorMsg, setErrorMsg] = useState(null)
  const [isSilent, setIsSilent] = useState(false) // true after speech stops, waiting for submit
  const [endingEarly, setEndingEarly] = useState(false)

  const { speak, stop: stopSpeaking, isSpeaking } = useSpeechSynthesis()

  const handleFinalTranscript = useCallback(async (text) => {
    setIsSilent(false)
    setRoomState(STATE.PROCESSING)

    try {
      const res = await api.post(`/api/interview/${sessionId}/respond`, { answer: text })
      const data = res.data

      if (data.is_final) {
        // Speak closing line then show debrief
        setCurrentQuestion(data.closing || "That concludes our interview.")
        setRoomState(STATE.SPEAKING)
        speak(data.closing || "That concludes our interview.", {
          onEnd: () => {
            setDebrief(data.debrief)
            setRoomState(STATE.DEBRIEF)
          }
        })
      } else {
        setCurrentQuestion(data.question)
        setQuestionNumber(data.question_number)
        setRoomState(STATE.SPEAKING)
        speak(data.question, {
          onEnd: () => {
            setTimeout(() => {
              setRoomState(STATE.LISTENING)
              startListening()
            }, 600)
          }
        })
      }
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Failed to submit answer.'
      setErrorMsg(msg)
      setRoomState(STATE.ERROR)
    }
  }, [sessionId, speak])

  const {
    isListening,
    transcript,
    interimTranscript,
    error: micError,
    isSupported,
    startListening,
    stopListening,
    reset: resetRecognition,
  } = useSpeechRecognition({
    onFinalTranscript: handleFinalTranscript,
    silenceSeconds: 2,
  })

  // Detect when speech has been captured and we're waiting 2s to auto-submit
  useEffect(() => {
    if (isListening && transcript.length > 0) {
      setIsSilent(true)
    } else {
      setIsSilent(false)
    }
  }, [isListening, transcript])

  // Reset isSilent when new listening starts fresh
  useEffect(() => {
    if (!isListening) setIsSilent(false)
  }, [isListening])

  // On mount: load session and speak first question
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
          const lastQ = (data.conversation || []).findLast ?
            data.conversation.findLast(m => m.role === 'assistant') :
            [...(data.conversation || [])].reverse().find(m => m.role === 'assistant')
          setCurrentQuestion(lastQ?.content || '')
          setRoomState(STATE.DEBRIEF)
          return
        }

        // Get the first question from conversation
        const firstMsg = (data.conversation || [])[0]
        if (firstMsg && firstMsg.role === 'assistant') {
          setCurrentQuestion(firstMsg.content)
          setRoomState(STATE.SPEAKING)
          speak(firstMsg.content, {
            onEnd: () => {
              setTimeout(() => {
                setRoomState(STATE.LISTENING)
                startListening()
              }, 600)
            }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  const handleReRecord = () => {
    stopSpeaking()
    resetRecognition()
    setIsSilent(false)
    setRoomState(STATE.LISTENING)
    startListening()
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
      case STATE.LOADING: return 'Loading session...'
      case STATE.SPEAKING: return 'Interviewer is speaking...'
      case STATE.LISTENING: return 'Your turn to answer...'
      case STATE.PROCESSING: return 'Processing your answer...'
      case STATE.DEBRIEF: return 'Interview Complete'
      case STATE.ERROR: return 'Something went wrong'
      default: return ''
    }
  }

  // Format debrief text preserving line breaks
  const formatDebrief = (text) => {
    if (!text) return null
    return text.split('\n').map((line, i) => (
      <p key={i} style={{ margin: '0 0 10px', lineHeight: '1.7', color: line.trim() === '' ? 'transparent' : '#cbd5e1' }}>
        {line || ' '}
      </p>
    ))
  }

  // Debrief state — full page takeover
  if (roomState === STATE.DEBRIEF) {
    const conversation = session?.conversation || []
    const qaPairs = []
    for (let i = 0; i < conversation.length - 1; i++) {
      if (conversation[i].role === 'assistant' && conversation[i + 1]?.role === 'user') {
        qaPairs.push({ q: conversation[i].content, a: conversation[i + 1].content })
      }
    }

    return (
      <div style={{ minHeight: '100vh', background: '#0f1117', padding: '40px 24px', boxSizing: 'border-box' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '40px' }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #10b981, #6366f1)',
              margin: '0 auto 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '28px',
            }}>
              ✓
            </div>
            <h1 style={{ fontSize: '28px', fontWeight: '700', color: '#e2e8f0', marginBottom: '8px' }}>
              Interview Complete
            </h1>
            <p style={{ color: '#64748b', fontSize: '15px' }}>
              Here is your personalized feedback
            </p>
          </div>

          {/* Debrief card */}
          <div style={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '12px',
            padding: '28px',
            marginBottom: '24px',
          }}>
            <h2 style={{ fontSize: '15px', fontWeight: '600', color: '#94a3b8', marginBottom: '20px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Feedback
            </h2>
            <div style={{ fontSize: '14px' }}>
              {formatDebrief(debrief)}
            </div>
          </div>

          {/* Transcript toggle */}
          <div style={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '12px',
            marginBottom: '24px',
            overflow: 'hidden',
          }}>
            <button
              onClick={() => setShowTranscript(t => !t)}
              style={{
                width: '100%',
                padding: '16px 20px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span style={{ color: '#94a3b8', fontSize: '14px', fontWeight: '600' }}>
                View Full Transcript ({qaPairs.length} Q&A pairs)
              </span>
              {showTranscript ? <ChevronUp size={16} color="#64748b" /> : <ChevronDown size={16} color="#64748b" />}
            </button>

            {showTranscript && (
              <div style={{ padding: '0 20px 20px', borderTop: '1px solid #334155' }}>
                {qaPairs.map((pair, i) => (
                  <div key={i} style={{ marginTop: '20px' }}>
                    <div style={{
                      color: '#a5b4fc',
                      fontSize: '12px',
                      fontWeight: '600',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      marginBottom: '6px',
                    }}>
                      Q{i + 1}
                    </div>
                    <p style={{ color: '#e2e8f0', fontSize: '14px', margin: '0 0 8px', lineHeight: '1.6' }}>
                      {pair.q}
                    </p>
                    <div style={{
                      color: '#10b981',
                      fontSize: '12px',
                      fontWeight: '600',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      marginBottom: '6px',
                    }}>
                      Your Answer
                    </div>
                    <p style={{ color: '#94a3b8', fontSize: '14px', margin: 0, lineHeight: '1.6' }}>
                      {pair.a}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={() => navigate('/interview')}
            style={{
              width: '100%',
              padding: '14px',
              borderRadius: '10px',
              border: 'none',
              background: '#6366f1',
              color: '#fff',
              fontSize: '15px',
              fontWeight: '600',
              cursor: 'pointer',
            }}
          >
            Start New Interview
          </button>
        </div>
      </div>
    )
  }

  // Error state
  if (roomState === STATE.ERROR) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#0f1117',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}>
        <div style={{ color: '#ef4444', fontSize: '18px', marginBottom: '12px' }}>Something went wrong</div>
        <div style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '24px', textAlign: 'center', maxWidth: '400px' }}>
          {errorMsg || micError || 'Unknown error'}
        </div>
        <button
          onClick={() => navigate('/interview')}
          style={{
            padding: '10px 24px',
            borderRadius: '8px',
            border: 'none',
            background: '#6366f1',
            color: '#fff',
            fontSize: '14px',
            cursor: 'pointer',
          }}
        >
          Back to Interview Setup
        </button>
      </div>
    )
  }

  // Main interview UI
  return (
    <div style={{
      minHeight: '100vh',
      background: '#0f1117',
      display: 'flex',
      flexDirection: 'column',
      padding: '0',
      margin: '-24px',
      boxSizing: 'border-box',
    }}>
      {/* Top bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 24px',
        borderBottom: '1px solid #1e293b',
        flexShrink: 0,
      }}>
        <div style={{ color: '#94a3b8', fontSize: '14px', fontWeight: '500' }}>
          Mock Interview
        </div>
        <div style={{ color: '#e2e8f0', fontSize: '14px', fontWeight: '600' }}>
          {roomState === STATE.LOADING ? '...' : `Question ${questionNumber} of ${totalQuestions}`}
        </div>
        <button
          onClick={handleEndEarly}
          disabled={endingEarly || roomState === STATE.LOADING || roomState === STATE.PROCESSING}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            borderRadius: '6px',
            border: '1px solid #334155',
            background: 'transparent',
            color: '#94a3b8',
            fontSize: '12px',
            cursor: (endingEarly || roomState === STATE.LOADING || roomState === STATE.PROCESSING) ? 'not-allowed' : 'pointer',
            opacity: (endingEarly || roomState === STATE.LOADING) ? 0.5 : 1,
          }}
        >
          <X size={12} />
          {endingEarly ? 'Ending...' : 'End Early'}
        </button>
      </div>

      {/* Main content */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 24px',
      }}>
        {/* AI avatar */}
        <div style={{
          width: '80px',
          height: '80px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '32px',
          boxShadow: roomState === STATE.SPEAKING ? '0 0 0 4px #6366f130, 0 0 0 8px #6366f115' : 'none',
          transition: 'box-shadow 0.3s',
        }}>
          🎙
        </div>

        {/* Status label */}
        <div style={{
          color: '#64748b',
          fontSize: '13px',
          fontWeight: '500',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          marginBottom: '16px',
        }}>
          {statusLabel()}
        </div>

        {/* Current question */}
        {roomState !== STATE.LOADING && (
          <div style={{
            maxWidth: '600px',
            textAlign: 'center',
            color: '#e2e8f0',
            fontSize: '20px',
            lineHeight: '1.6',
            fontWeight: '400',
            marginBottom: '40px',
            minHeight: '80px',
          }}>
            {currentQuestion}
          </div>
        )}

        {/* Dynamic bottom section */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', width: '100%', maxWidth: '480px' }}>
          {roomState === STATE.LOADING && <Spinner />}

          {roomState === STATE.SPEAKING && (
            <WaveformBars active={isSpeaking} />
          )}

          {roomState === STATE.PROCESSING && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
              <Spinner />
              <div style={{ color: '#64748b', fontSize: '13px' }}>Thinking...</div>
            </div>
          )}

          {roomState === STATE.LISTENING && (
            <>
              <PulsingMic active={isListening} />

              {/* Live transcript box */}
              <div style={{
                width: '100%',
                minHeight: '80px',
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '10px',
                padding: '14px 16px',
                boxSizing: 'border-box',
              }}>
                {(transcript || interimTranscript) ? (
                  <p style={{ margin: 0, color: '#94a3b8', fontSize: '14px', lineHeight: '1.6', fontStyle: 'italic' }}>
                    {transcript}
                    {interimTranscript && (
                      <span style={{ color: '#475569' }}>{transcript ? ' ' : ''}{interimTranscript}</span>
                    )}
                  </p>
                ) : (
                  <p style={{ margin: 0, color: '#475569', fontSize: '14px', fontStyle: 'italic' }}>
                    Listening... speak your answer
                  </p>
                )}
              </div>

              {/* Countdown bar */}
              {isSilent && transcript.length > 0 && (
                <div style={{ width: '100%' }}>
                  <CountdownBar running={isSilent} silenceMs={2000} />
                  <div style={{ color: '#64748b', fontSize: '12px', textAlign: 'center', marginTop: '6px' }}>
                    Submitting in 2s...
                  </div>
                </div>
              )}

              {/* Re-record button */}
              <button
                onClick={handleReRecord}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: '1px solid #334155',
                  background: 'transparent',
                  color: '#94a3b8',
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                <RefreshCw size={13} />
                Re-record
              </button>

              {micError && (
                <div style={{ color: '#ef4444', fontSize: '12px', textAlign: 'center' }}>
                  {micError}
                </div>
              )}

              {!isSupported && (
                <div style={{ color: '#f59e0b', fontSize: '12px', textAlign: 'center' }}>
                  Speech recognition not supported. Please use Chrome.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
