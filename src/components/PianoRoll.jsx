import React, { useState, useRef, useEffect } from 'react'

export function PianoRoll(props) {
    const {
        sounds = [],
        onCreateClip,
        onCreateSound,
        onUpdateClip,
        onUpdatePianoRollSound,
        selectedTrackId,
        PPS = 80,
        className
    } = props

    const [selectedSoundId, setSelectedSoundId] = useState(null)
    const [noteDuration, setNoteDuration] = useState(0.0625) // in fractions (0.0625 = sixteenth note)
    const [transposition, setTransposition] = useState(0) // in semitones
    const [isPlaying, setIsPlaying] = useState(false)
    const [currentTime, setCurrentTime] = useState(0)
    const [notes, setNotes] = useState([]) // [{start: number, duration: number, soundId: string, transposition: number}]
    const [gridWidth] = useState(64) // 64 sixteenth notes visible (4 measures)
    const [gridHeight] = useState(25) // 25 semitones (2 octaves + 1 note)
    const [isDragging, setIsDragging] = useState(false)
    const [loop, setLoop] = useState(false)
    const playheadRef = useRef(null)
    const audioCtxRef = useRef(null)
    const prevTranspositionRef = useRef(0)
    const activeSourcesRef = useRef([])
    const animationFrameRef = useRef(null)
    const startTimeRef = useRef(null)

    // Note durations as fractions of whole note
    const noteDurations = [
        { name: 'Whole', value: 1.0, label: '𝅝' },
        { name: 'Half', value: 0.5, label: '𝅗𝅥' },
        { name: 'Quarter', value: 0.25, label: '♩' },
        { name: 'Eighth', value: 0.125, label: '♪' },
        { name: 'Sixteenth', value: 0.0625, label: '♬' }
    ]

    // Initialize audio context
    const ensureAudioContext = () => {
        if (!audioCtxRef.current) {
            const AC = window.AudioContext || window.webkitAudioContext
            audioCtxRef.current = new AC({ latencyHint: 'interactive' })
        }
        return audioCtxRef.current
    }

    // Transpose audio buffer by semitones using playback rate
    const getPlaybackRate = (semitones) => {
        return Math.pow(2, semitones / 12)
    }

    // Create a note clip from selected sound
    const createNoteClip = async (startBeat, duration, soundId, transposition) => {
        const sound = sounds.find(s => String(s.id) === String(soundId))
        if (!sound || !sound.buffer) return null

        try {
            // For piano roll clips, we'll store the transposition info
            // and apply it during playback using playbackRate
            const clip = {
                id: Date.now() + Math.random(),
                name: `${sound.name} (${transposition > 0 ? '+' : ''}${transposition}st)`,
                buffer: sound.buffer,
                duration: duration,
                start: startBeat,
                soundId: soundId,
                transposition: transposition
            }

            return clip
        } catch (error) {
            return null
        }
    }

    // Add note to piano roll (with duplicate prevention)
    const addNote = async (beat, semitone) => {
        let soundId = selectedSoundId
        if (!soundId && sounds.length > 0) {
            soundId = sounds[0].id
            setSelectedSoundId(soundId)
        }
        if (!soundId) return

        const noteTransposition = semitone - 12 + transposition // Center at middle C-ish + global transposition
        
        // Check if note already exists at this position
        const existingNoteIndex = notes.findIndex(note => 
            note.start === beat && note.semitone === semitone
        )
        
        if (existingNoteIndex !== -1) return // Don't add duplicate notes

        const note = await createNoteClip(beat, noteDuration, soundId, noteTransposition)

        if (note) {
            setNotes(prev => [...prev, {
                ...note,
                semitone,
                transposition: noteTransposition
            }])
        }
    }

    // Drag handlers for click-and-drag note placement
    const handleMouseDown = (beat, semitone) => {
        setIsDragging(true)
        addNote(beat, semitone)
    }

    const handleMouseEnter = (beat, semitone) => {
        if (isDragging) {
            addNote(beat, semitone)
        }
    }

    const handleMouseUp = () => {
        setIsDragging(false)
    }

    // Remove note from piano roll
    const removeNote = (noteIndex) => {
        setNotes(prev => prev.filter((_, i) => i !== noteIndex))
    }

    // Global mouse up handler for drag operations
    useEffect(() => {
        const handleGlobalMouseUp = () => {
            setIsDragging(false)
        }

        document.addEventListener('mouseup', handleGlobalMouseUp)
        return () => document.removeEventListener('mouseup', handleGlobalMouseUp)
    }, [])

    // Update piano roll clips when selected sound changes
    useEffect(() => {
        if (selectedSoundId && onUpdatePianoRollSound) {
            onUpdatePianoRollSound(selectedSoundId)
        }
    }, [selectedSoundId, onUpdatePianoRollSound])

    // Update all notes to use the new selected sound
    useEffect(() => {
        if (selectedSoundId) {
            setNotes(prev => prev.map(note => ({ ...note, soundId: selectedSoundId })))
        }
    }, [selectedSoundId])

    // Auto-select first sound if none selected
    useEffect(() => {
        if (!selectedSoundId && sounds.length > 0) {
            setSelectedSoundId(sounds[0].id)
        }
    }, [sounds, selectedSoundId])

    // Update all notes' transposition when global transposition changes
    useEffect(() => {
        const delta = transposition - prevTranspositionRef.current
        if (delta !== 0) {
            setNotes(prev => prev.map(note => ({
                ...note,
                transposition: note.transposition + delta
            })))
            prevTranspositionRef.current = transposition
        }
    }, [transposition])

    // Play preview of a note
    const playNotePreview = async (semitone) => {
        let soundId = selectedSoundId
        if (!soundId && sounds.length > 0) {
            soundId = sounds[0].id
            setSelectedSoundId(soundId)
        }
        if (!soundId) return

        const sound = sounds.find(s => String(s.id) === String(soundId))
        if (!sound || !sound.buffer) return

        const ctx = ensureAudioContext()
        ctx.resume()

        try {
            const source = ctx.createBufferSource()
            source.buffer = sound.buffer
            source.playbackRate.value = getPlaybackRate(semitone - 12 + transposition) // Center at middle C-ish + global transposition
            source.connect(ctx.destination)
            source.start(0)
        } catch (error) {
            // Failed to play note preview
        }
    }

    // Generate final sound from all notes
    const generateSound = async () => {
        if (notes.length === 0) return

        if (onCreateSound) {
            await onCreateSound(notes)
        }
    }

    // Play the current sequence
    const playSequence = async () => {
        if (isPlaying) {
            // Stop playback
            setIsPlaying(false)
            setCurrentTime(0)
            
            // Stop all active audio sources
            for (const source of activeSourcesRef.current) {
                try { source.stop(0) } catch (e) {}
            }
            activeSourcesRef.current = []
            
            // Cancel animation frame
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current)
                animationFrameRef.current = null
            }
            return
        }

        setIsPlaying(true)
        const ctx = ensureAudioContext()
        ctx.resume()

        startTimeRef.current = ctx.currentTime
        activeSourcesRef.current = []

        // Calculate total duration
        const totalDuration = notes.length > 0 ? Math.max(...notes.map(n => n.start + n.duration)) : 0

        for (const note of notes) {
            const sound = sounds.find(s => String(s.id) === String(note.soundId))
            if (!sound || !sound.buffer) continue

            try {
                const source = ctx.createBufferSource()
                source.buffer = sound.buffer
                source.playbackRate.value = getPlaybackRate(note.transposition)
                source.connect(ctx.destination)
                source.start(startTimeRef.current + note.start)
                activeSourcesRef.current.push(source)
            } catch (error) {
                // Failed to play note
            }
        }

        // Animate playhead
        const animate = () => {
            const elapsed = ctx.currentTime - startTimeRef.current
            setCurrentTime(elapsed)

            if (elapsed < totalDuration) {
                animationFrameRef.current = requestAnimationFrame(animate)
            } else {
                if (loop) {
                    // Loop back to start
                    startTimeRef.current = ctx.currentTime
                    setCurrentTime(0)
                    // Restart all notes
                    activeSourcesRef.current = []
                    for (const note of notes) {
                        const sound = sounds.find(s => String(s.id) === String(note.soundId))
                        if (!sound || !sound.buffer) continue

                        try {
                            const source = ctx.createBufferSource()
                            source.buffer = sound.buffer
                            source.playbackRate.value = getPlaybackRate(note.transposition)
                            source.connect(ctx.destination)
                            source.start(ctx.currentTime + note.start)
                            activeSourcesRef.current.push(source)
                        } catch (error) {
                            // Failed to play note
                        }
                    }
                    animationFrameRef.current = requestAnimationFrame(animate)
                } else {
                    // Sequence finished - auto stop
                    setIsPlaying(false)
                    setCurrentTime(0)
                    activeSourcesRef.current = []
                    animationFrameRef.current = null
                }
            }
        }

        animationFrameRef.current = requestAnimationFrame(animate)
    }

    return (
        <section className={`flex flex-col h-full pattern backdrop-brightness-105 text-[var(--color-primary)] shadow-xl rounded-lg overflow-hidden ${className || ''}`}>
            <div className="p-4 border-b border-gray-600">
                <h2 className="text-lg font-semibold">Piano Roll</h2>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {/* Controls */}
                <div className="flex flex-col gap-2">
                    {/* Sound Selection */}
                    <div className="flex items-center gap-2">
                        <label className="text-xs font-medium text-gray-300">Sound:</label>
                        <select
                            value={selectedSoundId || ''}
                            onChange={(e) => setSelectedSoundId(e.target.value)}
                            onDragOver={(e) => {
                                e.preventDefault()
                                e.dataTransfer.dropEffect = 'copy'
                            }}
                            onDrop={(e) => {
                                e.preventDefault()
                                const soundId = e.dataTransfer.getData('application/x-daw-sound')
                                if (soundId) {
                                    setSelectedSoundId(soundId)
                                }
                            }}
                            className="flex-1 bg-gray-800/80 border border-gray-600 rounded px-2 py-1 text-xs text-white focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-all duration-200 backdrop-blur-sm"
                        >
                            <option value="" className="bg-gray-800">Select a sound...</option>
                            {sounds.map(sound => (
                                <option key={sound.id} value={sound.id} className="bg-gray-800">
                                    {sound.name} ({Math.round(sound.duration * 10) / 10}s)
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Note Duration & Transposition in one row */}
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                            <label className="text-xs font-medium text-gray-300">Duration:</label>
                            <div className="flex gap-0.5 bg-gray-800/50 p-0.5 rounded backdrop-blur-sm">
                                {noteDurations.map(duration => (
                                    <button
                                        key={duration.value}
                                        onClick={() => setNoteDuration(duration.value)}
                                        className={`px-2 py-1 text-xs font-medium rounded border transition-all duration-200 ${
                                            noteDuration === duration.value
                                                ? 'bg-[var(--color-primary)] border-[var(--color-primary)] text-white shadow-sm'
                                                : 'bg-gray-700/70 border-gray-600 text-gray-300 hover:bg-gray-600'
                                        }`}
                                        title={duration.name}
                                    >
                                        {duration.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="flex items-center gap-2 flex-1">
                            <label className="text-xs font-medium text-gray-300">Transpose:</label>
                            <input
                                type="range"
                                min="-24"
                                max="24"
                                value={transposition}
                                onChange={(e) => setTransposition(parseInt(e.target.value))}
                                className="flex-1 accent-[var(--color-primary)]"
                            />
                            <span className={`text-xs font-medium px-1.5 py-0.5 rounded border min-w-[2.5rem] text-center transition-all duration-200 ${
                                transposition === 0 
                                    ? 'bg-gray-700 border-gray-600 text-gray-300' 
                                    : transposition > 0 
                                        ? 'bg-green-900/50 border-green-600 text-green-300' 
                                        : 'bg-red-900/50 border-red-600 text-red-300'
                            }`}>
                                {transposition > 0 ? '+' : ''}{transposition}
                            </span>
                        </div>
                    </div>

                    {/* Action Buttons - Compact */}
                    <div className="flex gap-1.5">
                        <button
                            onClick={() => setLoop(!loop)}
                            className={`px-3 py-1.5 text-xs font-medium rounded border transition-all duration-200 ${
                                loop
                                    ? 'bg-orange-600/90 border-orange-500 text-white hover:bg-orange-500'
                                    : 'bg-gray-600/90 border-gray-500 text-white hover:bg-gray-500'
                            }`}
                        >
                            🔄 Loop
                        </button>
                        <button
                            onClick={playSequence}
                            disabled={notes.length === 0}
                            className={`px-3 py-1.5 text-xs font-medium rounded border transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${
                                isPlaying
                                    ? 'bg-red-600/90 border-red-500 text-white hover:bg-red-500'
                                    : 'bg-green-600/90 border-green-500 text-white hover:bg-green-500'
                            }`}
                        >
                            {isPlaying ? '⏹️ Stop' : '▶️ Play'}
                        </button>
                        <button
                            onClick={generateSound}
                            disabled={notes.length === 0}
                            className="flex-1 px-3 py-1.5 text-xs font-medium bg-[var(--color-primary)]/90 border border-[var(--color-primary)] text-white rounded hover:bg-[var(--color-primary)] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            🎵 Create Sound ({notes.length})
                        </button>
                        <button
                            onClick={() => setNotes([])}
                            disabled={notes.length === 0}
                            className="px-3 py-1.5 text-xs font-medium bg-gray-700/90 border border-gray-600 text-gray-300 rounded hover:bg-gray-600 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            🗑️ Clear
                        </button>
                    </div>
                </div>                {/* Piano Roll Grid */}
                <div className="border border-gray-600 rounded overflow-auto bg-gray-900">
                    <div className="flex min-w-max">
                        {/* Note labels (left side) */}
                        <div className="w-12 bg-gray-800 border-r border-gray-600">
                            {Array.from({ length: gridHeight }, (_, i) => {
                                const semitone = gridHeight - 1 - i // Reverse order so higher notes are at top
                                const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
                                const octave = Math.floor(semitone / 12) + 4
                                const noteName = noteNames[semitone % 12]
                                const isBlackKey = noteName.includes('#')

                                return (
                                    <div
                                        key={i}
                                        className={`h-8 border-b border-gray-700 flex items-center justify-center text-xs cursor-pointer ${isBlackKey ? 'bg-gray-700 text-gray-300' : 'bg-gray-800 text-gray-200'
                                            }`}
                                        onClick={() => playNotePreview(semitone)}
                                        title={`${noteName}${octave}`}
                                    >
                                        {noteName}{octave}
                                    </div>
                                )
                            })}
                        </div>

                        {/* Grid (main area) */}
                        <div className="flex-1 relative">
                            {/* Time labels (top) */}
                            <div className="h-6 bg-gray-800 border-b border-gray-600 flex">
                                {Array.from({ length: gridWidth / 16 }, (_, i) => (
                                    <div key={i} className="flex-1 border-r border-gray-700 flex items-center justify-center text-xs text-gray-400 min-w-[384px]">
                                        {i + 1}
                                    </div>
                                ))}
                            </div>

                            {/* Grid cells */}
                            <div className="relative" onMouseUp={handleMouseUp} onMouseLeave={() => setIsDragging(false)}>
                                {Array.from({ length: gridHeight }, (_, row) => (
                                    <div key={row} className="flex">
                                        {Array.from({ length: gridWidth }, (_, col) => {
                                            const semitone = gridHeight - 1 - row
                                            const beat = col * 0.0625 // 16th note resolution (1/16 of whole note)
                                            const isBlackKey = ['C#', 'D#', 'F#', 'G#', 'A#'].includes(
                                                ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][semitone % 12]
                                            )
                                            const isBeat = col % 4 === 0

                                            return (
                                                <div
                                                    key={col}
                                                    className={`h-8 w-6 border-r border-b cursor-pointer select-none ${isBlackKey ? 'bg-gray-700' : 'bg-gray-800'
                                                        } ${isBeat ? 'border-gray-500' : 'border-gray-700'
                                                        } hover:bg-blue-900/30 ${isDragging ? 'hover:bg-blue-600/50' : ''}`}
                                                    onMouseDown={() => handleMouseDown(beat, semitone)}
                                                    onMouseEnter={() => handleMouseEnter(beat, semitone)}
                                                />
                                            )
                                        })}
                                    </div>
                                ))}

                                {/* Notes */}
                                {notes.map((note, index) => (
                                    <div
                                        key={index}
                                        className="absolute bg-blue-600 border border-blue-400 rounded cursor-pointer hover:bg-blue-500"
                                        style={{
                                            left: (note.start / 0.0625) * 24, // Convert to pixels (24px per 16th note)
                                            top: ((gridHeight - 1 - note.semitone) * 32), // Convert semitone to pixels
                                            width: Math.max(24, (note.duration / 0.0625) * 24), // Convert duration to pixels
                                            height: 28,
                                            zIndex: 10
                                        }}
                                        onContextMenu={(e) => {
                                            e.preventDefault()
                                            removeNote(index)
                                        }}
                                        title={`Right-click to remove - ${note.name}`}
                                    />
                                ))}

                                {/* Playhead */}
                                {isPlaying && (
                                    <div
                                        ref={playheadRef}
                                        className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 pointer-events-none"
                                        style={{
                                            left: (currentTime / 0.0625) * 24
                                        }}
                                    />
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    )
}

export default PianoRoll