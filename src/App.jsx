/**
 * Nousad Meet — Noush Meet-style video conferencing
 * Light theme matching Google's exact design language.
 *
 * Bugs fixed vs previous version:
 *  1. Chat duplication — sender no longer adds message locally;
 *     server echoes back to ALL including sender via room:message_received.
 *  2. Participant count — now derived from React state, not DOM children.
 *
 * Dependencies:  react-router-dom  socket.io-client  react-icons
 */

import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from 'react-router-dom'
import { useEffect, useRef, useState, useCallback } from 'react'
import { io } from 'socket.io-client'
import {
  FiMic, FiMicOff, FiVideo, FiVideoOff, FiMonitor, FiPhoneOff,
  FiMessageSquare, FiUsers, FiCopy, FiCheck, FiLogOut,
  FiSend, FiX, FiPlus, FiVideo as FiVideoIcon,
} from 'react-icons/fi'
import { MdScreenShare, MdStopScreenShare, MdOutlinePeopleAlt } from 'react-icons/md'

// ─────────────────────────────────────────────────────────────────────────────
//  CONFIG
// ─────────────────────────────────────────────────────────────────────────────
const SERVER = import.meta.env.VITE_APP_BASE_URL

const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
}

// ─────────────────────────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  '#1a73e8','#34a853','#fbbc04','#ea4335',
  '#9c27b0','#00bcd4','#ff5722','#607d8b',
]
const avatarColor  = name => AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length]
const initials     = name => name.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2)
const genRoomId    = () => [3,4,3].map(n => Math.random().toString(36).slice(2, 2+n)).join('-')
const fmtTime      = s  => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`

// ─────────────────────────────────────────────────────────────────────────────
//  GLOBAL CSS  (Noush Meet's exact palette + typography)
// ─────────────────────────────────────────────────────────────────────────────
const INJECT_ID = 'gm-meet-styles'
if (!document.getElementById(INJECT_ID)) {
  const s = document.createElement('style')
  s.id = INJECT_ID
  s.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;600;700&family=Roboto:wght@300;400;500&display=swap');

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      /* Google's exact Meet palette */
      --gm-bg:          #202124;   /* room background */
      --gm-surface:     #3c4043;   /* tile background  */
      --gm-topbar:      #202124;
      --gm-bar:         #202124;
      --gm-tile-border: rgba(255,255,255,0.08);

      /* Lobby (light) */
      --lb-bg:          #ffffff;
      --lb-surface:     #f8f9fa;
      --lb-border:      #e0e0e0;
      --lb-text:        #202124;
      --lb-muted:       #5f6368;
      --lb-accent:      #1a73e8;
      --lb-accent-h:    #1557b0;
      --lb-red:         #d93025;
      --lb-green:       #188038;

      /* Panel (light, opens in room) */
      --pn-bg:          #ffffff;
      --pn-border:      #e0e0e0;
      --pn-text:        #202124;
      --pn-muted:       #5f6368;
      --pn-bubble-me:   #e8f0fe;
      --pn-bubble-txt:  #1a73e8;

      --font-sans: 'Google Sans', 'Roboto', sans-serif;
      --font-body: 'Roboto', sans-serif;
    }

    body { background: var(--lb-bg); font-family: var(--font-body); }
    *::-webkit-scrollbar { width: 4px; }
    *::-webkit-scrollbar-thumb { background: #dadce0; border-radius: 99px; }

    /* ── ANIMATIONS ───────────────────────────────── */
    @keyframes gmFadeUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
    @keyframes gmPop    { 0%{transform:scale(.94);opacity:0} 100%{transform:scale(1);opacity:1} }
    .gm-fade-up { animation: gmFadeUp .35s cubic-bezier(.4,0,.2,1) both; }
    .gm-pop     { animation: gmPop    .2s  cubic-bezier(.4,0,.2,1) both; }

    /* ── LOBBY CARD ───────────────────────────────── */
    .gm-card {
      background: var(--lb-bg);
      border: 1px solid var(--lb-border);
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0,0,0,.08), 0 4px 16px rgba(0,0,0,.04);
    }

    /* ── FIELD ────────────────────────────────────── */
    .gm-field { display:flex; flex-direction:column; gap:4px; }
    .gm-label {
      font-size: 11px; font-weight: 500; color: var(--lb-muted);
      text-transform: uppercase; letter-spacing: .08em;
    }
    .gm-input {
      padding: 10px 14px; border: 1.5px solid var(--lb-border);
      border-radius: 8px; font-family: var(--font-body); font-size: 14px;
      color: var(--lb-text); background: #fff; outline: none; transition: border .15s;
    }
    .gm-input:focus { border-color: var(--lb-accent); }
    .gm-input::placeholder { color: #bdc1c6; }

    /* ── BUTTONS ──────────────────────────────────── */
    .gm-btn-primary {
      display: flex; align-items: center; justify-content: center; gap: 8px;
      padding: 10px 24px; border-radius: 24px; border: none; cursor: pointer;
      background: var(--lb-accent); color: #fff;
      font-family: var(--font-sans); font-size: 14px; font-weight: 500;
      transition: background .15s, box-shadow .15s;
      box-shadow: 0 1px 3px rgba(26,115,232,.35);
    }
    .gm-btn-primary:hover { background: var(--lb-accent-h); box-shadow: 0 2px 6px rgba(26,115,232,.45); }

    .gm-btn-outline {
      display: flex; align-items: center; justify-content: center; gap: 8px;
      padding: 10px 24px; border-radius: 24px; border: 1.5px solid var(--lb-border); cursor: pointer;
      background: transparent; color: var(--lb-accent);
      font-family: var(--font-sans); font-size: 14px; font-weight: 500;
      transition: background .15s, border .15s;
    }
    .gm-btn-outline:hover { background: #e8f0fe; border-color: var(--lb-accent); }

    .gm-tab {
      padding: 8px 20px; border-radius: 8px; border: none; cursor: pointer;
      font-family: var(--font-sans); font-size: 13px; font-weight: 500;
      background: none; color: var(--lb-muted); transition: all .15s;
    }
    .gm-tab.active { background: #e8f0fe; color: var(--lb-accent); }

    /* ── PREVIEW VIDEO ────────────────────────────── */
    .gm-preview-wrap {
      position: relative; border-radius: 12px; overflow: hidden;
      background: #202124; aspect-ratio: 16/9;
      box-shadow: 0 2px 8px rgba(0,0,0,.14);
    }
    .gm-preview-wrap video {
      width:100%; height:100%; object-fit:cover; display:block; transform:scaleX(-1);
    }

    /* ── PREVIEW CTRL BTNS (lobby) ────────────────── */
    .gm-pre-btn {
      width: 44px; height: 44px; border-radius: 50%; border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      font-size: 18px; transition: background .15s, transform .1s;
      background: #f1f3f4; color: #3c4043;
    }
    .gm-pre-btn:hover { background: #e8eaed; transform: scale(1.05); }
    .gm-pre-btn.off   { background: #fce8e6; color: var(--lb-red); }

    /* ── ROOM CTRL BTNS ───────────────────────────── */
    .gm-ctrl {
      width: 52px; height: 52px; border-radius: 50%; border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      background: #3c4043; color: #e8eaed;
      transition: background .15s, transform .12s;
    }
    .gm-ctrl:hover  { background: #4a4d51; transform: scale(1.06); }
    .gm-ctrl.off    { background: #f28b82; color: #fff; }
    .gm-ctrl.active { background: #8ab4f8; color: #202124; }
    .gm-ctrl.leave  { background: #f28b82; color: #fff; }
    .gm-ctrl.leave:hover { background: #ee675c; }
    .gm-ctrl-label  { font-size: 11px; color: #9aa0a6; margin-top: 4px; font-family: var(--font-body); user-select:none; }

    /* ── ROOM CODE PILL ───────────────────────────── */
    .gm-pill {
      display: flex; align-items: center; gap: 6px;
      padding: 6px 14px; border-radius: 99px; cursor: pointer;
      background: #3c4043; border: none;
      font-family: var(--font-sans); font-size: 12px; font-weight: 500; color: #e8eaed;
      transition: background .15s;
    }
    .gm-pill:hover { background: #4a4d51; }

    /* ── VIDEO TILES ──────────────────────────────── */
    .gm-tile {
      position: relative; border-radius: 12px; overflow: hidden;
      background: #3c4043; border: 1.5px solid transparent;
      aspect-ratio: 16/9;
    }
    .gm-tile video { width:100%; height:100%; object-fit:cover; display:block; }
    .gm-tile.speaking { border-color: #8ab4f8; }

    .gm-tile-label {
      position: absolute; bottom: 10px; left: 12px;
      background: rgba(0,0,0,.6); backdrop-filter: blur(8px);
      padding: 3px 10px; border-radius: 4px;
      font-size: 12px; font-weight: 500; color: #fff; font-family: var(--font-body);
    }
    .gm-tile-muted {
      position: absolute; bottom: 10px; right: 12px;
      background: rgba(242,139,130,.85);
      width: 28px; height: 28px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
    }

    /* ── VIDEO GRID LAYOUTS ───────────────────────── */
    .gm-grid   { display:grid; gap:8px; width:100%; height:100%; }
    .gm-grid-1 { grid-template-columns: 1fr; }
    .gm-grid-2 { grid-template-columns: 1fr 1fr; }
    .gm-grid-3 { grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; }
    .gm-grid-4 { grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; }
    .gm-grid-n { grid-template-columns: repeat(3,1fr); }

    /* ── SIDE PANEL ───────────────────────────────── */
    .gm-panel {
      position: absolute; top: 60px; right: 0; bottom: 80px;
      width: 340px; z-index: 30;
      background: var(--pn-bg);
      border-left: 1px solid var(--pn-border);
      display: flex; flex-direction: column;
      box-shadow: -2px 0 8px rgba(0,0,0,.12);
      animation: gmPop .18s ease;
    }
    .gm-panel-head {
      padding: 14px 18px; border-bottom: 1px solid var(--pn-border);
      display: flex; align-items: center; justify-content: space-between;
    }
    .gm-panel-title {
      font-family: var(--font-sans); font-size: 15px; font-weight: 600;
      color: var(--pn-text);
    }
    .gm-icon-btn {
      background: none; border: none; cursor: pointer; color: var(--pn-muted);
      padding: 4px; border-radius: 50%; display:flex; transition: background .14s;
    }
    .gm-icon-btn:hover { background: #f1f3f4; }

    /* ── CHAT BUBBLES ─────────────────────────────── */
    .gm-bubble-me {
      align-self: flex-end; max-width: 78%;
      background: var(--pn-bubble-me); color: var(--pn-text);
      border-radius: 18px 18px 4px 18px; padding: 8px 14px;
      font-size: 13px; line-height: 1.55; font-family: var(--font-body);
    }
    .gm-bubble-them {
      align-self: flex-start; max-width: 78%;
      background: #f1f3f4; color: var(--pn-text);
      border-radius: 18px 18px 18px 4px; padding: 8px 14px;
      font-size: 13px; line-height: 1.55; font-family: var(--font-body);
    }
    .gm-chat-meta { font-size: 10px; color: var(--pn-muted); margin-top: 2px; font-family: var(--font-body); }

    /* ── PARTICIPANT ITEM ─────────────────────────── */
    .gm-p-item {
      display: flex; align-items: center; gap: 12px;
      padding: 10px 18px; transition: background .13s;
    }
    .gm-p-item:hover { background: #f8f9fa; }
    .gm-avatar {
      width: 38px; height: 38px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-family: var(--font-sans); font-size: 14px; font-weight: 600;
      color: #fff; flex-shrink: 0;
    }

    /* ── TOAST ────────────────────────────────────── */
    .gm-toast {
      position: fixed; bottom: 90px; left: 50%;
      transform: translateX(-50%) translateY(10px);
      background: #3c4043; color: #e8eaed;
      padding: 10px 20px; border-radius: 8px;
      font-size: 13px; font-family: var(--font-body);
      opacity: 0; pointer-events: none; z-index: 9999;
      transition: all .25s ease; white-space: nowrap;
      box-shadow: 0 2px 8px rgba(0,0,0,.25);
    }
    .gm-toast.show { opacity:1; transform:translateX(-50%) translateY(0); }

    /* ── SCREEN SHARE BADGE ───────────────────────── */
    .gm-share-badge {
      position: absolute; top: 68px; left: 50%; transform: translateX(-50%);
      display: flex; align-items: center; gap: 8px;
      background: rgba(138,180,248,.15); border: 1.5px solid rgba(138,180,248,.5);
      border-radius: 99px; padding: 5px 16px; color: #8ab4f8;
      font-size: 12px; font-family: var(--font-body); z-index: 15;
    }
  `
  document.head.appendChild(s)
}

