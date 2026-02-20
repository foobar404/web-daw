import React, { useState, useRef, useEffect } from 'react'
import { MdPiano } from 'react-icons/md'

// Piano keyboard mapping (laid out like a piano)
// Centered at middle C (0 semitones = original sound)
// White keys: z x c v b n m (lower) / q w e r t y u i (upper)
// Black keys: s d g h j (lower) / 2 3 5 6 7 (upper)
const keyMap = {
    // Lower octave (-12 to -1)
    'z': -12,  // C (white)
    's': -11,  // C# (black)
    'x': -10,  // D (white)
    'd': -9,   // D# (black)
    'c': -8,   // E (white)
    'v': -7,   // F (white)
    'g': -6,   // F# (black)
    'b': -5,   // G (white)
    'h': -4,   // G# (black)
    'n': -3,   // A (white)
    'j': -2,   // A# (black)
    'm': -1,   // B (white)
    // Upper octave (0 to 12)
    'q': 0,    // C (middle C - white)
    '2': 1,    // C# (black)
    'w': 2,    // D (white)
    '3': 3,    // D# (black)
    'e': 4,    // E (white)
    'r': 5,    // F (white)
    '5': 6,    // F# (black)
    't': 7,    // G (white)
    '6': 8,    // G# (black)
    'y': 9,    // A (white)
    '7': 10,   // A# (black)
    'u': 11,   // B (white)
    'i': 12    // C (white)
}

// Note names for display
const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

// Calculate playback rate for semitone offset (for pitch shifting)
const semitoneToRate = (semitones) => Math.pow(2, semitones / 12)

