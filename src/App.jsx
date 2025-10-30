import { useMemo, useRef, useState, useEffect } from 'react';
import { TrackNav } from './components/TrackNav';
import { Tracks } from "./components/Tracks";
import { Sounds } from './components/Sounds';

// Pixels per second for the simple timeline rendering
const PPS = 80

function secondsToMmSs(s) {
  const m = Math.floor(s / 60)  
  const sec = Math.round(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function App() {
  const [tracks, setTracks] = useState([]) // [{id, name, clips:[{id,name,buffer,start,duration}]}]
  const [isPlaying, setIsPlaying] = useState(false)
  const [playHead, setPlayHead] = useState(0) // seconds
  const audioCtxRef = useRef(null)
  const activeSourcesRef = useRef([])
  const mediaRecorderRef = useRef(null)
  const mediaStreamRef = useRef(null)
  const recordedChunksRef = useRef([])
  const rafRef = useRef(0)
  const nextIds = useRef({ track: 1, clip: 1, sound: 1 })
  const [sounds, setSounds] = useState([])
  const [recordingTrackId, setRecordingTrackId] = useState(null)
  const draggingRef = useRef(null)
  const [loop, setLoop] = useState(false)
  const playbackTimerRef = useRef(null)
  const playbackStartOffsetRef = useRef(0) // Track where playback started from

  // Update playHead while playing
  useEffect(() => {
    if (!isPlaying) return
    let animationFrame
    const update = () => {
      const ctx = audioCtxRef.current
      if (ctx && ctx.__dawStartTime) {
        const elapsed = ctx.currentTime - ctx.__dawStartTime
        setPlayHead(playbackStartOffsetRef.current + elapsed)
      }
      animationFrame = requestAnimationFrame(update)
    }
    animationFrame = requestAnimationFrame(update)
    return () => cancelAnimationFrame(animationFrame)
  }, [isPlaying])

  // Project duration is max end time across all clips
  const projectDuration = useMemo(() => {
    let maxEnd = 0
    for (const t of tracks) {
      for (const c of t.clips) {
        maxEnd = Math.max(maxEnd, (c.start || 0) + (c.duration || 0))
      }
    }
    return Math.max(60, Math.ceil(maxEnd)) // ensure at least 60s timeline
  }, [tracks])

  function ensureAudioContext() {
    if (!audioCtxRef.current) {
      const AC = window.AudioContext || window.webkitAudioContext
      audioCtxRef.current = new AC({ latencyHint: 'interactive' })
    }
    return audioCtxRef.current
  }

  function addTrack(afterId = null) {
    const id = nextIds.current.track++
    const newTrack = { id, name: `Track ${id}`, clips: [] }
    setTracks((prev) => {
      if (!afterId) return [...prev, newTrack]
      const idx = prev.findIndex((t) => t.id === afterId)
      if (idx === -1) return [...prev, newTrack]
      const copy = prev.slice()
      copy.splice(idx + 1, 0, newTrack)
      return copy
    })
  }

  async function decodeFileToBuffer(file) {
    // Use a short-lived context for decoding to avoid resuming the main transport context unnecessarily
    const AC = window.AudioContext || window.webkitAudioContext
    const decodeCtx = new AC()
    const arrayBuf = await file.arrayBuffer()
    const audioBuf = await decodeCtx.decodeAudioData(arrayBuf)
    decodeCtx.close()
    return audioBuf
  }

  // small helpers to keep code compact
  function stopMediaStream() {
    if (!mediaStreamRef.current) return
    for (const tr of mediaStreamRef.current.getTracks()) tr.stop()
    mediaStreamRef.current = null
  }

  // add a clip to a track; default start is 0 so clips overlap across tracks by default
  function addClipToTrack(trackId, buffer, name, start = 0) {
    setTracks((prev) => prev.map((t) => {
      if (t.id !== trackId) return t
      const clip = { id: nextIds.current.clip++, name, buffer, duration: buffer.duration, start }
      return { ...t, clips: [...t.clips, clip] }
    }))
  }

  async function startRecording(trackId) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.warn('getUserMedia not supported in this browser')
      return
    }
    try {
      // stop any existing recording first
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop()
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream
      recordedChunksRef.current = []
      const mr = new MediaRecorder(stream)
      mediaRecorderRef.current = mr
      mr.ondataavailable = (ev) => {
        if (ev.data && ev.data.size) recordedChunksRef.current.push(ev.data)
      }
      mr.onstop = async () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'audio/webm' })
        try {
          const buf = await decodeFileToBuffer(blob)
          addClipToTrack(trackId, buf, `Recording-${Date.now()}.webm`, 0)
        } catch (err) {
          console.error('Failed to decode recording', err)
        }
        stopMediaStream()
        mediaRecorderRef.current = null
        recordedChunksRef.current = []
        setRecordingTrackId(null)
      }
      mr.start()
      setRecordingTrackId(trackId)
    } catch (err) {
      console.error('Could not start recording', err)
    }
  }

  function stopRecording() {
    const mr = mediaRecorderRef.current
    if (mr && mr.state !== 'inactive') mr.stop()
    stopMediaStream()
    mediaRecorderRef.current = null
    setRecordingTrackId(null)
  }

  async function handleFilesAdd(trackId, files) {
    if (!files || files.length === 0) return
    for (const file of files) {
      const buf = await decodeFileToBuffer(file)
      addClipToTrack(trackId, buf, file.name, 0)
    }
  }

  // add files to the global sounds panel (library)
  async function addSounds(files) {
    if (!files || files.length === 0) return
    for (const file of files) {
      const buf = await decodeFileToBuffer(file)
      const s = { id: nextIds.current.sound++, name: file.name, buffer: buf, duration: buf.duration }
      setSounds((p) => [...p, s])
    }
  }

  function onDropSound(trackId, soundId, start) {
    const s = sounds.find((x) => String(x.id) === String(soundId))
    if (!s) return
    addClipToTrack(trackId, s.buffer, s.name, start)
  }

  function updateClip(trackId, clipId, patch) {
    setTracks((prev) => prev.map((t) => {
      if (t.id !== trackId) return t
      return { ...t, clips: t.clips.map((c) => (c.id === clipId ? { ...c, ...patch } : c)) }
    }))
  }

  // Drag handlers for clips (horizontal move changes start time)
  function onClipPointerDown(e, trackId, clipId) {
    e.preventDefault()
    const container = e.currentTarget.parentElement // track-lane
    const rect = container.getBoundingClientRect()
    draggingRef.current = {
      trackId,
      clipId,
      startX: e.clientX,
      containerLeft: rect.left,
      origStart: (() => {
        const t = tracks.find((x) => x.id === trackId)
        const c = t?.clips.find((x) => x.id === clipId)
        return c?.start ?? 0
      })(),
    }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  }

  function onPointerMove(e) {
    const d = draggingRef.current
    if (!d) return
    const dx = e.clientX - d.startX
    const deltaSec = dx / PPS
    const newStart = Math.max(0, +(d.origStart + deltaSec).toFixed(3))
    updateClip(d.trackId, d.clipId, { start: newStart })
  }

  function onPointerUp() {
    draggingRef.current = null
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
  }

  function deleteClip(trackId, clipId) {
    setTracks((prev) => prev.map((t) => (t.id === trackId ? { ...t, clips: t.clips.filter((c) => c.id !== clipId) } : t)))
  }

  function stopPlayback() {
    const ctx = audioCtxRef.current
    setIsPlaying(false)
    setPlayHead(0)
    for (const s of activeSourcesRef.current) {
      try { s.stop(0) } catch { }
    }
    activeSourcesRef.current = []
    if (ctx) {
      ctx.__dawStartTime = null
    }
    if (playbackTimerRef.current) { clearTimeout(playbackTimerRef.current); playbackTimerRef.current = null }
  }

  function startPlayback() {
    if (tracks.length === 0) return
    const ctx = ensureAudioContext()
    ctx.resume()
    const startFrom = Math.max(0, playHead)
    playbackStartOffsetRef.current = startFrom
    // Stop any existing playback sources
    for (const s of activeSourcesRef.current) {
      try { s.stop(0) } catch { }
    }
    activeSourcesRef.current = []
    if (playbackTimerRef.current) { clearTimeout(playbackTimerRef.current); playbackTimerRef.current = null }
    
    const startAt = ctx.currentTime + 0.05
    ctx.__dawStartTime = startAt
    // schedule clips relative to current playHead so starting mid-project works
    const sources = []
    let lastEnd = 0
    for (const t of tracks) {
      for (const c of t.clips) {
        if (!c.buffer) continue
        const clipEnd = c.start + c.duration
        if (clipEnd <= startFrom) continue // already passed
        const offset = Math.max(0, startFrom - c.start)
        const when = startAt + Math.max(0, c.start - startFrom)
        const src = ctx.createBufferSource()
        src.buffer = c.buffer
        src.connect(ctx.destination)
        try { src.start(when, offset) } catch (e) { src.start(when) }
        sources.push(src)
        lastEnd = Math.max(lastEnd, clipEnd)
      }
    }
    activeSourcesRef.current = sources
    setIsPlaying(true)
    // set timer to stop or loop when project ends
    const remaining = Math.max(0, lastEnd - startFrom)
    if (remaining > 0) {
      playbackTimerRef.current = setTimeout(() => {
        if (loop) {
          setPlayHead(0)
          startPlayback()
        } else {
          stopPlayback()
        }
      }, remaining * 1000 + 100)
    }
  }

  function togglePlayPause() {
    if (isPlaying) {
      pausePlayback()
    } else {
      startPlayback()
    }
  }

  function pausePlayback() {
    const ctx = audioCtxRef.current
    setIsPlaying(false)
    for (const s of activeSourcesRef.current) {
      try { s.stop(0) } catch { }
    }
    activeSourcesRef.current = []
    if (ctx) {
      ctx.__dawStartTime = null
    }
    if (playbackTimerRef.current) { clearTimeout(playbackTimerRef.current); playbackTimerRef.current = null }
    // Keep current playHead position (don't reset to 0)
  }

  async function exportMp3() {
    if (tracks.length === 0) return
    const sampleRate = 44100
    const duration = Math.max(1, Math.ceil(projectDuration))
    const ctx = new OfflineAudioContext(2, duration * sampleRate, sampleRate)
    // Schedule all clips
    for (const t of tracks) for (const c of t.clips) if (c.buffer) { const s = ctx.createBufferSource(); s.buffer = c.buffer; s.connect(ctx.destination); s.start(c.start) }
    const rendered = await ctx.startRendering()
    const left = rendered.getChannelData(0)
    const right = rendered.numberOfChannels > 1 ? rendered.getChannelData(1) : left
    const floatTo16 = (f) => { const out = new Int16Array(f.length); for (let i = 0; i < f.length; i++) { let s = Math.max(-1, Math.min(1, f[i])); out[i] = s < 0 ? s * 0x8000 : s * 0x7fff } return out }
    const l16 = floatTo16(left), r16 = floatTo16(right)

    // Dynamically import lamejs minified UMD build to avoid module wiring issues
    const lamejs = await import('lamejs/lame.min.js')
    const encoder = new lamejs.Mp3Encoder(2, sampleRate, 128), mp3Data = [], block = 1152
    for (let i = 0; i < l16.length; i += block) { const enc = encoder.encodeBuffer(l16.subarray(i, i + block), r16.subarray(i, i + block)); if (enc.length) mp3Data.push(enc) }
    const end = encoder.flush(); if (end.length) mp3Data.push(end)
    const blob = new Blob(mp3Data, { type: 'audio/mpeg' }); const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'mixdown.mp3'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
  } 
  
  return (
    <div className="max-w-6xl mx-auto p-4">
      <TrackNav
        addTrack={addTrack}
        togglePlayPause={togglePlayPause}
        stopPlayback={stopPlayback}
        exportMp3={exportMp3}
        isPlaying={isPlaying}
        tracks={tracks}
        playHead={playHead}
        secondsToMmSs={secondsToMmSs}
      />

      <div className="flex gap-4">`
        <div className="w-64">
          <Sounds sounds={sounds} onAddFiles={addSounds} />
        </div>

        <div className="flex-1">
          <Tracks
            projectDuration={projectDuration}
            PPS={PPS}
            playHead={playHead}
            tracks={tracks}
            onClipPointerDown={onClipPointerDown}
            secondsToMmSs={secondsToMmSs}
            updateClip={updateClip}
            deleteClip={deleteClip}
            handleFilesAdd={handleFilesAdd}
            recordingTrackId={recordingTrackId}
            stopRecording={stopRecording}
            startRecording={startRecording}
            addTrack={addTrack}
            sounds={sounds}
            onDropSound={onDropSound}
          />
        </div>
      </div>
    </div>
  )
}

export default App