// ─────────────────────────────────────────────────────────────────────────────
//  TOAST  (imperative, avoids re-render cost)
// ─────────────────────────────────────────────────────────────────────────────
let _toastTimer = null
function toast(msg) {
  let el = document.getElementById('gm-toast-el')
  if (!el) {
    el = document.createElement('div')
    el.id = 'gm-toast-el'
    el.className = 'gm-toast'
    document.body.appendChild(el)
  }
  el.textContent = msg
  el.classList.add('show')
  clearTimeout(_toastTimer)
  _toastTimer = setTimeout(() => el.classList.remove('show'), 2800)
}

// ─────────────────────────────────────────────────────────────────────────────
//  PROTECTED ROUTE
// ─────────────────────────────────────────────────────────────────────────────
const ProtectedRoute = ({ children }) =>
  localStorage.getItem('token') ? children : <Navigate to="/login" replace />

// ─────────────────────────────────────────────────────────────────────────────
//  LOBBY  (light theme, Noush Meet exact)
// ─────────────────────────────────────────────────────────────────────────────
function Lobby() {
  const [tab,      setTab]      = useState('new')
  const [nameNew,  setNameNew]  = useState('')
  const [nameJoin, setNameJoin] = useState('')
  const [code,     setCode]     = useState('')
  const [pMic,     setPMic]     = useState(true)
  const [pCam,     setPCam]     = useState(true)
  const previewRef = useRef()
  const streamRef  = useRef(null)

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(s => { streamRef.current = s; if (previewRef.current) previewRef.current.srcObject = s })
      .catch(() => {})
    return () => streamRef.current?.getTracks().forEach(t => t.stop())
  }, [])

  const togglePMic = () => { setPMic(v => { streamRef.current?.getAudioTracks().forEach(t => t.enabled = !v); return !v }) }
  const togglePCam = () => { setPCam(v => { streamRef.current?.getVideoTracks().forEach(t => t.enabled = !v); return !v }) }

  const enter = (name, roomId) => {
    if (!name.trim()) return toast('Please enter your name')
    streamRef.current?.getTracks().forEach(t => t.stop())
    localStorage.setItem('token', 'gm-demo')
    localStorage.setItem('gm-name', name.trim())
    window.location.href = `/room/${roomId}`
  }

  return (
    <div style={{ minHeight:'100vh', background:'#fff', display:'flex', flexDirection:'column' }}>

      {/* Noush Meet header */}
      <header style={{ height:64, borderBottom:'1px solid #e0e0e0', display:'flex', alignItems:'center', padding:'0 24px', gap:12 }}>
        {/* Noush Meet wordmark colours */}
        <svg width="28" height="28" viewBox="0 0 48 48">
          <path fill="#00832d" d="M29 23.5L34 29v-9.5L29 23.5z"/>
          <path fill="#0066da" d="M4 31.5v5C4 37.88 5.12 39 6.5 39h5L13 34l-2.5-2.5L4 31.5z"/>
          <path fill="#e94235" d="M11.5 9L4 9v5l6.5 7.5L4 16.5v15l6.5-.5L13 29V19l-1.5-4.5V9z"/>
          <path fill="#2684fc" d="M34 9.5V19l5 4.5V14l-3-4.5H34z"/>
          <path fill="#00832d" d="M13 29l-2.5 2.5.5 7.5h18l2-5-2-5H13z"/>
          <path fill="#ffba00" d="M34 19L13 19v10h21V19z"/>
          <path fill="#2684fc" d="M29 9H11.5v9.5L13 19h16V9.5L29 9z"/>
        </svg>
        <span style={{ fontFamily:'Google Sans, sans-serif', fontSize:20, fontWeight:600, color:'#3c4043', letterSpacing:'-0.01em' }}>Meet</span>
        <span style={{ fontSize:11, color:'#80868b', fontFamily:'Roboto,sans-serif', marginTop:2, marginLeft:2 }}>by Nousad</span>
      </header>

      {/* Body */}
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:'40px 24px' }}>
        <div style={{ width:'100%', maxWidth:860 }} className="gm-fade-up">

          {/* Headline */}
          <div style={{ textAlign:'center', marginBottom:48 }}>
            <h1 style={{ fontFamily:'Google Sans, sans-serif', fontSize:40, fontWeight:600, color:'#202124', lineHeight:1.15, marginBottom:12 }}>
              Video calls and meetings<br/>for everyone
            </h1>
            <p style={{ fontFamily:'Roboto, sans-serif', fontSize:16, color:'#5f6368' }}>
              Connect, collaborate, and celebrate from anywhere
            </p>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:40, alignItems:'start' }}>

            {/* Camera preview */}
            <div>
              <div className="gm-preview-wrap">
                <video ref={previewRef} autoPlay muted playsInline />
                {!pCam && (
                  <div style={{ position:'absolute', inset:0, background:'#202124', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:10 }}>
                    <div style={{ width:64, height:64, borderRadius:'50%', background:'#3c4043', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      <FiVideoOff size={28} color="#9aa0a6" />
                    </div>
                    <p style={{ color:'#9aa0a6', fontSize:13, fontFamily:'Roboto,sans-serif' }}>Camera is off</p>
                  </div>
                )}
              </div>
              <div style={{ display:'flex', justifyContent:'center', gap:12, marginTop:14 }}>
                <button className={`gm-pre-btn ${pMic ? '' : 'off'}`} onClick={togglePMic} title={pMic ? 'Mute mic' : 'Unmute mic'}>
                  {pMic ? <FiMic size={18} /> : <FiMicOff size={18} />}
                </button>
                <button className={`gm-pre-btn ${pCam ? '' : 'off'}`} onClick={togglePCam} title={pCam ? 'Stop camera' : 'Start camera'}>
                  {pCam ? <FiVideo size={18} /> : <FiVideoOff size={18} />}
                </button>
              </div>
            </div>

            {/* Form card */}
            <div className="gm-card" style={{ padding:28, display:'flex', flexDirection:'column', gap:22 }}>
              <div style={{ display:'flex', gap:6 }}>
                <button className={`gm-tab ${tab==='new'?'active':''}`} onClick={() => setTab('new')}>New meeting</button>
                <button className={`gm-tab ${tab==='join'?'active':''}`} onClick={() => setTab('join')}>Join with a code</button>
              </div>

              {tab === 'new' ? (
                <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                  <div className="gm-field">
                    <label className="gm-label">Your name</label>
                    <input className="gm-input" placeholder="Enter your name" value={nameNew} onChange={e => setNameNew(e.target.value)}
                      onKeyDown={e => e.key==='Enter' && enter(nameNew, genRoomId())} />
                  </div>
                  <button className="gm-btn-primary" onClick={() => enter(nameNew, genRoomId())}>
                    <FiVideoIcon size={16} /> Start a new meeting
                  </button>
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                  <div className="gm-field">
                    <label className="gm-label">Your name</label>
                    <input className="gm-input" placeholder="Enter your name" value={nameJoin} onChange={e => setNameJoin(e.target.value)} />
                  </div>
                  <div className="gm-field">
                    <label className="gm-label">Meeting code</label>
                    <input className="gm-input" placeholder="e.g. abc-defg-hij" value={code} onChange={e => setCode(e.target.value)}
                      onKeyDown={e => e.key==='Enter' && code.trim() && enter(nameJoin, code.trim())} />
                  </div>
                  <button className="gm-btn-primary" onClick={() => { if (code.trim()) enter(nameJoin, code.trim()); else toast('Enter a meeting code') }}>
                    Join meeting
                  </button>
                </div>
              )}

              <p style={{ textAlign:'center', fontSize:12, color:'#80868b', fontFamily:'Roboto,sans-serif', lineHeight:1.5 }}>
                <a href="#" style={{ color:'#1a73e8', textDecoration:'none' }}>Learn more</a> about Noush Meet
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  ROOM  (dark Noush Meet in-call UI)
// ─────────────────────────────────────────────────────────────────────────────
function Room() {
  const { id: roomId } = useParams()
  const myName = localStorage.getItem('gm-name') || 'You'

  // refs
  const socketRef       = useRef(null)
  const localStreamRef  = useRef(null)
  const screenStreamRef = useRef(null)
  const peersRef        = useRef({})        // { socketId: RTCPeerConnection }
  const gridRef         = useRef()
  const chatEndRef      = useRef()

  // state
  const [micOn,        setMicOn]        = useState(true)
  const [camOn,        setCamOn]        = useState(true)
  const [sharing,      setSharing]      = useState(false)
  const [chatOpen,     setChatOpen]     = useState(false)
  const [peopleOpen,   setPeopleOpen]   = useState(false)

  /**
   * participants: { [socketId]: { id, name } }
   * This is the single source of truth for participant count.
   * Fixes the "wrong count" bug — we never count DOM nodes.
   */
  const [participants, setParticipants] = useState({})

  /**
   * messages: { id, senderName, message, timestamp, mine }[]
   * BUG FIX: sender does NOT push locally anymore.
   * Server echoes room:message_received back to ALL sockets (including sender).
   * This eliminates the double-message on the sender's screen.
   */
  const [messages,     setMessages]     = useState([])
  const [chatInput,    setChatInput]    = useState('')
  const [copied,       setCopied]       = useState(false)
  const [elapsed,      setElapsed]      = useState(0)

  // ── TIMER ──────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setElapsed(e => e + 1), 1000)
    return () => clearInterval(t)
  }, [])

  // ── GRID CLASS ────────────────────────────────────
  const refreshGrid = useCallback(() => {
    if (!gridRef.current) return
    const n = gridRef.current.children.length
    gridRef.current.className =
      n <= 1 ? 'gm-grid gm-grid-1' :
      n === 2 ? 'gm-grid gm-grid-2' :
      n <= 4  ? `gm-grid gm-grid-${n}` :
               'gm-grid gm-grid-n'
  }, [])

  // ── LOCAL TILE ────────────────────────────────────
  const addLocalTile = useCallback(stream => {
    if (!gridRef.current || document.getElementById('tile-local')) return
    const tile = makeTile('tile-local', stream, myName, true)
    gridRef.current.appendChild(tile)
    refreshGrid()
  }, [myName, refreshGrid])

  // ── REMOTE TILE ───────────────────────────────────
  const addRemoteTile = useCallback((uid, stream, name) => {
    if (!gridRef.current || document.getElementById('tile-' + uid)) return
    const tile = makeTile('tile-' + uid, stream, name || 'Participant', false)
    gridRef.current.appendChild(tile)
    refreshGrid()
  }, [refreshGrid])

  const removeTile = useCallback(uid => {
    document.getElementById('tile-' + uid)?.remove()
    refreshGrid()
  }, [refreshGrid])

  // ── CREATE PEER ───────────────────────────────────
  const createPeer = useCallback((uid, stream, remoteName) => {
    if (peersRef.current[uid]) return peersRef.current[uid]
    const pc = new RTCPeerConnection(ICE_CONFIG)
    peersRef.current[uid] = pc

    stream.getTracks().forEach(t => pc.addTrack(t, stream))

    pc.ontrack = ({ streams: [s] }) => addRemoteTile(uid, s, remoteName)

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) socketRef.current?.emit('webrtc:ice', { to: uid, candidate })
    }

    pc.onconnectionstatechange = () => {
      if (['disconnected','failed','closed'].includes(pc.connectionState)) {
        removeTile(uid)
        delete peersRef.current[uid]
      }
    }
    return pc
  }, [addRemoteTile, removeTile])

  // ── INIT ──────────────────────────────────────────
  useEffect(() => {
    let mounted = true

    const init = async () => {
      let stream
      try   { stream = await navigator.mediaDevices.getUserMedia({ video:true, audio:true }) }
      catch { stream = new MediaStream() }
      if (!mounted) { stream.getTracks().forEach(t => t.stop()); return }

      localStreamRef.current = stream
      addLocalTile(stream)

      const socket = io(SERVER, { transports:['websocket'] })
      socketRef.current = socket

      socket.on('connect', () => socket.emit('room:join', { roomId, name: myName }))

      // Existing participants when you join
      socket.on('room:participants', list => {
        if (!mounted) return
        const map = {}
        list.forEach(p => { if (p.id !== socket.id) map[p.id] = p })
        setParticipants(map)
      })

      // Someone new joined → YOU initiate the offer
      socket.on('room:user_joined', async ({ userId, name: pName }) => {
        if (!mounted || userId === socket.id) return
        setParticipants(prev => ({ ...prev, [userId]: { id:userId, name:pName } }))
        toast(`${pName} joined`)
        const pc = createPeer(userId, localStreamRef.current, pName)
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        socket.emit('webrtc:offer', { to:userId, offer })
      })

      socket.on('room:user_left', ({ userId }) => {
        if (!mounted) return
        setParticipants(prev => { const n={...prev}; delete n[userId]; return n })
        removeTile(userId)
        peersRef.current[userId]?.close()
        delete peersRef.current[userId]
      })

      socket.on('webrtc:offer', async ({ from, offer, fromName }) => {
        if (!mounted) return
        const pc = createPeer(from, localStreamRef.current, fromName)
        await pc.setRemoteDescription(new RTCSessionDescription(offer))
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        socket.emit('webrtc:answer', { to:from, answer })
      })

      socket.on('webrtc:answer', async ({ from, answer }) => {
        await peersRef.current[from]?.setRemoteDescription(new RTCSessionDescription(answer))
      })

      socket.on('webrtc:ice', async ({ from, candidate }) => {
        try { await peersRef.current[from]?.addIceCandidate(new RTCIceCandidate(candidate)) } catch (err){console.log(err)}
      })

      // ── CHAT FIX ──────────────────────────────────────────
      // Server broadcasts room:message_received to ALL (including sender).
      // So we ONLY add to state here — never push locally from sendMsg().
      socket.on('room:message_received', ({ senderId, senderName, message, timestamp }) => {
        if (!mounted) return
        setMessages(prev => [
          ...prev,
          { id: `${senderId}-${timestamp}`, senderName, message, timestamp, mine: senderId === socket.id },
        ])
      })
    }

    init()

    return () => {
      mounted = false
      localStreamRef.current?.getTracks().forEach(t => t.stop())
      screenStreamRef.current?.getTracks().forEach(t => t.stop())
      Object.values(peersRef.current).forEach(pc => pc.close())
      socketRef.current?.disconnect()
    }
  }, [roomId, myName, createPeer, addLocalTile, removeTile])

  // auto-scroll chat
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior:'smooth' }) }, [messages])

  // ── CONTROLS ──────────────────────────────────────
  const toggleMic = () => setMicOn(v => {
    localStreamRef.current?.getAudioTracks().forEach(t => t.enabled = !v)
    toast(!v ? 'Microphone on' : 'Microphone off')
    return !v
  })

  const toggleCam = () => setCamOn(v => {
    localStreamRef.current?.getVideoTracks().forEach(t => t.enabled = !v)
    const vid = document.querySelector('#tile-local video')
    if (vid) vid.style.opacity = v ? '0' : '1'
    toast(!v ? 'Camera on' : 'Camera off')
    return !v
  })

  const toggleScreen = async () => {
    if (sharing) {
      const camTrack = localStreamRef.current?.getVideoTracks()[0]
      Object.values(peersRef.current).forEach(pc =>
        pc.getSenders().find(s => s.track?.kind==='video')?.replaceTrack(camTrack))
      const vid = document.querySelector('#tile-local video')
      if (vid) vid.srcObject = localStreamRef.current
      screenStreamRef.current?.getTracks().forEach(t => t.stop())
      screenStreamRef.current = null
      setSharing(false); toast('Screen sharing stopped')
    } else {
      try {
        const screen = await navigator.mediaDevices.getDisplayMedia({ video:true })
        screenStreamRef.current = screen
        const track = screen.getVideoTracks()[0]
        Object.values(peersRef.current).forEach(pc =>
          pc.getSenders().find(s => s.track?.kind==='video')?.replaceTrack(track))
        const vid = document.querySelector('#tile-local video')
        if (vid) { vid.srcObject = screen; vid.style.transform = 'none' }
        track.onended = () => setSharing(false)
        setSharing(true); toast('Screen sharing started')
      } catch { toast('Screen share cancelled') }
    }
  }

  const leaveRoom = () => {
    socketRef.current?.emit('room:leave', roomId)
    localStreamRef.current?.getTracks().forEach(t => t.stop())
    screenStreamRef.current?.getTracks().forEach(t => t.stop())
    Object.values(peersRef.current).forEach(pc => pc.close())
    localStorage.removeItem('token'); localStorage.removeItem('gm-name')
    window.location.href = '/login'
  }

  // ── CHAT — FIX: only emit; do NOT push to state here ──
  const sendMsg = () => {
    const msg = chatInput.trim()
    if (!msg || !socketRef.current) return
    socketRef.current.emit('room:message', {
      roomId,
      senderId:   socketRef.current.id,
      senderName: myName,
      message:    msg,
      timestamp:  new Date().toISOString(),
    })
    setChatInput('')
  }

  const copyCode = () => {
    navigator.clipboard.writeText(roomId)
    setCopied(true); toast('Meeting code copied!')
    setTimeout(() => setCopied(false), 2000)
  }

  const toggleChat   = () => { setChatOpen(v => !v);   setPeopleOpen(false) }
  const togglePeople = () => { setPeopleOpen(v => !v); setChatOpen(false)   }

  // ── PARTICIPANT COUNT (from state, not DOM) ────────
  const pCount = 1 + Object.keys(participants).length

  return (
    <div style={{ height:'100vh', display:'flex', flexDirection:'column', background:'var(--gm-bg)', position:'relative', overflow:'hidden' }}>

      {/* ── TOP BAR ── */}
      <div style={{ height:60, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 16px', flexShrink:0, zIndex:20, background:'var(--gm-topbar)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <svg width="22" height="22" viewBox="0 0 48 48">
            <path fill="#00832d" d="M29 23.5L34 29v-9.5L29 23.5z"/>
            <path fill="#0066da" d="M4 31.5v5C4 37.88 5.12 39 6.5 39h5L13 34l-2.5-2.5L4 31.5z"/>
            <path fill="#e94235" d="M11.5 9L4 9v5l6.5 7.5L4 16.5v15l6.5-.5L13 29V19l-1.5-4.5V9z"/>
            <path fill="#2684fc" d="M34 9.5V19l5 4.5V14l-3-4.5H34z"/>
            <path fill="#00832d" d="M13 29l-2.5 2.5.5 7.5h18l2-5-2-5H13z"/>
            <path fill="#ffba00" d="M34 19L13 19v10h21V19z"/>
            <path fill="#2684fc" d="M29 9H11.5v9.5L13 19h16V9.5L29 9z"/>
          </svg>
          <span style={{ fontFamily:'Google Sans,sans-serif', fontSize:15, fontWeight:600, color:'#e8eaed' }}>Nousad Meet</span>
        </div>

        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontFamily:'Roboto,sans-serif', fontSize:13, color:'#9aa0a6', fontVariantNumeric:'tabular-nums' }}>
            {fmtTime(elapsed)}
          </span>
          <button className="gm-pill" onClick={copyCode}>
            {copied ? <FiCheck size={12} color="#81c995" /> : <FiCopy size={12} color="#9aa0a6" />}
            <span style={{ letterSpacing:'.04em' }}>{roomId}</span>
          </button>
          <div style={{ background:'#3c4043', borderRadius:99, padding:'6px 14px', fontSize:12, fontFamily:'Roboto,sans-serif', color:'#e8eaed', display:'flex', alignItems:'center', gap:6 }}>
            <MdOutlinePeopleAlt size={14} />
            {/* FIX: participant count from React state */}
            {pCount}
          </div>
        </div>
      </div>

      {/* screen share badge */}
      {sharing && (
        <div className="gm-share-badge">
          <span style={{ width:8, height:8, borderRadius:'50%', background:'#8ab4f8' }} />
          You're presenting to everyone
        </div>
      )}

      {/* ── VIDEO GRID ── */}
      <div style={{ flex:1, padding:8, overflow:'hidden' }}>
        <div ref={gridRef} className="gm-grid gm-grid-1" style={{ height:'100%' }} />
      </div>

      {/* ── CHAT PANEL ── */}
      {chatOpen && (
        <div className="gm-panel">
          <div className="gm-panel-head">
            <span className="gm-panel-title">In-call messages</span>
            <button className="gm-icon-btn" onClick={toggleChat}><FiX size={18} /></button>
          </div>
          <div style={{ flex:1, overflowY:'auto', padding:'12px 16px', display:'flex', flexDirection:'column', gap:12 }}>
            {messages.length === 0 && (
              <p style={{ color:'#80868b', fontSize:13, textAlign:'center', marginTop:28, fontFamily:'Roboto,sans-serif' }}>
                Messages can only be seen by people in the call
              </p>
            )}
            {messages.map(m => (
              <div key={m.id} style={{ display:'flex', flexDirection:'column', alignItems: m.mine ? 'flex-end' : 'flex-start', gap:2 }}>
                {!m.mine && <span style={{ fontSize:11, color:'#80868b', fontFamily:'Roboto,sans-serif', marginLeft:4 }}>{m.senderName}</span>}
                <div className={m.mine ? 'gm-bubble-me' : 'gm-bubble-them'}>{m.message}</div>
                <span className="gm-chat-meta" style={{ textAlign: m.mine ? 'right' : 'left' }}>
                  {new Date(m.timestamp).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}
                </span>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div style={{ padding:'10px 12px', borderTop:'1px solid #e0e0e0', display:'flex', gap:8 }}>
            <input
              style={{ flex:1, padding:'9px 14px', borderRadius:24, border:'1.5px solid #e0e0e0', fontSize:13, fontFamily:'Roboto,sans-serif', color:'#202124', outline:'none' }}
              placeholder="Send a message to everyone"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendMsg()}
            />
            <button onClick={sendMsg} style={{ background:'#1a73e8', border:'none', borderRadius:'50%', width:38, height:38, cursor:'pointer', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <FiSend size={15} />
            </button>
          </div>
        </div>
      )}

      {/* ── PARTICIPANTS PANEL ── */}
      {peopleOpen && (
        <div className="gm-panel">
          <div className="gm-panel-head">
            <span className="gm-panel-title">People ({pCount})</span>
            <button className="gm-icon-btn" onClick={togglePeople}><FiX size={18} /></button>
          </div>
          <div style={{ flex:1, overflowY:'auto' }}>
            {[{ id:'local', name:myName }, ...Object.values(participants)].map(p => (
              <div key={p.id} className="gm-p-item">
                <div className="gm-avatar" style={{ background: avatarColor(p.name) }}>
                  {initials(p.name)}
                </div>
                <div>
                  <div style={{ fontSize:14, fontWeight:500, color:'#202124', fontFamily:'Google Sans,sans-serif' }}>
                    {p.name}{p.id === 'local' ? ' (You)' : ''}
                  </div>
                  <div style={{ fontSize:11, color:'#188038', fontFamily:'Roboto,sans-serif' }}>● In call</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── CONTROL BAR ── */}
      <div style={{ height:80, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 24px', flexShrink:0, background:'var(--gm-bar)', zIndex:20 }}>

        {/* left: name + time */}
        <div style={{ minWidth:140 }}>
          <div style={{ fontFamily:'Google Sans,sans-serif', fontSize:13, color:'#e8eaed', fontWeight:500 }}>{myName}</div>
          <div style={{ fontFamily:'Roboto,sans-serif', fontSize:11, color:'#9aa0a6', marginTop:1 }}>{fmtTime(elapsed)}</div>
        </div>

        {/* center: main controls */}
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>

          <Ctrl icon={micOn ? <FiMic size={20}/> : <FiMicOff size={20}/>}
            label={micOn ? 'Mute mic' : 'Unmute'} off={!micOn} onClick={toggleMic} />

          <Ctrl icon={camOn ? <FiVideo size={20}/> : <FiVideoOff size={20}/>}
            label={camOn ? 'Stop video' : 'Start video'} off={!camOn} onClick={toggleCam} />

          <Ctrl icon={sharing ? <MdStopScreenShare size={22}/> : <MdScreenShare size={22}/>}
            label={sharing ? 'Stop share' : 'Present'} active={sharing} onClick={toggleScreen} />

          {/* Leave — wide pill button, Noush Meet style */}
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
            <button className="gm-ctrl leave" style={{ borderRadius:16, width:'auto', padding:'0 24px', gap:6, display:'flex', alignItems:'center' }}
              onClick={leaveRoom}>
              <FiPhoneOff size={20} />
            </button>
            <span className="gm-ctrl-label">Leave call</span>
          </div>
        </div>

        {/* right: panels + logout */}
        <div style={{ display:'flex', gap:6, alignItems:'center', justifyContent:'flex-end', minWidth:140 }}>
          <Ctrl icon={<FiMessageSquare size={19}/>} label="Chat"    active={chatOpen}   onClick={toggleChat} />
          <Ctrl icon={<FiUsers size={19}/>}         label="People"  active={peopleOpen} onClick={togglePeople} />
          <Ctrl icon={<FiLogOut size={19}/>}        label="Logout"                      onClick={leaveRoom} />
        </div>
      </div>
    </div>
  )
}

// Small presentational component for a control button
function Ctrl({ icon, label, off, active, onClick }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
      <button className={`gm-ctrl ${off?'off':''} ${active?'active':''}`} onClick={onClick} title={label}>
        {icon}
      </button>
      <span className="gm-ctrl-label">{label}</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  makeTile — pure DOM helper (no React, runs inside useCallback)
// ─────────────────────────────────────────────────────────────────────────────
function makeTile(id, stream, name, isLocal) {
  const tile = document.createElement('div')
  tile.className = 'gm-tile'
  tile.id = id

  const vid = document.createElement('video')
  vid.autoplay = true; vid.playsInline = true
  if (isLocal) { vid.muted = true; vid.style.transform = 'scaleX(-1)' }
  vid.srcObject = stream
  vid.style.cssText += 'width:100%;height:100%;object-fit:cover;display:block;'
  tile.appendChild(vid)

  const lbl = document.createElement('div')
  lbl.className = 'gm-tile-label'
  lbl.id = 'lbl-' + id
  lbl.textContent = name
  tile.appendChild(lbl)

  // Avatar placeholder (shown when camera is off)
  const av = document.createElement('div')
  av.id = 'av-' + id
  av.style.cssText = `
    position:absolute;inset:0;display:none;align-items:center;justify-content:center;
    background:#3c4043;
  `
  const circle = document.createElement('div')
  const color  = avatarColor(name)
  circle.style.cssText = `
    width:72px;height:72px;border-radius:50%;background:${color};
    display:flex;align-items:center;justify-content:center;
    font-family:'Google Sans',sans-serif;font-size:26px;font-weight:600;color:#fff;
  `
  circle.textContent = initials(name)
  av.appendChild(circle)
  tile.appendChild(av)

  return tile
}

// ─────────────────────────────────────────────────────────────────────────────
//  APP
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/"         element={<Navigate to="/login" replace />} />
        <Route path="/login"    element={<Lobby />} />
        <Route path="/room/:id" element={<ProtectedRoute><Room /></ProtectedRoute>} />
      </Routes>
    </Router>
  )
}
