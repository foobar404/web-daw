import React, { useRef, useEffect, useState } from 'react';

export function Tracks(props) {
    const {
        projectDuration,
        PPS,
        playHead,
        setPlayHead,
        isPlaying,
        tracks,
        selectedTrackId,
        setSelectedTrackId,
        snapEnabled,
        setSnapEnabled,
        sounds,
        onClipPointerDown,
        secondsToMmSs,
        updateClip,
        updateTrackVolume,
        toggleTrackMute,
        deleteClip,
        deleteTrack,
        duplicateTrack,
        moveTrackUp,
        moveTrackDown,
        handleFilesAdd,
        recordingTrackId,
        stopRecording,
        startRecording,
        addTrack,
        onDropSound,
        moveClipToTrack,
        addClipToTrack,
        className
    } = props

    const scrollRef = useRef(null)
    const [isDraggingTimeline, setIsDraggingTimeline] = useState(false)

    // Cache peaks per AudioBuffer to avoid recomputing for each clip
    const peaksCache = useRef(new WeakMap())
    // Track last drawn width per clip to avoid unnecessary redraws
    const drawnWidth = useRef(new Map())

    // Compute a fixed-size peaks array for an AudioBuffer (runs once per buffer)
    const computePeaks = (buffer, peakCount = 256) => {
        if (!buffer) return null
        const cached = peaksCache.current.get(buffer)
        if (cached) return cached

        try {
            const channelData = buffer.getChannelData(0)
            const blockSize = Math.floor(channelData.length / peakCount)
            const peaks = new Float32Array(peakCount)

            for (let i = 0; i < peakCount; i++) {
                let start = i * blockSize
                let end = Math.min(start + blockSize, channelData.length)
                let max = 0

                // Calculate RMS (Root Mean Square) for better peak representation
                let sumSquares = 0
                let sampleCount = 0

                for (let j = start; j < end; j++) {
                    const sample = channelData[j] || 0
                    sumSquares += sample * sample
                    sampleCount++
                }

                // Use RMS value, but ensure minimum visibility for silent sections
                const rms = sampleCount > 0 ? Math.sqrt(sumSquares / sampleCount) : 0
                peaks[i] = Math.max(rms, 0.001) // Minimum value to ensure visibility
            }

            peaksCache.current.set(buffer, peaks)
            return peaks
        } catch (err) {
            console.warn('computePeaks failed', err)
            return null
        }
    }

    // Draw peaks into a given canvas element (fast, sync)
    const drawPeaksToCanvas = (canvas, peaks, color = 'rgba(255,255,255,0.9)') => {
        if (!canvas || !peaks) return
        const dpr = window.devicePixelRatio || 1
        const width = Math.max(1, canvas.clientWidth)
        const height = Math.max(1, canvas.clientHeight)
        const w = Math.floor(width * dpr)
        const h = Math.floor(height * dpr)
        if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w
            canvas.height = h
        }
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        // Clear canvas
        ctx.clearRect(0, 0, w, h)

        // Create gradient from clip color to white
        const gradient = ctx.createLinearGradient(0, 0, 0, h)
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.95)')    // Top - bright white
        gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.85)')  // Upper mid - slightly transparent
        gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.75)')  // Center - more transparent
        gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.85)')  // Lower mid - slightly transparent
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0.95)')    // Bottom - bright white

        ctx.fillStyle = gradient
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'
        ctx.lineWidth = Math.max(0.5, dpr * 0.5)
        ctx.lineCap = 'round'

        const centerY = h / 2
        const step = peaks.length / width
        const barWidth = Math.max(1, dpr * 1.2) // Slightly thinner bars
        const barSpacing = dpr * 0.2 // Small gap between bars

        // Draw symmetric waveform bars
        for (let x = 0; x < width; x++) {
            const idx = Math.floor(x * step)
            const peak = peaks[Math.min(peaks.length - 1, idx)] || 0

            // Scale peak to canvas height with some margin
            const barHeight = Math.max(1, peak * (h * 0.35))
            const xPos = x * dpr

            // Draw upper bar (positive)
            ctx.fillRect(xPos - barWidth/2, centerY - barHeight, barWidth, barHeight)
            ctx.strokeRect(xPos - barWidth/2, centerY - barHeight, barWidth, barHeight)

            // Draw lower bar (negative) - symmetric
            ctx.fillRect(xPos - barWidth/2, centerY, barWidth, barHeight)
            ctx.strokeRect(xPos - barWidth/2, centerY, barWidth, barHeight)
        }

        // Add subtle center line
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'
        ctx.lineWidth = Math.max(0.5, dpr * 0.3)
        ctx.beginPath()
        ctx.moveTo(0, centerY)
        ctx.lineTo(w, centerY)
        ctx.stroke()
    }

    // Auto-scroll to keep playhead visible during playback
    useEffect(() => {
        if (isPlaying && scrollRef.current) {
            const playheadPixel = playHead * PPS
            const container = scrollRef.current
            const containerWidth = container.clientWidth
            const scrollLeft = container.scrollLeft
            
            // Keep playhead visible with some padding (100px)
            const padding = 100
            const playheadRight = playheadPixel + padding
            const playheadLeft = playheadPixel - padding
            
            if (playheadRight > scrollLeft + containerWidth) {
                // Scroll right to keep playhead visible
                container.scrollLeft = playheadRight - containerWidth
            } else if (playheadLeft < scrollLeft) {
                // Scroll left to keep playhead visible
                container.scrollLeft = Math.max(0, playheadLeft)
            }
        }
    }, [playHead, isPlaying, PPS])

    // Handle timeline dragging
    useEffect(() => {
        const handleMouseMove = (e) => {
            if (!isDraggingTimeline) return
            
            // Find the timeline element
            const timeline = document.querySelector('.relative.h-6.border-b.border-gray-700')
            if (!timeline) return
            
            const rect = timeline.getBoundingClientRect()
            const x = e.clientX - rect.left
            const newTime = Math.max(0, Math.min(projectDuration, x / PPS))
            setPlayHead(newTime)
        }

        const handleMouseUp = () => {
            setIsDraggingTimeline(false)
        }

        if (isDraggingTimeline) {
            document.addEventListener('mousemove', handleMouseMove)
            document.addEventListener('mouseup', handleMouseUp)
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMove)
            document.removeEventListener('mouseup', handleMouseUp)
        }
    }, [isDraggingTimeline, projectDuration, PPS, setPlayHead])

    // Draw canvas waveforms for clips
    useEffect(() => {
        // Clear the drawn width cache when tracks change to ensure redraws
        drawnWidth.current.clear()
        
        // Iterate clips and draw canvases
        tracks.forEach(track => {
            track.clips.forEach(clip => {
                const canvas = document.getElementById(`wavecanvas-${clip.id}`)
                if (!canvas) return

                const width = Math.max(1, Math.floor((clip.duration * PPS)))

                // Use cached peaks (higher resolution) and draw scaled to the canvas width
                const peaks = computePeaks(clip.buffer, 1024) || new Float32Array(1024).fill(0)
                drawPeaksToCanvas(canvas, peaks)
                drawnWidth.current.set(clip.id, width)
            })
        })
    }, [tracks, PPS])

    return (
        <div className={`flex pattern backdrop-brightness-105 text-[var(--color-primary)] shadow-xl rounded-lg ${className || ''}`}>
            {/* Left sidebar with track actions */}
            <div className="w-12 bg-gray-800 border-r border-gray-600 flex flex-col items-center py-2 gap-1">
                <button 
                    onClick={() => addTrack(selectedTrackId)}
                    className="w-8 h-8 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded shadow-md flex items-center justify-center transition-colors" 
                    title="Add Track"
                >
                    +
                </button>
                <div className="h-px bg-gray-600 w-6 my-1"></div>
                <button 
                    onClick={() => selectedTrackId && moveTrackUp(selectedTrackId)}
                    disabled={!selectedTrackId}
                    className="w-8 h-8 text-xs bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:opacity-50 text-white rounded shadow-md flex items-center justify-center transition-colors" 
                    title="Move Track Up"
                >
                    ↑
                </button>
                <button 
                    onClick={() => selectedTrackId && moveTrackDown(selectedTrackId)}
                    disabled={!selectedTrackId}
                    className="w-8 h-8 text-xs bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:opacity-50 text-white rounded shadow-md flex items-center justify-center transition-colors" 
                    title="Move Track Down"
                >
                    ↓
                </button>
                <button 
                    onClick={() => selectedTrackId && duplicateTrack(selectedTrackId)}
                    disabled={!selectedTrackId}
                    className="w-8 h-8 text-xs bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:opacity-50 text-white rounded shadow-md flex items-center justify-center transition-colors" 
                    title="Duplicate Track"
                >
                    ⧉
                </button>
                <button 
                    onClick={() => selectedTrackId && deleteTrack(selectedTrackId)}
                    disabled={!selectedTrackId}
                    className="w-8 h-8 text-xs bg-red-600 hover:bg-red-500 disabled:bg-gray-800 disabled:opacity-50 text-white rounded shadow-md flex items-center justify-center transition-colors" 
                    title="Delete Track"
                >
                    🗑
                </button>
                <div className="h-px bg-gray-600 w-6 my-1"></div>
                <button 
                    onClick={() => {
                        if (recordingTrackId) {
                            stopRecording()
                        } else if (selectedTrackId) {
                            startRecording(selectedTrackId)
                        }
                    }}
                    disabled={!selectedTrackId && !recordingTrackId}
                    className={`w-8 h-8 text-xs rounded shadow-md flex items-center justify-center transition-colors text-white ${
                        recordingTrackId 
                            ? 'bg-red-600 hover:bg-red-500 animate-pulse' 
                            : 'bg-green-600 hover:bg-green-500'
                    } disabled:bg-gray-800 disabled:opacity-50`} 
                    title={recordingTrackId ? "Stop Recording" : "Record Audio"}
                >
                    {recordingTrackId ? '■' : '●'}
                </button>
                <div className="h-px bg-gray-600 w-6 my-1"></div>
                <button 
                    onClick={() => setSnapEnabled(!snapEnabled)}
                    className={`w-8 h-8 text-xs rounded shadow-md flex items-center justify-center transition-colors text-white ${
                        snapEnabled 
                            ? 'bg-purple-600 hover:bg-purple-500' 
                            : 'bg-gray-600 hover:bg-gray-500'
                    }`} 
                    title={snapEnabled ? "Disable Snap (1s)" : "Enable Snap (1s)"}
                >
                    {snapEnabled ? '⊡' : '⊙'}
                </button>
            </div>

            {/* Main tracks area */}
            <div className="flex-1 overflow-auto" ref={scrollRef}
                onWheel={(e) => {
                    e.preventDefault()
                    if (scrollRef.current) {
                        // Convert vertical scroll to horizontal scroll
                        scrollRef.current.scrollLeft += e.deltaY * 2 // Multiply by 2 for faster scrolling
                    }
                }}>
                {/* timeline */}
                <div className={`relative h-6 border-b border-gray-700 flex gap-[10px] select-none ${isDraggingTimeline ? 'cursor-grabbing' : 'cursor-grab'}`}
                    onMouseDown={(e) => {
                        setIsDraggingTimeline(true)
                        // Immediately set the position on mouse down
                        const rect = e.currentTarget.getBoundingClientRect()
                        const x = e.clientX - rect.left
                        const newTime = Math.max(0, Math.min(projectDuration, x / PPS))
                        setPlayHead(newTime)
                    }}
                    onClick={(e) => {
                        // Only handle click if we weren't dragging
                        if (!isDraggingTimeline) {
                            const rect = e.currentTarget.getBoundingClientRect()
                            const x = e.clientX - rect.left
                            const newTime = Math.max(0, Math.min(projectDuration, x / PPS))
                            setPlayHead(newTime)
                        }
                    }}>
                    {Array.from({ length: projectDuration + 1 }).map((_, i) => (
                        <div key={i} className="absolute top-0 h-full w-px bg-gray-600" style={{ left: i * PPS }}>
                            <span className="text-xs text-gray-400" style={{ position: 'absolute', top: 2, left: 4, transform: 'translateX(-50%)' }}>{i}s</span>
                        </div>
                    ))}
                    <div className="absolute top-0 h-full bg-red-600" style={{ left: Math.max(0, Math.min(projectDuration, playHead)) * PPS, width: 2 }} />
                </div>

                {/* tracks */}
                <div className="p-2 relative"
                    onDragOver={(e) => { 
                        e.preventDefault(); 
                        e.dataTransfer.dropEffect = 'copy' 
                    }}
                    onDrop={(e) => {
                        e.preventDefault()
                        const sid = e.dataTransfer.getData('application/x-daw-sound')
                        if (!sid) return
                        const sound = (sounds || []).find(s => String(s.id) === String(sid))
                        if (!sound) return

                        // Check if dropped on an existing track or in open area
                        const target = e.target.closest('[data-track-id]')
                        if (target) {
                            // Dropped on existing track - handled by individual track drop handlers
                            return
                        }

                        // Dropped in open area - create new track and add sound
                        const rect = e.currentTarget.getBoundingClientRect()
                        const x = e.clientX - rect.left
                        const start = Math.max(0, +(x / PPS).toFixed(3))
                        
                        // Create new track
                        const newTrackId = addTrack()
                        
                        // Add sound to the new track after a brief delay to ensure track is created
                        setTimeout(() => {
                            if (onDropSound) onDropSound(newTrackId, sound.id, start)
                        }, 10)
                    }}>
                    {tracks.map((t) => (
                        <div key={t.id} data-track-id={t.id} className={`mb-2 ${selectedTrackId === t.id ? 'bg-blue-900/20 border border-blue-500/50 rounded' : ''}`}
                             onClick={() => setSelectedTrackId(t.id)}>
                            <div className="absolute left-0 top-6 bottom-0 w-full pointer-events-none">
                                {/* Quarter note lines (every 0.5 seconds) */}
                                {Array.from({ length: Math.ceil(projectDuration / 0.5) + 1 }).map((_, i) => (
                                    <div key={`quarter-${i}`} className="absolute top-0 bottom-0 w-px bg-white/15" style={{ left: (i * 0.5) * PPS }} />
                                ))}
                            </div>

                            <div className="flex items-center justify-between px-2 py-1 font-semibold">
                                <div className="text-sm">{t.name}</div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => toggleTrackMute(t.id)}
                                        className={`w-6 h-6 text-xs rounded shadow-md flex items-center justify-center transition-colors ${
                                            t.muted 
                                                ? 'bg-red-600 hover:bg-red-500 text-white' 
                                                : 'bg-gray-600 hover:bg-gray-500 text-gray-300'
                                        }`} 
                                        title={t.muted ? "Unmute Track" : "Mute Track"}
                                    >
                                        {t.muted ? '🔇' : '🔊'}
                                    </button>
                                    <span className="text-xs text-gray-400">Vol</span>
                                    <input
                                        type="range"
                                        min="0"
                                        max="1"
                                        step="0.01"
                                        value={t.volume || 1.0}
                                        onChange={(e) => updateTrackVolume(t.id, parseFloat(e.target.value))}
                                        className="w-16 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer slider"
                                        title={`Volume: ${Math.round((t.volume || 1.0) * 100)}%`}
                                    />
                                    <span className="text-xs text-gray-400 w-8 text-right">{Math.round((t.volume || 1.0) * 100)}%</span>
                                </div>
                            </div>

                            <div className="relative" style={{ height: 72 }}
                                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }}
                                onDrop={(e) => {
                                    e.preventDefault()
                                    const sid = e.dataTransfer.getData('application/x-daw-sound')
                                    if (!sid) return
                                    const sound = (sounds || []).find(s => String(s.id) === String(sid))
                                    if (!sound) return
                                    const rect = e.currentTarget.getBoundingClientRect()
                                    const x = e.clientX - rect.left
                                    const start = Math.max(0, +(x / PPS).toFixed(3))
                                    if (onDropSound) onDropSound(t.id, sound.id, start)
                                }}>
                                {t.clips.map((c) => {
                                    const clipWidth = c.duration * PPS
                                    
                                    return (
                                        <div key={c.id}
                                            onPointerDown={(e) => onClipPointerDown(e, t.id, c.id)}
                                            onContextMenu={(e) => {
                                                e.preventDefault()
                                                deleteClip(t.id, c.id)
                                            }}
                                            onDoubleClick={(e) => {
                                                e.preventDefault()
                                                // Duplicate the clip with a slight offset
                                                const offset = 0.5 // 0.5 second offset
                                                addClipToTrack(t.id, c.buffer, `${c.name} (copy)`, c.start + offset)
                                            }}
                                            className="absolute top-2 bg-blue-500/60 border border-blue-600 rounded-md text-white shadow-lg flex flex-col min-w-[60px] cursor-grab active:cursor-grabbing z-20 overflow-hidden"
                                            style={{ 
                                                left: c.start * PPS, 
                                                width: clipWidth,
                                                height: 56 // Fixed height for consistency
                                            }}
                                            title={`Right-click to delete, Double-click to duplicate - ${c.name}`}>
                                            <div className="flex-1 relative">
                                                <canvas id={`wavecanvas-${c.id}`} className="w-full h-[calc(100%-2rem)]" />
                                                <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between gap-2 px-2 py-1 text-xs bg-black/40">
                                                    <span className="text-[10px] text-gray-300">{secondsToMmSs(c.start)}</span>
                                                    <span className="text-[10px] text-gray-300">{secondsToMmSs(c.duration)}</span>
                                                    <button className="bg-red-600 hover:bg-red-500 text-white px-1 rounded shadow-md text-xs transition-colors" onClick={() => deleteClip(t.id, c.id)}>✕</button>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}