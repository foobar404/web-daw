import React, { useState, useRef, useEffect } from 'react'

export function Sounds(props) {
    const { sounds = [], onAddFiles, onReorderSounds, className } = props
    const [draggedIndex, setDraggedIndex] = useState(null)
    const [dragOverIndex, setDragOverIndex] = useState(null)
    const [gridColumns, setGridColumns] = useState(1)
    const [searchTerm, setSearchTerm] = useState('')

    // Cache peaks per AudioBuffer to avoid recomputing for each sound
    const peaksCache = useRef(new WeakMap())
    const audioCtxRef = useRef(null)

    // Initialize audio context
    const ensureAudioContext = () => {
        if (!audioCtxRef.current) {
            const AC = window.AudioContext || window.webkitAudioContext
            audioCtxRef.current = new AC({ latencyHint: 'interactive' })
        }
        return audioCtxRef.current
    }

    // Play a sound
    const playSound = async (sound) => {
        if (!sound || !sound.buffer) return

        const ctx = ensureAudioContext()
        ctx.resume()

        try {
            const source = ctx.createBufferSource()
            source.buffer = sound.buffer
            source.connect(ctx.destination)
            source.start(0)
        } catch (error) {
            // Failed to play sound
        }
    }

    // Compute a fixed-size peaks array for an AudioBuffer (runs once per buffer)
    const computePeaks = (buffer, peakCount = 128) => {
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

        // Create gradient from sound color to white
        const gradient = ctx.createLinearGradient(0, 0, 0, h)
        gradient.addColorStop(0, 'rgba(59, 130, 246, 0.95)')    // Top - bright blue
        gradient.addColorStop(0.3, 'rgba(59, 130, 246, 0.85)')  // Upper mid - slightly transparent
        gradient.addColorStop(0.5, 'rgba(59, 130, 246, 0.75)')  // Center - more transparent
        gradient.addColorStop(0.7, 'rgba(59, 130, 246, 0.85)')  // Lower mid - slightly transparent
        gradient.addColorStop(1, 'rgba(59, 130, 246, 0.95)')    // Bottom - bright blue

        ctx.fillStyle = gradient
        ctx.lineWidth = Math.max(0.5, dpr * 0.5)
        ctx.lineCap = 'round'

        const centerY = h / 2
        const step = peaks.length / width
        const barWidth = Math.max(1, dpr * 1.2)

        // Draw symmetric waveform bars
        for (let x = 0; x < width; x++) {
            const idx = Math.floor(x * step)
            const peak = peaks[Math.min(peaks.length - 1, idx)] || 0

            // Scale peak to canvas height with some margin
            const barHeight = Math.max(1, peak * (h * 0.35))
            const xPos = x * dpr

            // Draw upper bar (positive)
            ctx.fillRect(xPos - barWidth/2, centerY - barHeight, barWidth, barHeight)

            // Draw lower bar (negative) - symmetric
            ctx.fillRect(xPos - barWidth/2, centerY, barWidth, barHeight)
        }
    }

    // Draw waveforms for sounds
    useEffect(() => {
        sounds.forEach(sound => {
            const canvas = document.getElementById(`soundcanvas-${sound.id}`)
            if (!canvas) return

            const peaks = computePeaks(sound.buffer, 256) || new Float32Array(256).fill(0)
            drawPeaksToCanvas(canvas, peaks)
        })
    }, [sounds])

    // Filter sounds based on search term
    const filteredSounds = sounds.filter(sound =>
        sound.name.toLowerCase().includes(searchTerm.toLowerCase())
    )

    // Drag and drop handlers for reordering
    const handleDragStart = (e, index) => {
        setDraggedIndex(index)
        // Set data for dragging to tracks (existing functionality)
        const sound = sounds[index]
        e.dataTransfer.setData('application/x-daw-sound', String(sound.id))
        e.dataTransfer.effectAllowed = 'move'
    }

    const handleDragOver = (e, index) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setDragOverIndex(index)
    }

    const handleDragLeave = (e) => {
        // Only clear if we're actually leaving the container
        const rect = e.currentTarget.getBoundingClientRect()
        const x = e.clientX
        const y = e.clientY
        if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
            setDragOverIndex(null)
        }
    }

    const handleDrop = (e, dropIndex) => {
        e.preventDefault()
        setDragOverIndex(null)
        
        const draggedSoundId = e.dataTransfer.getData('application/x-daw-sound')
        
        // Check if this is a reorder within sounds (not a drag to track)
        if (draggedIndex !== null && draggedIndex !== dropIndex) {
            if (onReorderSounds) {
                onReorderSounds(draggedIndex, dropIndex)
            }
        }
        
        setDraggedIndex(null)
    }

    const handleDragEnd = () => {
        setDraggedIndex(null)
        setDragOverIndex(null)
    }

    // Handle folder dropping
    const handleFolderDrop = async (e) => {
        e.preventDefault()
        e.stopPropagation()
        
        const items = Array.from(e.dataTransfer.items)
        const audioFiles = []
        
        // Process each dropped item
        for (const item of items) {
            if (item.kind === 'file') {
                const entry = item.webkitGetAsEntry()
                if (entry) {
                    await processEntry(entry, audioFiles)
                }
            }
        }
        
        // Add all found audio files
        if (audioFiles.length > 0 && onAddFiles) {
            onAddFiles(audioFiles)
        }
    }
    
    // Recursively process directory entries to find audio files
    const processEntry = async (entry, audioFiles) => {
        if (entry.isFile) {
            // Check if it's an audio file
            if (entry.name.match(/\.(wav|mp3|ogg|m4a|aac|flac|webm)$/i)) {
                const file = await new Promise(resolve => entry.file(resolve))
                audioFiles.push(file)
            }
        } else if (entry.isDirectory) {
            // Recursively process directory contents
            const dirReader = entry.createReader()
            const entries = await new Promise(resolve => {
                dirReader.readEntries(entries => resolve(entries))
            })
            
            for (const childEntry of entries) {
                await processEntry(childEntry, audioFiles)
            }
        }
    }

    return (
        <section 
            className={`flex flex-col gap-5 backdrop-brightness-105 text-[var(--color-primary)] shadow-xl rounded-lg p-5 pattern min-w-[200px] ${className || ''}`}
            onDragOver={(e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'copy'
            }}
            onDrop={handleFolderDrop}
        >
            <h2 className="text-sm font-semibold">Sounds</h2>
            <label className="text-xs px-2 py-1 bg-gray-800 border border-gray-600 rounded cursor-pointer">Import
                <input type="file" accept="audio/*" multiple onChange={(e) => {
                    const files = Array.from(e.target.files || [])
                    e.target.value = ''
                    if (onAddFiles) onAddFiles(files)
                }} className="hidden" />
            </label>

            {/* Search Box */}
            <input
                type="text"
                placeholder="Search sounds..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onDragOver={(e) => e.stopPropagation()}
                onDrop={(e) => e.stopPropagation()}
                className="text-xs px-2 py-1 bg-gray-800 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:border-[var(--color-primary)]"
            />

            {/* Grid Layout Controls */}
            <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">Layout:</span>
                <div className="flex gap-1">
                    {[1, 2, 3, 4, 5, 6].map((cols) => (
                        <button
                            key={cols}
                            onClick={() => setGridColumns(cols)}
                            className={`px-2 py-1 text-xs rounded border transition-colors ${
                                gridColumns === cols
                                    ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]'
                                    : 'bg-gray-800 text-gray-400 border-gray-600 hover:bg-gray-700'
                            }`}
                            title={`${cols} column${cols > 1 ? 's' : ''}`}
                        >
                            {cols}
                        </button>
                    ))}
                </div>
            </div>

            <div className="max-h-[500px] overflow-auto">
                {filteredSounds.length === 0 ? (
                    <div className="text-xs text-gray-400/50">
                        {sounds.length === 0 
                            ? "No sounds imported. Use Import to add files or drag & drop folders."
                            : "No sounds match your search."
                        }
                    </div>
                ) : (
                    <div className={`${
                        gridColumns === 1 
                            ? 'flex flex-col gap-3' 
                            : `grid gap-3`
                    }`} 
                    style={gridColumns > 1 ? { 
                        gridTemplateColumns: `repeat(${gridColumns}, 1fr)`,
                        gridAutoRows: 'minmax(80px, auto)'
                    } : {}}
                    >
                        {filteredSounds.map((s, filteredIndex) => {
                            // Find the original index in the sounds array
                            const originalIndex = sounds.findIndex(sound => sound.id === s.id)
                            return (
                                <div key={s.id} 
                                    className={`bg-gray-800/50 border border-gray-700 rounded-md text-white shadow-md flex flex-col cursor-grab active:cursor-grabbing overflow-hidden transition-all duration-200 ${
                                        draggedIndex === originalIndex ? 'opacity-50 scale-95' : ''
                                    } ${
                                        dragOverIndex === originalIndex ? 'border-blue-500 bg-blue-900/20' : ''
                                    }`}
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, originalIndex)}
                                    onDragOver={(e) => handleDragOver(e, originalIndex)}
                                    onDragLeave={handleDragLeave}
                                    onDrop={(e) => handleDrop(e, originalIndex)}
                                    onDragEnd={handleDragEnd}
                                    onClick={() => playSound(s)}
                                    title={draggedIndex !== null ? `Drop to reorder - ${s.name}` : `Click to play or drag to add to track - ${s.name}`}
                                >
                                    <div className={`flex-1 relative ${gridColumns === 1 ? 'min-h-[40px]' : 'min-h-[50px]'}`}>
                                        <canvas id={`soundcanvas-${s.id}`} className="w-full h-full" />
                                    </div>
                                    <div className="px-2 py-1 text-xs bg-black/40 border-t border-gray-600">
                                        <div className="truncate font-medium" title={s.name}>{s.name}</div>
                                        <div className="text-gray-400 text-[10px]">{Math.round((s.duration || 0) * 10) / 10}s</div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
        </section>
    )
}

export default Sounds
