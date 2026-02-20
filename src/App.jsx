import { useMemo, useRef, useState, useEffect } from 'react';
import { TrackNav } from './components/TrackNav';
import { Tracks } from "./components/Tracks";
import { Sounds } from './components/Sounds';
import { PianoRoll } from './components/PianoRoll';
import { TapPad } from './components/TapPad';
import { SoundMixer } from './components/SoundMixer';
import { ChopShop } from './components/ChopShop';
import { PianoPlayer } from './components/PianoPlayer';
import { MicRecorder } from './components/MicRecorder';
import * as lamejs from 'lamejs';
import JSZip from 'jszip';

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
    pianoPlayer: true,
    tracks: true,
    pianoRoll: true,
    soundMixer: true,
    chopShop: true
  })

  // Panel layout state (grid-based positioning)
  const [panelLayouts, setPanelLayouts] = useState(() => {
    const minSizes = {
      sounds: { w: 2, h: 2 },
      tapPad: { w: 3, h: 2 },
      chopShop: { w: 2, h: 2 },
      pianoPlayer: { w: 5, h: 2 },
      tracks: { w: 3, h: 2 },
      pianoRoll: { w: 4, h: 3 },
      soundMixer: { w: 2, h: 2 }
    }
    return {
      sounds: { x: 0, y: 0, w: Math.max(minSizes.sounds.w, 3), h: Math.max(minSizes.sounds.h, 2) },
      tapPad: { x: 3, y: 0, w: Math.max(minSizes.tapPad.w, 3), h: Math.max(minSizes.tapPad.h, 2) },
      chopShop: { x: 6, y: 0, w: Math.max(minSizes.chopShop.w, 3), h: Math.max(minSizes.chopShop.h, 2) },
      pianoPlayer: { x: 0, y: 2, w: Math.max(minSizes.pianoPlayer.w, 6), h: Math.max(minSizes.pianoPlayer.h, 2) },
      tracks: { x: 6, y: 2, w: Math.max(minSizes.tracks.w, 6), h: Math.max(minSizes.tracks.h, 2) },
      pianoRoll: { x: 0, y: 4, w: Math.max(minSizes.pianoRoll.w, 8), h: Math.max(minSizes.pianoRoll.h, 2) },
      soundMixer: { x: 8, y: 4, w: Math.max(minSizes.soundMixer.w, 4), h: Math.max(minSizes.soundMixer.h, 2) }
    }
  })

  const [draggingPanel, setDraggingPanel] = useState(null)
  const [resizingPanel, setResizingPanel] = useState(null)
  const [previewLayouts, setPreviewLayouts] = useState(null)

  // Panel color configurations
  const panelColors = {
    sounds: 'border-blue-500/60',
    tapPad: 'border-green-500/60',
    chopShop: 'border-orange-500/60',
    pianoPlayer: 'border-purple-500/60',
    tracks: 'border-yellow-500/60',
    pianoRoll: 'border-pink-500/60',
    soundMixer: 'border-teal-500/60',
    micRecorder: 'border-red-500/60'
  }

  // Minimum sizes for each panel (grid units)
  const panelMinSizes = {
    sounds: { w: 2, h: 2 },
    tapPad: { w: 3, h: 2 },
    chopShop: { w: 2, h: 2 },
    pianoPlayer: { w: 5, h: 2 },
    tracks: { w: 3, h: 2 },
    pianoRoll: { w: 3, h: 3 },
    soundMixer: { w: 2, h: 2 },
    micRecorder: { w: 3, h: 3 }
  }

  // Project name state
  const [projectName, setProjectName] = useState('Untitled Project')

  // Tap pad loadouts state
  const [tapPadLoadouts, setTapPadLoadouts] = useState([
    { id: 1, name: 'Default', assignments: new Map() }
  ])
  const [currentLoadoutId, setCurrentLoadoutId] = useState(1)

  // Refs for panels
  const soundsRef = useRef(null)
  const tapPadRef = useRef(null)
  const tracksRef = useRef(null)

  // Layout presets state
  const [layoutPresets, setLayoutPresets] = useState(() => {
    const defaultLayout = {
      id: 1,
      name: 'Default',
      panelVisibility: {
        sounds: true,
        tapPad: true,
        pianoPlayer: true,
        tracks: true,
        pianoRoll: true,
        soundMixer: true,
        chopShop: true,
        micRecorder: true
      },
      panelLayouts: {
        sounds: { x: 0, y: 0, w: 3, h: 2 },
        tapPad: { x: 3, y: 0, w: 3, h: 2 },
        chopShop: { x: 6, y: 0, w: 3, h: 2 },
        pianoPlayer: { x: 0, y: 2, w: 6, h: 2 },
        tracks: { x: 6, y: 2, w: 6, h: 2 },
        pianoRoll: { x: 0, y: 4, w: 6, h: 2 },
        soundMixer: { x: 6, y: 4, w: 3, h: 2 },
        micRecorder: { x: 9, y: 4, w: 3, h: 3 }
      }
    }
    return [defaultLayout]
  })
  const [currentLayoutId, setCurrentLayoutId] = useState(1)

  // Apply current layout
  useEffect(() => {
    const layout = layoutPresets.find(l => l.id === currentLayoutId)
    if (layout) {
      setPanelVisibility(layout.panelVisibility)
      setPanelLayouts(layout.panelLayouts)
    }
  }, [currentLayoutId])

  // Save current state to active layout
  useEffect(() => {
    setLayoutPresets(prev => prev.map(layout =>
      layout.id === currentLayoutId
        ? { ...layout, panelVisibility, panelLayouts }
        : layout
    ))
  }, [panelVisibility, panelLayouts, currentLayoutId])

  // Layout management functions
  const saveNewLayout = (name) => {
    const newId = Math.max(...layoutPresets.map(l => l.id), 0) + 1
    const newLayout = {
      id: newId,
      name: name || `Layout ${newId}`,
      panelVisibility: { ...panelVisibility },
      panelLayouts: { ...panelLayouts }
    }
    setLayoutPresets(prev => [...prev, newLayout])
    setCurrentLayoutId(newId)
  }

  const deleteLayout = (layoutId) => {
    if (layoutPresets.length <= 1) return
    setLayoutPresets(prev => prev.filter(l => l.id !== layoutId))
    if (currentLayoutId === layoutId) {
      const remainingLayout = layoutPresets.find(l => l.id !== layoutId)
      if (remainingLayout) setCurrentLayoutId(remainingLayout.id)
    }
  }

  const renameLayout = (layoutId, newName) => {
    setLayoutPresets(prev => prev.map(layout =>
      layout.id === layoutId ? { ...layout, name: newName } : layout
    ))
  }

  const switchLayout = (layoutId) => {
    setCurrentLayoutId(layoutId)
  }

  // Toggle panel visibility
  const togglePanel = (panelName) => {
    setPanelVisibility(prev => ({
      ...prev,
      [panelName]: !prev[panelName]
    }))
  }

  const hidePanel = (panelName) => {
    setPanelVisibility(prev => ({
      ...prev,
      [panelName]: false
    }))
  }

  // Helper function to check if two rectangles overlap
  const rectanglesOverlap = (rect1, rect2) => {
    return !(rect1.x + rect1.w <= rect2.x || 
             rect2.x + rect2.w <= rect1.x || 
             rect1.y + rect1.h <= rect2.y || 
             rect2.y + rect2.h <= rect1.y)
  }

  // Helper to find if a position is free
  const isPositionFree = (testLayout, layouts, excludePanels = []) => {
    for (const [panelName, layout] of Object.entries(layouts)) {
      if (excludePanels.includes(panelName) || !panelVisibility[panelName]) continue
      if (rectanglesOverlap(testLayout, layout)) return false
    }
    return testLayout.x >= 0 && testLayout.y >= 0 && 
           testLayout.x + testLayout.w <= 12 && testLayout.y + testLayout.h <= 8
  }

  // Find the nearest free position for a panel
  const findNearestPosition = (panel, preferredX, preferredY, layouts, excludePanels) => {
    const minSize = panelMinSizes[panel.name] || { w: 2, h: 2 }
    const w = Math.max(minSize.w, panel.w)
    const h = Math.max(minSize.h, panel.h)
    
    // Try positions in expanding circles from preferred location
    const maxSearch = 20
    for (let dist = 0; dist < maxSearch; dist++) {
      for (let dx = -dist; dx <= dist; dx++) {
        for (let dy = -dist; dy <= dist; dy++) {
          if (Math.abs(dx) !== dist && Math.abs(dy) !== dist) continue
          
          const testLayout = {
            x: Math.max(0, Math.min(12 - w, preferredX + dx)),
            y: Math.max(0, Math.min(8 - h, preferredY + dy)),
            w: w,
            h: h
          }
          
          if (isPositionFree(testLayout, layouts, excludePanels)) {
            return testLayout
          }
        }
      }
    }
    
    // If no position found, return a clamped version of preferred position
    return {
      x: Math.max(0, Math.min(12 - w, preferredX)),
      y: Math.max(0, Math.min(8 - h, preferredY)),
      w: w,
      h: h
    }
  }

  // Smart reflow system to prevent overlaps
  const reflowPanels = (changedPanelName, newLayout, allLayouts) => {
    const layouts = { ...allLayouts }
    layouts[changedPanelName] = newLayout
    
    const processed = new Set([changedPanelName])
    const toReposition = []
    
    // Find all panels that overlap with the changed panel
    Object.keys(layouts).forEach(panelName => {
      if (panelName !== changedPanelName && panelVisibility[panelName]) {
        if (rectanglesOverlap(newLayout, layouts[panelName])) {
          toReposition.push(panelName)
        }
      }
    })

    // Reposition overlapping panels
    toReposition.forEach(panelName => {
      const panel = layouts[panelName]
      const minSize = panelMinSizes[panelName] || { w: 2, h: 2 }
      
      // Determine push direction based on relative position
      const changedCenterX = newLayout.x + newLayout.w / 2
      const changedCenterY = newLayout.y + newLayout.h / 2
      const panelCenterX = panel.x + panel.w / 2
      const panelCenterY = panel.y + panel.h / 2
      
      const deltaX = panelCenterX - changedCenterX
      const deltaY = panelCenterY - changedCenterY
      
      // Calculate preferred position (push away from changed panel)
      let preferredX = panel.x
      let preferredY = panel.y
      
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        // Push horizontally
        if (deltaX > 0) {
          preferredX = newLayout.x + newLayout.w
        } else {
          preferredX = newLayout.x - panel.w
        }
      } else {
        // Push vertically
        if (deltaY > 0) {
          preferredY = newLayout.y + newLayout.h
        } else {
          preferredY = newLayout.y - panel.h
        }
      }
      
      // Find nearest free position
      const newPanelLayout = findNearestPosition(
        { ...panel, name: panelName },
        preferredX,
        preferredY,
        layouts,
        [changedPanelName, panelName]
      )
      
      layouts[panelName] = newPanelLayout
    })
    
    // Check for any remaining overlaps and resolve them
    let hasOverlaps = true
    let iterations = 0
    const maxIterations = 10
    
    while (hasOverlaps && iterations < maxIterations) {
      hasOverlaps = false
      iterations++
      
      const panelNames = Object.keys(layouts).filter(name => panelVisibility[name])
      
      for (let i = 0; i < panelNames.length; i++) {
        for (let j = i + 1; j < panelNames.length; j++) {
          const name1 = panelNames[i]
          const name2 = panelNames[j]
          
          if (rectanglesOverlap(layouts[name1], layouts[name2])) {
            hasOverlaps = true
            
            // Move the one that's not the changed panel
            const toMove = name1 === changedPanelName ? name2 : name1
            const panel = layouts[toMove]
            
            // Try to shift in smallest necessary direction
            const other = layouts[name1 === toMove ? name2 : name1]
            
            const shiftRight = other.x + other.w - panel.x
            const shiftLeft = panel.x + panel.w - other.x
            const shiftDown = other.y + other.h - panel.y
            const shiftUp = panel.y + panel.h - other.y
            
            const minShift = Math.min(
              panel.x >= shiftLeft ? shiftLeft : Infinity,
              panel.x + panel.w + shiftRight <= 12 ? shiftRight : Infinity,
              panel.y >= shiftUp ? shiftUp : Infinity,
              panel.y + panel.h + shiftDown <= 8 ? shiftDown : Infinity
            )
            
            if (minShift === shiftRight && panel.x + panel.w + shiftRight <= 12) {
              layouts[toMove] = { ...panel, x: panel.x + shiftRight }
            } else if (minShift === shiftLeft && panel.x >= shiftLeft) {
              layouts[toMove] = { ...panel, x: panel.x - shiftLeft }
            } else if (minShift === shiftDown && panel.y + panel.h + shiftDown <= 8) {
              layouts[toMove] = { ...panel, y: panel.y + shiftDown }
            } else if (minShift === shiftUp && panel.y >= shiftUp) {
              layouts[toMove] = { ...panel, y: panel.y - shiftUp }
            } else {
              // Find any free position
              const newPos = findNearestPosition(
                { ...panel, name: toMove },
                panel.x,
                panel.y,
                layouts,
                [toMove]
              )
              layouts[toMove] = newPos
            }
          }
        }
      }
    }
    
    return layouts
  }

  // Panel dragging functions
  const startPanelDrag = (panelName, e) => {
    if (e.target.closest('.resize-handle')) return
    e.preventDefault()
    const startX = e.clientX
    const startY = e.clientY
    const startLayout = panelLayouts[panelName]
    const containerRect = e.currentTarget.closest('.panels-container')?.getBoundingClientRect()
    if (!containerRect) return

    const cellWidth = containerRect.width / 12
    const cellHeight = containerRect.height / 8

    setDraggingPanel({ panelName, startX, startY, startLayout, cellWidth, cellHeight, rafId: null })
  }

  const handlePanelDrag = (e) => {
    if (!draggingPanel) return

    const { panelName, startX, startY, startLayout, cellWidth, cellHeight, rafId } = draggingPanel

    // Cancel previous animation frame
    if (rafId) cancelAnimationFrame(rafId)

    // Use requestAnimationFrame for smoother dragging
    const newRafId = requestAnimationFrame(() => {
      const dx = e.clientX - startX
      const dy = e.clientY - startY
      // Snap to grid cells
      const gridX = Math.round(dx / cellWidth)
      const gridY = Math.round(dy / cellHeight)
      const newX = Math.max(0, Math.min(12 - startLayout.w, startLayout.x + gridX))
      const newY = Math.max(0, Math.min(8 - startLayout.h, startLayout.y + gridY))

      const newLayout = { ...startLayout, x: newX, y: newY }
      
      // Update dragged panel immediately
      const currentLayouts = { ...panelLayouts, [panelName]: newLayout }
      
      // Apply reflow to get preview for all panels
      const reflowedLayouts = reflowPanels(panelName, newLayout, panelLayouts)

      setPreviewLayouts(reflowedLayouts)

      // Update rafId
      setDraggingPanel(prev => prev ? { ...prev, rafId: null, currentLayout: newLayout } : null)
    })

    setDraggingPanel(prev => prev ? { ...prev, rafId: newRafId } : null)
  }

  const endPanelDrag = () => {
    if (draggingPanel?.rafId) {
      cancelAnimationFrame(draggingPanel.rafId)
    }
    // Apply preview layouts to actual layouts
    if (previewLayouts) {
      setPanelLayouts(previewLayouts)
      setPreviewLayouts(null)
    }
    setDraggingPanel(null)
  }

  // Panel resizing functions
  const startPanelResize = (panelName, direction, e) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startY = e.clientY
    const startLayout = panelLayouts[panelName]
    const containerRect = e.currentTarget.closest('.panels-container')?.getBoundingClientRect()
    if (!containerRect) return

    const cellWidth = containerRect.width / 12
    const cellHeight = containerRect.height / 8

    setResizingPanel({ panelName, direction, startX, startY, startLayout, cellWidth, cellHeight })
  }

  const handlePanelResize = (e) => {
    if (!resizingPanel) return
    const { panelName, direction, startX, startY, startLayout, cellWidth, cellHeight } = resizingPanel
    const dx = e.clientX - startX
    const dy = e.clientY - startY
    const gridDx = Math.round(dx / cellWidth)
    const gridDy = Math.round(dy / cellHeight)

    const minSize = panelMinSizes[panelName] || { w: 1, h: 1 }
    let newLayout = { ...startLayout }

    if (direction.includes('e')) {
      newLayout.w = Math.max(minSize.w, Math.min(12 - newLayout.x, startLayout.w + gridDx))
    }
    if (direction.includes('s')) {
      newLayout.h = Math.max(minSize.h, Math.min(8 - newLayout.y, startLayout.h + gridDy))
    }
    if (direction.includes('w')) {
      const newW = Math.max(minSize.w, startLayout.w - gridDx)
      const newX = Math.max(0, startLayout.x + startLayout.w - newW)
      if (newX + newW <= 12) {
        newLayout.w = newW
        newLayout.x = newX
      }
    }
    if (direction.includes('n')) {
      const newH = Math.max(minSize.h, startLayout.h - gridDy)
      const newY = Math.max(0, startLayout.y + startLayout.h - newH)
      if (newY + newH <= 8) {
        newLayout.h = newH
        newLayout.y = newY
      }
    }

    // Apply reflow to get preview
    const reflowedLayouts = reflowPanels(panelName, newLayout, panelLayouts)
    setPreviewLayouts(reflowedLayouts)
    
    // Store current layout in resizing state
    setResizingPanel(prev => prev ? { ...prev, currentLayout: newLayout } : null)
  }

  const endPanelResize = () => {
    // Apply preview layouts to actual layouts
    if (previewLayouts) {
      setPanelLayouts(previewLayouts)
      setPreviewLayouts(null)
    }
    setResizingPanel(null)
  }

  // Global mouse handlers for drag and resize
  useEffect(() => {
    if (draggingPanel) {
      window.addEventListener('mousemove', handlePanelDrag)
      window.addEventListener('mouseup', endPanelDrag)
      return () => {
        window.removeEventListener('mousemove', handlePanelDrag)
        window.removeEventListener('mouseup', endPanelDrag)
      }
    }
  }, [draggingPanel])

  useEffect(() => {
    if (resizingPanel) {
      window.addEventListener('mousemove', handlePanelResize)
      window.addEventListener('mouseup', endPanelResize)
      return () => {
        window.removeEventListener('mousemove', handlePanelResize)
        window.removeEventListener('mouseup', endPanelResize)
      }
    }
  }, [resizingPanel])

  // Tap pad loadout functions
  const createTapPadLoadout = (name) => {
    const newId = Math.max(...tapPadLoadouts.map(l => l.id)) + 1
    const newLoadout = {
      id: newId,
      name: name || `Loadout ${newId}`,
      assignments: new Map()
    }
    setTapPadLoadouts(prev => [...prev, newLoadout])
    return newId
  }

  const deleteTapPadLoadout = (loadoutId) => {
    if (tapPadLoadouts.length <= 1) return // Keep at least one loadout
    setTapPadLoadouts(prev => prev.filter(l => l.id !== loadoutId))
    if (currentLoadoutId === loadoutId) {
      setCurrentLoadoutId(tapPadLoadouts.find(l => l.id !== loadoutId)?.id || 1)
    }
  }

  const updateTapPadLoadout = (loadoutId, assignments) => {
    setTapPadLoadouts(prev => prev.map(loadout =>
      loadout.id === loadoutId
        ? { ...loadout, assignments: new Map(assignments) }
        : loadout
    ))
  }

  const switchTapPadLoadout = (loadoutId) => {
    setCurrentLoadoutId(loadoutId)
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

  function createSoundFromMixer(soundData) {
    const s = { id: nextIds.current.sound++, name: soundData.name, buffer: soundData.buffer, duration: soundData.duration }
    setSounds((p) => [...p, s])
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

  async function createSoundFromPianoRoll(notes) {
    if (notes.length === 0) return

    try {
      const sampleRate = 44100
      const duration = Math.max(...notes.map(n => n.start + n.duration))
      const bufferLength = Math.ceil((duration + 0.5) * sampleRate)
      const ctx = new OfflineAudioContext(2, bufferLength, sampleRate)

      for (const note of notes) {
        const sound = sounds.find(s => String(s.id) === String(note.soundId))
        if (!sound || !sound.buffer) continue

        const source = ctx.createBufferSource()
        source.buffer = sound.buffer
        source.playbackRate.value = Math.pow(2, note.transposition / 12)
        source.connect(ctx.destination)
        source.start(note.start)
      }

      const rendered = await ctx.startRendering()
      const s = { 
        id: nextIds.current.sound++, 
        name: `Piano Roll Sound (${notes.length} notes)`, 
        buffer: rendered, 
        duration: rendered.duration 
      }
      setSounds((p) => [...p, s])
    } catch (error) {
      alert('Failed to create sound from piano roll.')
    }
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
      const zip = new JSZip()
      
      // Save sounds as separate wav files
      const serializedSounds = await Promise.all(sounds.map(async (sound, index) => {
        const wavBlob = audioBufferToWav(sound.buffer)
        const arrayBuffer = await wavBlob.arrayBuffer()
        zip.file(`sounds/sound_${sound.id}.wav`, arrayBuffer)
        return {
          id: sound.id,
          name: sound.name,
          duration: sound.duration,
          filename: `sound_${sound.id}.wav`
        }
      }))

      // Save clips and track metadata
      const serializedTracks = await Promise.all(tracks.map(async (track) => {
        const serializedClips = await Promise.all(track.clips.map(async (clip) => {
          if (clip.type === 'pianoRoll') {
            return clip
          } else if (clip.buffer) {
            // Save clip audio as separate wav file
            const wavBlob = audioBufferToWav(clip.buffer)
            const arrayBuffer = await wavBlob.arrayBuffer()
            const filename = `clip_${clip.id}.wav`
            zip.file(`clips/${filename}`, arrayBuffer)
            return {
              ...clip,
              buffer: undefined,
              filename
            }
          }
          return clip
        }))
        return {
          ...track,
          clips: serializedClips
        }
      }))

      // Serialize tap pad loadouts (convert Maps to arrays)
      const serializedLoadouts = tapPadLoadouts.map(loadout => ({
        id: loadout.id,
        name: loadout.name,
        assignments: Array.from(loadout.assignments.entries())
      }))

      const projectData = {
        version: '1.0',
        projectName,
        tracks: serializedTracks,
        sounds: serializedSounds,
        layoutPresets,
        currentLayoutId,
        selectedTrackId,
        snapEnabled,
        loop,
        nextIds: nextIds.current,
        tapPadLoadouts: serializedLoadouts,
        currentLoadoutId
      }

      // Add project metadata json
      zip.file('project.json', JSON.stringify(projectData, null, 2))
      
      // Generate and download zip
      const zipBlob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(zipBlob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${projectName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.daw.zip`
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
      input.accept = '.zip,.daw.zip'
      input.onchange = async (e) => {
        const file = e.target.files[0]
        if (!file) return

        // Ensure audio context is initialized
        if (!audioCtxRef.current) {
          const AC = window.AudioContext || window.webkitAudioContext
          audioCtxRef.current = new AC({ latencyHint: 'interactive' })
        }

        // Load and extract zip
        const zip = await JSZip.loadAsync(file)
        
        // Load project metadata
        const projectJson = await zip.file('project.json').async('string')
        const projectData = JSON.parse(projectJson)

        // Validate project data
        if (!projectData.version || !projectData.tracks) {
          throw new Error('Invalid project file')
        }

        // Stop any playing audio
        stopPlayback()

        // Load sounds from zip
        const loadedSounds = await Promise.all(projectData.sounds.map(async (soundData) => {
          const audioFile = zip.file(`sounds/${soundData.filename}`)
          if (!audioFile) {
            console.warn(`Sound file not found: ${soundData.filename}`)
            return null
          }
          const arrayBuffer = await audioFile.async('arraybuffer')
          const audioBuffer = await audioCtxRef.current.decodeAudioData(arrayBuffer)
          return {
            id: soundData.id,
            name: soundData.name,
            buffer: audioBuffer,
            duration: soundData.duration
          }
        }))

        // Load tracks with clips
        const loadedTracks = await Promise.all(projectData.tracks.map(async (track) => {
          const loadedClips = await Promise.all(track.clips.map(async (clip) => {
            if (clip.type === 'pianoRoll') {
              return clip
            } else if (clip.filename) {
              const audioFile = zip.file(`clips/${clip.filename}`)
              if (!audioFile) {
                console.warn(`Clip file not found: ${clip.filename}`)
                return { ...clip, buffer: null }
              }
              const arrayBuffer = await audioFile.async('arraybuffer')
              const audioBuffer = await audioCtxRef.current.decodeAudioData(arrayBuffer)
              return {
                ...clip,
                buffer: audioBuffer,
                filename: undefined
              }
            }
            return clip
          }))
          return {
            ...track,
            clips: loadedClips
          }
        }))

        // Update state
        setProjectName(projectData.projectName || 'Untitled Project')
        setTracks(loadedTracks)
        setSounds(loadedSounds.filter(s => s !== null))
        
        // Restore layout presets or create from legacy data
        if (projectData.layoutPresets && Array.isArray(projectData.layoutPresets)) {
          setLayoutPresets(projectData.layoutPresets)
          const targetLayoutId = projectData.currentLayoutId || projectData.layoutPresets[0]?.id || 1
          setCurrentLayoutId(targetLayoutId)
          
          // Apply the layout immediately
          const targetLayout = projectData.layoutPresets.find(l => l.id === targetLayoutId)
          if (targetLayout) {
            setPanelVisibility(targetLayout.panelVisibility)
            setPanelLayouts(targetLayout.panelLayouts)
          }
        } else {
          // Legacy support: convert old panelVisibility and panelLayouts to layout presets
          const legacyLayout = {
            id: 1,
            name: 'Default',
            panelVisibility: projectData.panelVisibility || {
              sounds: true,
              tapPad: true,
              pianoPlayer: true,
              chopShop: true,
              tracks: true,
              pianoRoll: true,
              soundMixer: true,
              micRecorder: true
            },
            panelLayouts: {}
          }
          
          if (projectData.panelLayouts) {
            const minSizes = {
              sounds: { w: 2, h: 2 },
              tapPad: { w: 3, h: 2 },
              chopShop: { w: 2, h: 2 },
              pianoPlayer: { w: 5, h: 2 },
              tracks: { w: 3, h: 2 },
              pianoRoll: { w: 3, h: 3 },
              soundMixer: { w: 2, h: 2 },
              micRecorder: { w: 3, h: 3 }
            }
            for (const [panelName, layout] of Object.entries(projectData.panelLayouts)) {
              const minSize = minSizes[panelName] || { w: 1, h: 1 }
              legacyLayout.panelLayouts[panelName] = {
                x: layout.x || 0,
                y: layout.y || 0,
                w: Math.max(minSize.w, layout.w || 1),
                h: Math.max(minSize.h, layout.h || 1)
              }
            }
          }
          
          setLayoutPresets([legacyLayout])
          setCurrentLayoutId(1)
          
          // Apply the legacy layout immediately
          setPanelVisibility(legacyLayout.panelVisibility)
          setPanelLayouts(legacyLayout.panelLayouts)
        }
        
        setSelectedTrackId(projectData.selectedTrackId || 1)
        setSnapEnabled(projectData.snapEnabled !== false)
        setLoop(projectData.loop || false)
        nextIds.current = projectData.nextIds || { track: 2, clip: 1, sound: 1 }

        // Restore tap pad loadouts (convert arrays back to Maps)
        if (projectData.tapPadLoadouts) {
          const restoredLoadouts = projectData.tapPadLoadouts.map(loadout => ({
            id: loadout.id,
            name: loadout.name,
            assignments: new Map(loadout.assignments || [])
          }))
          setTapPadLoadouts(restoredLoadouts.length > 0 ? restoredLoadouts : [{ id: 1, name: 'Default', assignments: new Map() }])
          setCurrentLoadoutId(projectData.currentLoadoutId || 1)
        } else {
          // Fallback for old projects without loadouts
          setTapPadLoadouts([{ id: 1, name: 'Default', assignments: new Map() }])
          setCurrentLoadoutId(1)
        }
      }
      input.click()
    } catch (error) {
      alert('Failed to load project: ' + error.message)
    }
  }

  // Calculate grid columns based on panel visibility
  const getGridColumns = () => {
    return `repeat(${5}, 1fr)`
  }

  // Panel wrapper component
  const PanelWrapper = ({ panelName, children, className = '' }) => {
    // Use preview layout if dragging/resizing, otherwise use actual layout
    const isDragging = draggingPanel?.panelName === panelName
    const isResizing = resizingPanel?.panelName === panelName
    
    // For dragged/resized panel, use their current position from state
    // For other panels, use preview if available, otherwise actual layout
    let layout
    if (isDragging && draggingPanel?.currentLayout) {
      layout = draggingPanel.currentLayout
    } else if (isResizing && resizingPanel?.currentLayout) {
      layout = resizingPanel.currentLayout
    } else if (previewLayouts && previewLayouts[panelName]) {
      layout = previewLayouts[panelName]
    } else {
      layout = panelLayouts[panelName]
    }
    
    const minSize = panelMinSizes[panelName] || { w: 1, h: 1 }
    if (!panelVisibility[panelName]) return null

    // Enforce minimum sizes
    const enforcedLayout = {
      ...layout,
      w: Math.max(minSize.w, layout.w),
      h: Math.max(minSize.h, layout.h)
    }

    const borderColor = panelColors[panelName] || 'border-gray-600/50'
    const isDraggingOrResizing = isDragging || isResizing
    const isOtherPanelPreview = previewLayouts && !isDraggingOrResizing

    return (
      <div
        className={`absolute ${className} ${isOtherPanelPreview ? 'transition-all duration-150' : ''}`}
        style={{
          left: `${(enforcedLayout.x / 12) * 100}%`,
          top: `${(enforcedLayout.y / 8) * 100}%`,
          width: `calc(${(enforcedLayout.w / 12) * 100}% - 8px)`,
          height: `calc(${(enforcedLayout.h / 8) * 100}% - 8px)`,
          margin: '4px',
          zIndex: draggingPanel?.panelName === panelName || resizingPanel?.panelName === panelName ? 1000 : 1,
          pointerEvents: 'auto'
        }}
      >
        <div 
          className={`w-full h-full flex flex-col relative ${borderColor} border-4 rounded-lg overflow-hidden bg-gray-900/20 backdrop-blur-sm`}
          onClick={panelName === 'tracks' ? (e) => {
            // Only create track if clicking on the panel background area (not on tracks or other elements)
            if (e.target === e.currentTarget || e.target.classList.contains('backdrop-blur-sm')) {
              addTrack()
            }
          } : undefined}
        >
          {/* Drag handle bar */}
          <div
            className="absolute top-0 left-0 right-0 h-8 cursor-move z-10 hover:bg-gradient-to-b hover:from-white/15 hover:to-transparent transition-all duration-200 flex items-center justify-between px-2"
            onMouseDown={(e) => startPanelDrag(panelName, e)}
            style={{ pointerEvents: 'auto' }}
          >
            <div className="flex space-x-1 opacity-30 hover:opacity-60 transition-opacity">
              <div className="w-1 h-1 bg-white rounded-full"></div>
              <div className="w-1 h-1 bg-white rounded-full"></div>
              <div className="w-1 h-1 bg-white rounded-full"></div>
            </div>
            <button
              className="w-6 h-6 flex items-center justify-center text-white opacity-50 hover:opacity-100 hover:bg-red-500/20 rounded transition-all duration-200"
              onMouseDown={(e) => {
                e.stopPropagation()
              }}
              onClick={(e) => {
                e.stopPropagation()
                hidePanel(panelName)
              }}
              title="Hide panel"
            >
              ×
            </button>
          </div>
          
          {/* Resize handles */}
          <div
            className="resize-handle absolute top-0 right-0 w-4 h-4 cursor-ne-resize z-20 opacity-0 hover:opacity-100 transition-opacity"
            onMouseDown={(e) => startPanelResize(panelName, 'ne', e)}
            style={{ pointerEvents: 'auto' }}
          />
          <div
            className="resize-handle absolute bottom-0 right-0 w-4 h-4 cursor-se-resize z-20 opacity-0 hover:opacity-100 transition-opacity"
            onMouseDown={(e) => startPanelResize(panelName, 'se', e)}
            style={{ pointerEvents: 'auto' }}
          />
          <div
            className="resize-handle absolute bottom-0 left-0 w-4 h-4 cursor-sw-resize z-20 opacity-0 hover:opacity-100 transition-opacity"
            onMouseDown={(e) => startPanelResize(panelName, 'sw', e)}
            style={{ pointerEvents: 'auto' }}
          />
          <div
            className="resize-handle absolute top-0 left-0 w-4 h-4 cursor-nw-resize z-20 opacity-0 hover:opacity-100 transition-opacity"
            onMouseDown={(e) => startPanelResize(panelName, 'nw', e)}
            style={{ pointerEvents: 'auto' }}
          />
          <div
            className="resize-handle absolute top-0 left-4 right-4 h-2 cursor-n-resize z-20 opacity-0 hover:opacity-100 transition-opacity"
            onMouseDown={(e) => startPanelResize(panelName, 'n', e)}
            style={{ pointerEvents: 'auto' }}
          />
          <div
            className="resize-handle absolute bottom-0 left-4 right-4 h-2 cursor-s-resize z-20 opacity-0 hover:opacity-100 transition-opacity"
            onMouseDown={(e) => startPanelResize(panelName, 's', e)}
            style={{ pointerEvents: 'auto' }}
          />
          <div
            className="resize-handle absolute top-4 bottom-4 right-0 w-2 cursor-e-resize z-20 opacity-0 hover:opacity-100 transition-opacity"
            onMouseDown={(e) => startPanelResize(panelName, 'e', e)}
            style={{ pointerEvents: 'auto' }}
          />
          <div
            className="resize-handle absolute top-4 bottom-4 left-0 w-2 cursor-w-resize z-20 opacity-0 hover:opacity-100 transition-opacity"
            onMouseDown={(e) => startPanelResize(panelName, 'w', e)}
            style={{ pointerEvents: 'auto' }}
          />
          
          {/* Panel content */}
          <div className="w-full h-full overflow-hidden pt-8 flex flex-col">
            <div className="flex-1 relative">
              {children}
            </div>
            {panelName === 'tracks' && (
              <div className="flex items-center justify-center py-4 text-gray-500 text-sm opacity-40 border-t border-gray-700/30">
                <span>Click in empty space to add tracks</span>
              </div>
            )}
          </div>
        </div>
      </div>
    )
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
        layoutPresets={layoutPresets}
        currentLayoutId={currentLayoutId}
        onSaveNewLayout={saveNewLayout}
        onDeleteLayout={deleteLayout}
        onRenameLayout={renameLayout}
        onSwitchLayout={switchLayout}
        style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 10000 }}
      />
      <div className="panels-container relative px-4 overflow-hidden py-2 h-[90vh]" 
           style={{
             width: '100vw',
             boxSizing: 'border-box'
           }}>
        
        <PanelWrapper panelName="sounds">
          <Sounds
            sounds={sounds}
            onAddFiles={addSounds}
            onReorderSounds={reorderSounds}
            onRemoveSound={removeSound}
          />
        </PanelWrapper>

        <PanelWrapper panelName="tapPad">
          <TapPad
            sounds={sounds}
            onAddSound={(buffer, name) => {
              const s = { id: nextIds.current.sound++, name, buffer, duration: buffer.duration }
              setSounds((p) => [...p, s])
            }}
            isPlaying={isPlaying}
            decodeFileToBuffer={decodeFileToBuffer}
            loadouts={tapPadLoadouts}
            currentLoadoutId={currentLoadoutId}
            onCreateLoadout={createTapPadLoadout}
            onDeleteLoadout={deleteTapPadLoadout}
            onUpdateLoadout={updateTapPadLoadout}
            onSwitchLoadout={switchTapPadLoadout}
          />
        </PanelWrapper>

        <PanelWrapper panelName="chopShop">
          <ChopShop
            sounds={sounds}
            onAddSounds={(newSounds) => {
              const soundsToAdd = newSounds.map(sound => ({
                id: nextIds.current.sound++,
                ...sound
              }))
              setSounds(prev => [...prev, ...soundsToAdd])
            }}
          />
        </PanelWrapper>

        <PanelWrapper panelName="pianoPlayer">
          <PianoPlayer
            sounds={sounds}
            onAddSound={(buffer, name) => {
              const s = { id: nextIds.current.sound++, name, buffer, duration: buffer.duration }
              setSounds((p) => [...p, s])
            }}
            decodeFileToBuffer={decodeFileToBuffer}
          />
        </PanelWrapper>

        <PanelWrapper panelName="tracks">
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
        </PanelWrapper>

        <PanelWrapper panelName="pianoRoll">
          <PianoRoll
            sounds={sounds}
            onCreateClip={onCreatePianoRollClip}
            onCreateSound={createSoundFromPianoRoll}
            onUpdateClip={updateClip}
            onUpdatePianoRollSound={updatePianoRollSound}
            selectedTrackId={selectedTrackId}
            PPS={PPS}
          />
        </PanelWrapper>

        <PanelWrapper panelName="soundMixer">
          <SoundMixer
            sounds={sounds}
            onCreateSound={createSoundFromMixer}
          />
        </PanelWrapper>

        <PanelWrapper panelName="micRecorder">
          <MicRecorder
            onAddSound={(buffer, name) => {
              const s = { id: nextIds.current.sound++, name, buffer, duration: buffer.duration }
              setSounds((p) => [...p, s])
            }}
            decodeFileToBuffer={decodeFileToBuffer}
          />
        </PanelWrapper>
      </div>
    </>
  )
}

export default App
