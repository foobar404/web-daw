import { useMemo, useRef, useState, useEffect } from 'react';
import { TrackNav } from './components/TrackNav';
import { Tracks } from "./components/Tracks";
import { Sounds } from './components/Sounds';
import { PianoRoll } from './components/PianoRoll';
import { TapPad } from './components/TapPad';
import * as lamejs from 'lamejs';

// Pixels per second for the simple timeline rendering
const PPS = 80

function secondsToMmSs(s) {
  const m = Math.floor(s / 60)
  const sec = Math.round(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function App() {
  const [tracks, setTracks] = useState([{ id: 1, name: 'Track 1', clips: [], volume: 1.0, muted: false }])
  const [isPlaying, setIsPlaying] = useState(false)
  const [playHead, setPlayHead] = useState(0) // seconds
  const audioCtxRef = useRef(null)
  const activeSourcesRef = useRef([])
  const mediaRecorderRef = useRef(null)
  const mediaStreamRef = useRef(null)
  const recordedChunksRef = useRef([])
  const rafRef = useRef(0)
  const nextIds = useRef({ track: 2, clip: 1, sound: 1 })
  const playbackStartOffsetRef = useRef(0)
  const playbackTimerRef = useRef(null)
  const [sounds, setSounds] = useState([])
  const draggingRef = useRef(null)
  const [recordingTrackId, setRecordingTrackId] = useState(null)
  const [selectedTrackId, setSelectedTrackId] = useState(1)
  const [snapEnabled, setSnapEnabled] = useState(true)
  const [loop, setLoop] = useState(false)

  // Panel visibility state
  const [panelVisibility, setPanelVisibility] = useState({
    sounds: true,
    tapPad: true,
    tracks: true,
    pianoRoll: true
  })

  // Project name state
  const [projectName, setProjectName] = useState('Untitled Project')

  // Refs for panels
  const soundsRef = useRef(null)
  const tapPadRef = useRef(null)
  const tracksRef = useRef(null)

  // ResizeObserver for snapping to grid
  useEffect(() => {
    const container = document.querySelector('.w-screen.h-screen')
    if (!container) return

    const updateSpan = (panelName, ref) => {
      if (!ref.current) return
      const panelWidth = ref.current.offsetWidth
      const containerWidth = container.offsetWidth
      const columnWidth = containerWidth / 12
      const newSpan = Math.max(1, Math.min(12, Math.round(panelWidth / columnWidth)))
      setPanelSpans(prev => ({ ...prev, [panelName]: newSpan }))
    }

    const observers = {}

    if (panelVisibility.sounds && soundsRef.current) {
      observers.sounds = new ResizeObserver(() => updateSpan('sounds', soundsRef))
      observers.sounds.observe(soundsRef.current)
    }
    if (panelVisibility.tapPad && tapPadRef.current) {
      observers.tapPad = new ResizeObserver(() => updateSpan('tapPad', tapPadRef))
      observers.tapPad.observe(tapPadRef.current)
    }
    if ((panelVisibility.tracks || panelVisibility.pianoRoll) && tracksRef.current) {
      observers.tracks = new ResizeObserver(() => updateSpan('tracks', tracksRef))
      observers.tracks.observe(tracksRef.current)
    }

    return () => {
      Object.values(observers).forEach(obs => obs.disconnect())
    }
  }, [panelVisibility])

  // Toggle panel visibility
  const togglePanel = (panelName) => {
    setPanelVisibility(prev => ({
      ...prev,
      [panelName]: !prev[panelName]
    }))
  }

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

  // Spacebar to toggle play/pause
  useEffect(() => {
    const handleKeyPress = (e) => {
      // Don't capture spacebar if typing in an input field
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return
      }
      if (e.code === 'Space') {
        e.preventDefault()
        togglePlayPause()
      }
    }
    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [togglePlayPause])

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
    const newTrack = { id, name: `Track ${id}`, clips: [], volume: 1.0, muted: false }
    setTracks((prev) => {
      if (!afterId) return [...prev, newTrack]
      const idx = prev.findIndex((t) => t.id === afterId)
      if (idx === -1) return [...prev, newTrack]
      const copy = prev.slice()
      copy.splice(idx + 1, 0, newTrack)
      return copy
    })
    setSelectedTrackId(id)
    return id
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
  function addClipToTrack(trackId, buffer, name, start = 0, extraData = {}) {
    setTracks((prev) => prev.map((t) => {
      if (t.id !== trackId) return t
      // Use the full buffer duration for timeline clips, or provided duration for piano roll
      const duration = extraData.duration || (buffer ? buffer.duration : 0)
      const clip = { 
        id: nextIds.current.clip++, 
        name, 
        buffer, 
        duration, 
        start,
        ...extraData // Include any extra data like notes, type, soundId
      }
      return { ...t, clips: [...t.clips, clip] }
    }))
  }

  async function startRecording(trackId) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
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
          const now = new Date()
          const dateTimeStr =
            String(now.toLocaleDateString()) + '-' +
            String(now.getHours()).padStart(2, '0') + ":" +
            String(now.getMinutes()).padStart(2, '0') + ":" +
            String(now.getSeconds()).padStart(2, '0')
          const recordingName = `recording-${dateTimeStr}.webm`
          addClipToTrack(trackId, buf, recordingName, playHead)

          // Also add to sounds library
          const s = { id: nextIds.current.sound++, name: recordingName, buffer: buf, duration: buf.duration }
          setSounds((p) => [...p, s])
        } catch (err) {
          // Failed to decode recording
        }
        stopMediaStream()
        mediaRecorderRef.current = null
        recordedChunksRef.current = []
        setRecordingTrackId(null)
      }
      mr.start()
      setRecordingTrackId(trackId)
    } catch (err) {
      // Could not start recording
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

  function reorderSounds(fromIndex, toIndex) {
    setSounds((prev) => {
      const copy = [...prev]
      const [removed] = copy.splice(fromIndex, 1)
      copy.splice(toIndex, 0, removed)
      return copy
    })
  }

  function removeSound(soundId) {
    setSounds((prev) => prev.filter(sound => sound.id !== soundId))
  }

  function onDropSound(trackId, soundId, start) {
    const s = sounds.find((x) => String(x.id) === String(soundId))
    if (!s) return
    addClipToTrack(trackId, s.buffer, s.name, start)
  }

  function onCreatePianoRollClip(trackId, clip) {
    if (clip.type === 'pianoRoll') {
      // For piano roll clips, store the notes data
      addClipToTrack(trackId, null, clip.name, clip.start, clip)
    } else {
      // For regular clips, store the buffer
      addClipToTrack(trackId, clip.buffer, clip.name, clip.start)
      // Also add to sounds library
      const s = { id: nextIds.current.sound++, name: clip.name, buffer: clip.buffer, duration: clip.duration || clip.buffer.duration }
      setSounds((p) => [...p, s])
    }
  }

  function updateClip(trackId, clipId, patch) {
    setTracks((prev) => prev.map((t) => {
      if (t.id !== trackId) return t
      return { ...t, clips: t.clips.map((c) => (c.id === clipId ? { ...c, ...patch } : c)) }
    }))
  }

  function updatePianoRollSound(soundId) {
    setTracks((prev) => prev.map((t) => ({
      ...t,
      clips: t.clips.map((c) => 
        c.type === 'pianoRoll' ? { ...c, soundId } : c
      )
    })))
  }

  function updateTrackVolume(trackId, volume) {
    setTracks((prev) => prev.map((t) =>
      t.id === trackId ? { ...t, volume: Math.max(0, Math.min(1, volume)) } : t
    ))
  }

  function toggleTrackMute(trackId) {
    setTracks((prev) => prev.map((t) =>
      t.id === trackId ? { ...t, muted: !t.muted } : t
    ))
  }

  // Move a clip from one track to another
  function moveClipToTrack(fromTrackId, toTrackId, clipId) {
    setTracks((prev) => {
      const fromTrack = prev.find(t => t.id === fromTrackId)
      const clip = fromTrack?.clips.find(c => c.id === clipId)
      if (!clip) return prev

      // Remove from source track
      const withoutClip = prev.map(t =>
        t.id === fromTrackId
          ? { ...t, clips: t.clips.filter(c => c.id !== clipId) }
          : t
      )

      // Add to destination track
      return withoutClip.map(t =>
        t.id === toTrackId
          ? { ...t, clips: [...t.clips, clip] }
          : t
      )
    })
  }

  // Drag handlers for clips (horizontal move changes start time, vertical move changes track)
  function onClipPointerDown(e, trackId, clipId) {
    e.preventDefault()
    const container = e.currentTarget.parentElement // track-lane
    const rect = container.getBoundingClientRect()
    draggingRef.current = {
      trackId,
      clipId,
      startX: e.clientX,
      startY: e.clientY,
      containerLeft: rect.left,
      containerTop: rect.top,
      origStart: (() => {
        const t = tracks.find((x) => x.id === trackId)
        const c = t?.clips.find((x) => x.id === clipId)
        return c?.start ?? 0
      })(),
      isVerticalDrag: false,
      targetTrackId: trackId,
    }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  }

  function onPointerMove(e) {
    const d = draggingRef.current
    if (!d) return

    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY

    // Determine if this is primarily a vertical drag (more vertical than horizontal movement)
    const verticalThreshold = 20 // pixels
    if (Math.abs(dy) > verticalThreshold && Math.abs(dy) > Math.abs(dx)) {
      d.isVerticalDrag = true
    }

    // Handle horizontal movement (start time)
    if (!d.isVerticalDrag) {
      const deltaSec = dx / PPS
      let newStart = Math.max(0, +(d.origStart + deltaSec).toFixed(3))

      // Apply snapping during drag if enabled
      if (snapEnabled) {
        newStart = Math.round(newStart) // Snap to 1s intervals
      }

      updateClip(d.trackId, d.clipId, { start: newStart })
    }

    // Handle vertical movement (track changes)
    if (d.isVerticalDrag) {
      // Calculate which track we're hovering over
      const tracksContainer = document.querySelector('.p-2.relative') // The tracks container
      if (tracksContainer) {
        const containerRect = tracksContainer.getBoundingClientRect()
        const relativeY = e.clientY - containerRect.top

        // Each track has height of about 88px (72px content + 16px margin)
        const trackHeight = 88
        const trackIndex = Math.floor(relativeY / trackHeight)

        if (trackIndex >= 0 && trackIndex < tracks.length) {
          const targetTrack = tracks[trackIndex]
          d.targetTrackId = targetTrack.id
        }
      }
    }
  }

  function onPointerUp() {
    const d = draggingRef.current
    if (!d) return

    // If this was a vertical drag and we're moving to a different track
    if (d.isVerticalDrag && d.targetTrackId !== d.trackId) {
      moveClipToTrack(d.trackId, d.targetTrackId, d.clipId)
    }

    draggingRef.current = null
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
  }

  function deleteClip(trackId, clipId) {
    setTracks((prev) => prev.map((t) => (t.id === trackId ? { ...t, clips: t.clips.filter((c) => c.id !== clipId) } : t)))
  }

  function deleteTrack(trackId) {
    setTracks((prev) => prev.filter((t) => t.id !== trackId))
    if (selectedTrackId === trackId) {
      setSelectedTrackId(null)
    }
  }

  function duplicateTrack(trackId) {
    const trackToDuplicate = tracks.find(t => t.id === trackId)
    if (!trackToDuplicate) return

    const newTrackId = nextIds.current.track++
    const duplicatedClips = trackToDuplicate.clips.map(c => ({
      ...c,
      id: nextIds.current.clip++
    }))

    const newTrack = {
      id: newTrackId,
      name: `${trackToDuplicate.name} Copy`,
      clips: duplicatedClips,
      volume: trackToDuplicate.volume || 1.0,
      muted: trackToDuplicate.muted || false
    }

    setTracks((prev) => {
      const idx = prev.findIndex((t) => t.id === trackId)
      const copy = prev.slice()
      copy.splice(idx + 1, 0, newTrack)
      return copy
    })
  }

  function moveTrackUp(trackId) {
    setTracks((prev) => {
      const idx = prev.findIndex((t) => t.id === trackId)
      if (idx <= 0) return prev
      const copy = prev.slice()
      const temp = copy[idx]
      copy[idx] = copy[idx - 1]
      copy[idx - 1] = temp
      return copy
    })
  }

  function moveTrackDown(trackId) {
    setTracks((prev) => {
      const idx = prev.findIndex((t) => t.id === trackId)
      if (idx === -1 || idx >= prev.length - 1) return prev
      const copy = prev.slice()
      const temp = copy[idx]
      copy[idx] = copy[idx + 1]
      copy[idx + 1] = temp
      return copy
    })
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
      // Skip muted tracks
      if (t.muted) continue

      // Create gain node for track volume
      const gainNode = ctx.createGain()
      gainNode.gain.value = t.volume || 1.0
      gainNode.connect(ctx.destination)

      for (const c of t.clips) {
        if (c.type === 'pianoRoll') {
          // Handle piano roll clips by scheduling individual notes
          if (c.notes && c.soundId) {
            const sound = sounds.find(s => String(s.id) === String(c.soundId))
            if (sound && sound.buffer) {
              for (const note of c.notes) {
                const noteStart = c.start + note.start
                const noteEnd = noteStart + note.duration
                if (noteEnd <= startFrom) continue // already passed
                
                const when = startAt + Math.max(0, noteStart - startFrom)
                if (when >= startAt) { // Only schedule future notes
                  const src = ctx.createBufferSource()
                  src.buffer = sound.buffer
                  src.playbackRate.value = Math.pow(2, (note.transposition || 0) / 12)
                  src.connect(gainNode)
                  try { src.start(when) } catch (e) { src.start(when) }
                  sources.push(src)
                }
                lastEnd = Math.max(lastEnd, noteEnd)
              }
            }
          }
        } else if (c.buffer) {
          // Handle regular clips
          const clipEnd = c.start + c.duration
          if (clipEnd <= startFrom) continue // already passed
          const offset = Math.max(0, startFrom - c.start)
          const when = startAt + Math.max(0, c.start - startFrom)
          const src = ctx.createBufferSource()
          src.buffer = c.buffer
          src.connect(gainNode) // Connect through gain node instead of directly to destination
          try { src.start(when, offset) } catch (e) { src.start(when) }
          sources.push(src)
          lastEnd = Math.max(lastEnd, clipEnd)
        }
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

    try {
      const sampleRate = 44100
      const duration = Math.max(1, Math.ceil(projectDuration))
      const ctx = new OfflineAudioContext(2, duration * sampleRate, sampleRate)

      // Schedule all clips with volume
      for (const t of tracks) {
        // Skip muted tracks
        if (t.muted) continue

        const gainNode = ctx.createGain()
        gainNode.gain.value = t.volume || 1.0
        gainNode.connect(ctx.destination)

        for (const c of t.clips) {
          if (c.buffer) {
            const s = ctx.createBufferSource()
            s.buffer = c.buffer
            s.connect(gainNode)
            s.start(c.start)
          }
        }
      }

      const rendered = await ctx.startRendering()

      // Export as WAV instead of MP3 to avoid lamejs issues
      const wavBlob = audioBufferToWav(rendered)
      const url = URL.createObjectURL(wavBlob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'mixdown.wav'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (error) {
      alert('Export failed. Please try again.')
    }
  }

  // Convert AudioBuffer to WAV Blob
  function audioBufferToWav(buffer) {
    const length = buffer.length
    const numberOfChannels = buffer.numberOfChannels
    const sampleRate = buffer.sampleRate
    const bytesPerSample = 2
    const blockAlign = numberOfChannels * bytesPerSample
    const byteRate = sampleRate * blockAlign
    const dataSize = length * blockAlign
    const bufferSize = 44 + dataSize

    const arrayBuffer = new ArrayBuffer(bufferSize)
    const view = new DataView(arrayBuffer)

    // WAV header
    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i))
      }
    }

    writeString(0, 'RIFF')
    view.setUint32(4, bufferSize - 8, true)
    writeString(8, 'WAVE')
    writeString(12, 'fmt ')
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true)
    view.setUint16(22, numberOfChannels, true)
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, byteRate, true)
    view.setUint16(32, blockAlign, true)
    view.setUint16(34, 16, true)
    writeString(36, 'data')
    view.setUint32(40, dataSize, true)

    // Convert float samples to 16-bit PCM
    let offset = 44
    for (let i = 0; i < length; i++) {
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]))
        view.setInt16(offset, sample * 0x7FFF, true)
        offset += 2
      }
    }

    return new Blob([arrayBuffer], { type: 'audio/wav' })
  }

  // Save project to file
  async function saveProject() {
    try {
      // Convert audio buffers to base64 for serialization
      const serializedSounds = await Promise.all(sounds.map(async (sound) => {
        const wavBlob = audioBufferToWav(sound.buffer)
        const arrayBuffer = await wavBlob.arrayBuffer()
        const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))
        return {
          id: sound.id,
          name: sound.name,
          duration: sound.duration,
          audioData: base64
        }
      }))

      const projectData = {
        version: '1.0',
        projectName,
        tracks,
        sounds: serializedSounds,
        panelVisibility,
        selectedTrackId,
        snapEnabled,
        loop,
        nextIds: nextIds.current
      }

      const jsonString = JSON.stringify(projectData, null, 2)
      const blob = new Blob([jsonString], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${projectName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.daw`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (error) {
      alert('Failed to save project: ' + error.message)
    }
  }

  // Load project from file
  async function loadProject() {
    try {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.daw'
      input.onchange = async (e) => {
        const file = e.target.files[0]
        if (!file) return

        const text = await file.text()
        const projectData = JSON.parse(text)

        // Validate project data
        if (!projectData.version || !projectData.tracks) {
          throw new Error('Invalid project file')
        }

        // Stop any playing audio
        stopPlayback()

        // Load sounds
        const loadedSounds = await Promise.all(projectData.sounds.map(async (soundData) => {
          // Ensure audio context is initialized
          if (!audioCtxRef.current) {
            const AC = window.AudioContext || window.webkitAudioContext
            audioCtxRef.current = new AC({ latencyHint: 'interactive' })
          }

          const binaryString = atob(soundData.audioData)
          const bytes = new Uint8Array(binaryString.length)
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i)
          }
          const arrayBuffer = bytes.buffer
          const audioBuffer = await audioCtxRef.current.decodeAudioData(arrayBuffer.slice(0))

          return {
            id: soundData.id,
            name: soundData.name,
            buffer: audioBuffer,
            duration: soundData.duration
          }
        }))

        // Update state
        setProjectName(projectData.projectName || 'Untitled Project')
        setTracks(projectData.tracks || [])
        setSounds(loadedSounds)
        setPanelVisibility(projectData.panelVisibility || {
          sounds: true,
          tapPad: true,
          tracks: true,
          pianoRoll: true
        })
        setSelectedTrackId(projectData.selectedTrackId || 1)
        setSnapEnabled(projectData.snapEnabled !== false)
        setLoop(projectData.loop || false)
        nextIds.current = projectData.nextIds || { track: 2, clip: 1, sound: 1 }
      }
      input.click()
    } catch (error) {
      alert('Failed to load project: ' + error.message)
    }
  }

  // Calculate grid columns based on panel visibility
  const getGridColumns = () => {
    const visibleCount = Object.values(panelVisibility).filter(Boolean).length
    if (visibleCount === 0) return '1fr'
    return `repeat(${visibleCount}, 1fr)`
  }

  return (
    <>
      <TrackNav
        togglePlayPause={togglePlayPause}
        stopPlayback={stopPlayback}
        saveProject={saveProject}
        loadProject={loadProject}
        exportMp3={exportMp3}
        isPlaying={isPlaying}
        tracks={tracks}
        playHead={playHead}
        secondsToMmSs={secondsToMmSs}
        panelVisibility={panelVisibility}
        onTogglePanel={togglePanel}
        projectName={projectName}
        onProjectNameChange={setProjectName}
        style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 10 }}
      />
      <div className="w-screen h-screen overflow-hidden grid gap-4" 
           style={{
             gridTemplateColumns: getGridColumns(),
             gridTemplateRows: '1fr',
             paddingTop: '5rem'
           }}>      {panelVisibility.sounds && (
        <Sounds
          sounds={sounds}
          onAddFiles={addSounds}
          onReorderSounds={reorderSounds}
          onRemoveSound={removeSound}
        />
      )}

      {panelVisibility.tapPad && (
        <TapPad
          sounds={sounds}
        />
      )}

      {(panelVisibility.tracks || panelVisibility.pianoRoll) && (
        <div className="grid gap-4 min-h-0"
            style={{
              gridTemplateRows: panelVisibility.tracks && panelVisibility.pianoRoll
                ? '1fr 1fr'
                : '1fr'
            }}>
          {panelVisibility.tracks && (
            <Tracks
              projectDuration={projectDuration}
              PPS={PPS}
              playHead={playHead}
              setPlayHead={setPlayHead}
              isPlaying={isPlaying}
              tracks={tracks}
              selectedTrackId={selectedTrackId}
              setSelectedTrackId={setSelectedTrackId}
              snapEnabled={snapEnabled}
              setSnapEnabled={setSnapEnabled}
              onClipPointerDown={onClipPointerDown}
              secondsToMmSs={secondsToMmSs}
              updateClip={updateClip}
              updateTrackVolume={updateTrackVolume}
              toggleTrackMute={toggleTrackMute}
              deleteClip={deleteClip}
              deleteTrack={deleteTrack}
              duplicateTrack={duplicateTrack}
              moveTrackUp={moveTrackUp}
              moveTrackDown={moveTrackDown}
              handleFilesAdd={handleFilesAdd}
              recordingTrackId={recordingTrackId}
              stopRecording={stopRecording}
              startRecording={startRecording}
              addTrack={addTrack}
              sounds={sounds}
              onDropSound={onDropSound}
              moveClipToTrack={moveClipToTrack}
              addClipToTrack={addClipToTrack}
            />
          )}

          {panelVisibility.pianoRoll && (
            <PianoRoll
              sounds={sounds}
              onCreateClip={onCreatePianoRollClip}
              onUpdateClip={updateClip}
              onUpdatePianoRollSound={updatePianoRollSound}
              selectedTrackId={selectedTrackId}
              PPS={PPS}
            />
          )}
        </div>
      )}
      </div>
    </>
  )
}

export default App