export function PianoPlayer(props) {
    const { sounds = [], onAddSound, decodeFileToBuffer } = props
    const [selectedSoundId, setSelectedSoundId] = useState(null)
    const [isRecording, setIsRecording] = useState(false)
    const [noteSequence, setNoteSequence] = useState([])
    const [recordingStartTime, setRecordingStartTime] = useState(null)
    const [octaveOffset, setOctaveOffset] = useState(0) // For shifting the whole keyboard
    const [activeKeys, setActiveKeys] = useState(new Set())
    const audioCtxRef = useRef(null)
    const pressedKeysRef = useRef(new Set()) // Track which keyboard keys are currently pressed
    const activeSourcesRef = useRef(new Map()) // Track active looping sources per key
    const recordingIntervalsRef = useRef(new Map()) // Track recording intervals for held keys

    // Get selected sound
    const selectedSound = sounds.find(s => String(s.id) === String(selectedSoundId))

    // Initialize audio context
    const ensureAudioContext = () => {
        if (!audioCtxRef.current) {
            const AC = window.AudioContext || window.webkitAudioContext
            audioCtxRef.current = new AC({ latencyHint: 'interactive' })
        }
        return audioCtxRef.current
    }

    // Start recording
    const startRecording = () => {
        if (isRecording || !selectedSound) return
        setNoteSequence([])
        setRecordingStartTime(performance.now())
        setIsRecording(true)
    }

    // Stop recording
    const stopRecording = async () => {
        if (!isRecording) return
        setIsRecording(false)
        
        // Clear all recording intervals
        recordingIntervalsRef.current.forEach(intervalId => clearInterval(intervalId))
        recordingIntervalsRef.current.clear()

        if (noteSequence.length === 0) {
            setNoteSequence([])
            setRecordingStartTime(null)
            return
        }

        try {
            // Calculate total duration
            const totalDuration = (performance.now() - recordingStartTime) / 1000
            const maxSoundDuration = selectedSound.buffer.duration
            
            const sampleRate = 44100
            const bufferLength = Math.ceil((totalDuration + maxSoundDuration * 2) * sampleRate)
            const offlineCtx = new OfflineAudioContext(2, bufferLength, sampleRate)

            // Schedule all notes at their exact timestamps with pitch shifting
            for (const note of noteSequence) {
                if (!selectedSound || !selectedSound.buffer) continue

                const source = offlineCtx.createBufferSource()
                source.buffer = selectedSound.buffer
                source.playbackRate.value = semitoneToRate(note.semitone)
                source.connect(offlineCtx.destination)
                const startTime = (note.timestamp - recordingStartTime) / 1000
                source.start(startTime)
            }

            const renderedBuffer = await offlineCtx.startRendering()

            // Create a name for the recording
            const now = new Date()
            const dateTimeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`
            const recordingName = `piano-${selectedSound.name.split('.')[0]}-${dateTimeStr}.wav`

            // Add to sounds library
            if (onAddSound) {
                onAddSound(renderedBuffer, recordingName)
            }
        } catch (error) {
            console.error('Failed to process recording:', error)
            alert('Failed to create recording.')
        }

        setNoteSequence([])
        setRecordingStartTime(null)
    }

    // Play a note with specified semitone offset (for mouse clicks - one-shot)
    const playNote = (semitone, keyboardKey) => {
        if (!selectedSound || !selectedSound.buffer) return

        // Add to active keys for visual feedback
        setActiveKeys(prev => new Set([...prev, keyboardKey]))
        setTimeout(() => {
            setActiveKeys(prev => {
                const next = new Set(prev)
                next.delete(keyboardKey)
                return next
            })
        }, 100)

        // Record note if recording
        if (isRecording && recordingStartTime) {
            setNoteSequence(prev => [...prev, {
                semitone: semitone + (octaveOffset * 12),
                timestamp: performance.now()
            }])
        }

        const ctx = ensureAudioContext()
        ctx.resume()

        try {
            const source = ctx.createBufferSource()
            source.buffer = selectedSound.buffer
            source.playbackRate.value = semitoneToRate(semitone + (octaveOffset * 12))
            source.connect(ctx.destination)
            source.start(0)
        } catch (error) {
            console.error('Failed to play note:', error)
        }
    }

    // Start looping a note (for keyboard hold)
    const startLoopingNote = (semitone, keyboardKey) => {
        if (!selectedSound || !selectedSound.buffer) return
        
        // Stop existing source for this key if any
        stopNote(keyboardKey)

        // Add to active keys for visual feedback
        setActiveKeys(prev => new Set([...prev, keyboardKey]))

        // Record note if recording - record continuously while held
        if (isRecording && recordingStartTime) {
            // Record initial note
            setNoteSequence(prev => [...prev, {
                semitone: semitone + (octaveOffset * 12),
                timestamp: performance.now()
            }])
            
            // Set up interval to record continuously (every 100ms)
            const intervalId = setInterval(() => {
                if (isRecording && recordingStartTime) {
                    setNoteSequence(prev => [...prev, {
                        semitone: semitone + (octaveOffset * 12),
                        timestamp: performance.now()
                    }])
                }
            }, 100)
            
            recordingIntervalsRef.current.set(keyboardKey, intervalId)
        }

        const ctx = ensureAudioContext()
        ctx.resume()

        try {
            const source = ctx.createBufferSource()
            source.buffer = selectedSound.buffer
            source.playbackRate.value = semitoneToRate(semitone + (octaveOffset * 12))
            source.loop = true // Enable looping
            source.connect(ctx.destination)
            source.start(0)
            
            // Store the source so we can stop it later
            activeSourcesRef.current.set(keyboardKey, source)
        } catch (error) {
            console.error('Failed to play looping note:', error)
        }
    }

    // Stop a note
    const stopNote = (keyboardKey) => {
        const source = activeSourcesRef.current.get(keyboardKey)
        if (source) {
            try {
                source.stop()
            } catch (e) {
                // Source may already be stopped
            }
            activeSourcesRef.current.delete(keyboardKey)
        }
        
        // Clear recording interval if exists
        const intervalId = recordingIntervalsRef.current.get(keyboardKey)
        if (intervalId) {
            clearInterval(intervalId)
            recordingIntervalsRef.current.delete(keyboardKey)
        }
        
        // Remove from active keys
        setActiveKeys(prev => {
            const next = new Set(prev)
            next.delete(keyboardKey)
            return next
        })
    }

    // Handle keyboard input
    useEffect(() => {
        const handleKeyDown = (e) => {
            // Don't capture if typing in input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
            
            // Prevent repeat events
            if (pressedKeysRef.current.has(e.key.toLowerCase())) return

            const semitone = keyMap[e.key.toLowerCase()]
            if (semitone !== undefined) {
                e.preventDefault()
                pressedKeysRef.current.add(e.key.toLowerCase())
                startLoopingNote(semitone, e.key.toLowerCase())
            }
        }

        const handleKeyUp = (e) => {
            const key = e.key.toLowerCase()
            pressedKeysRef.current.delete(key)
            
            // Stop the looping note
            const semitone = keyMap[key]
            if (semitone !== undefined) {
                stopNote(key)
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        window.addEventListener('keyup', handleKeyUp)
        return () => {
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('keyup', handleKeyUp)
            
            // Clean up any active sources and intervals when component unmounts
            activeSourcesRef.current.forEach(source => {
                try { source.stop() } catch (e) {}
            })
            activeSourcesRef.current.clear()
            
            recordingIntervalsRef.current.forEach(intervalId => clearInterval(intervalId))
            recordingIntervalsRef.current.clear()
        }
    }, [selectedSound, isRecording, octaveOffset])

    // Handle sound drag and drop
    const handleDragOver = (e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
    }

    const handleDrop = (e) => {
        e.preventDefault()
        const soundId = e.dataTransfer.getData('application/x-daw-sound')
        if (soundId) {
            setSelectedSoundId(soundId)
        }
    }

    // Render piano keys with visual layout
    const renderPianoKeys = () => {
        // White keys in sequence (C D E F G A B pattern)
        const whiteKeyPattern = [0, 2, 4, 5, 7, 9, 11]
        const blackKeyPattern = [1, 3, null, 6, 8, 10, null] // null = no black key in that position
        
        const totalOctaves = 2
        const keysPerOctave = 12
        
        return (
            <div className="relative h-32 flex">
                {/* White keys */}
                <div className="flex">
                    {Array.from({ length: totalOctaves * 7 + 1 }).map((_, idx) => {
                        const octave = Math.floor(idx / 7)
                        const noteInOctave = idx % 7
                        const semitone = octave * 12 + whiteKeyPattern[noteInOctave] - 12
                        const keyboardKey = Object.keys(keyMap).find(k => keyMap[k] === semitone)
                        const isActive = keyboardKey && activeKeys.has(keyboardKey)
                        
                        return (
                            <button
                                key={`white-${idx}`}
                                onClick={() => keyboardKey && playNote(semitone, keyboardKey)}
                                className={`relative w-10 h-full border border-gray-700 transition-all ${
                                    isActive
                                        ? 'bg-blue-400'
                                        : 'bg-white hover:bg-gray-100'
                                }`}
                                title={`${noteNames[((semitone % 12) + 12) % 12]}${Math.floor(semitone / 12)} (${keyboardKey?.toUpperCase() || ''})`}
                            >
                                <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px] text-gray-600">
                                    {keyboardKey?.toUpperCase()}
                                </span>
                            </button>
                        )
                    })}
                </div>
                
                {/* Black keys (positioned absolutely over white keys) */}
                <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
                    <div className="relative h-full flex">
                        {Array.from({ length: totalOctaves * 7 }).map((_, idx) => {
                            const octave = Math.floor(idx / 7)
                            const noteInOctave = idx % 7
                            const blackKeySemitone = blackKeyPattern[noteInOctave]
                            
                            if (blackKeySemitone === null) {
                                return <div key={`black-${idx}`} className="w-10" />
                            }
                            
                            const semitone = octave * 12 + blackKeySemitone - 12
                            const keyboardKey = Object.keys(keyMap).find(k => keyMap[k] === semitone)
                            const isActive = keyboardKey && activeKeys.has(keyboardKey)
                            
                            return (
                                <div key={`black-${idx}`} className="relative w-10">
                                    <button
                                        onClick={() => keyboardKey && playNote(semitone, keyboardKey)}
                                        className={`pointer-events-auto absolute right-0 translate-x-1/2 w-6 h-20 border border-gray-900 rounded-b transition-all z-10 ${
                                            isActive
                                                ? 'bg-blue-600'
                                                : 'bg-gray-900 hover:bg-gray-700'
                                        }`}
                                        title={`${noteNames[((semitone % 12) + 12) % 12]}${Math.floor(semitone / 12)} (${keyboardKey?.toUpperCase() || ''})`}
                                    >
                                        <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[8px] text-white">
                                            {keyboardKey?.toUpperCase()}
                                        </span>
                                    </button>
                                </div>
                            )
                        })}
                    </div>
                </div>
            </div>
        )
    }

    return (
        <section className="flex flex-col gap-3 backdrop-brightness-105 text-[var(--color-primary)] shadow-xl rounded-lg p-4 pattern min-h-0 overflow-hidden">
            <div className="bg-purple-600/20 border-b border-purple-500/30 px-4 py-3 rounded-t-lg -mx-4 -mt-4 mb-1">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold flex items-center gap-2 text-purple-400">
                        <MdPiano className="w-4 h-4" />
                        Piano Player
                    </h2>
                    <div className="flex items-center gap-2">
                    {/* Octave shift controls */}
                    <div className="flex items-center gap-1 text-xs">
                        <button
                            onClick={() => setOctaveOffset(prev => Math.max(-2, prev - 1))}
                            className="px-2 py-1 bg-gray-700 text-gray-300 border border-gray-600 rounded hover:bg-gray-600"
                            title="Lower octave"
                        >
                            −
                        </button>
                        <span className="px-2 text-gray-400">Oct: {octaveOffset >= 0 ? '+' : ''}{octaveOffset}</span>
                        <button
                            onClick={() => setOctaveOffset(prev => Math.min(2, prev + 1))}
                            className="px-2 py-1 bg-gray-700 text-gray-300 border border-gray-600 rounded hover:bg-gray-600"
                            title="Raise octave"
                        >
                            +
                        </button>
                    </div>

                    {/* Record button */}
                    <button
                        onClick={isRecording ? stopRecording : startRecording}
                        disabled={!selectedSound}
                        className={`px-3 py-1 text-xs rounded border transition-colors ${
                            isRecording
                                ? 'bg-red-600 text-white border-red-600 animate-pulse'
                                : !selectedSound
                                ? 'bg-gray-800 text-gray-600 border-gray-700 cursor-not-allowed'
                                : 'bg-gray-700 text-gray-300 border-gray-600 hover:bg-gray-600'
                        }`}
                        title={!selectedSound ? 'Select a sound first' : isRecording ? 'Stop recording' : 'Start recording'}
                    >
                        {isRecording ? '● REC' : '○ REC'}
                    </button>
                </div>
            </div>
            </div>

            {/* Sound selector */}
            <div
                className="p-3 bg-gray-800/50 border-2 border-dashed border-gray-600 rounded text-center min-h-12 flex items-center justify-center"
                onDragOver={handleDragOver}
                onDrop={handleDrop}
            >
                {selectedSound ? (
                    <div className="flex items-center justify-between w-full">
                        <span className="text-sm text-gray-300">{selectedSound.name}</span>
                        <button
                            onClick={() => setSelectedSoundId(null)}
                            className="px-2 py-1 text-xs bg-red-600 hover:bg-red-500 text-white rounded"
                        >
                            Clear
                        </button>
                    </div>
                ) : (
                    <p className="text-xs text-gray-500">Drag a sound here or select below</p>
                )}
            </div>

            {/* Sound dropdown selector */}
            {sounds.length > 0 && (
                <select
                    value={selectedSoundId || ''}
                    onChange={(e) => setSelectedSoundId(e.target.value || null)}
                    className="px-2 py-1 text-xs bg-gray-700 text-gray-300 border border-gray-600 rounded"
                >
                    <option value="">Select a sound...</option>
                    {sounds.map(sound => (
                        <option key={sound.id} value={sound.id}>
                            {sound.name}
                        </option>
                    ))}
                </select>
            )}

            {/* Piano keyboard */}
            <div className="bg-gray-800/30 rounded p-2 overflow-x-auto">
                {renderPianoKeys()}
            </div>

            <div className="text-xs text-gray-400 text-center">
                Use keyboard keys to play • Press keys shown on piano
            </div>
        </section>
    )
}

export default PianoPlayer
