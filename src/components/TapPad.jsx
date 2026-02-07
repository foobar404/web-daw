import React, { useState, useRef, useEffect } from 'react'

// Keyboard mapping for pads (QWERTY layout)
const keyMap = {
    '1': 0, '2': 1, '3': 2, '4': 3,
    'q': 4, 'w': 5, 'e': 6, 'r': 7,
    'a': 8, 's': 9, 'd': 10, 'f': 11,
    'z': 12, 'x': 13, 'c': 14, 'v': 15
}

// Pad labels
const padLabels = [
    '1', '2', '3', '4',
    'Q', 'W', 'E', 'R',
    'A', 'S', 'D', 'F',
    'Z', 'X', 'C', 'V'
]

export function TapPad(props) {
    const { sounds = [], onAddSound, isPlaying, decodeFileToBuffer } = props
    const [padAssignments, setPadAssignments] = useState(new Map()) // padIndex -> soundId
    const [isRecording, setIsRecording] = useState(false)
    const [tapSequence, setTapSequence] = useState([])
    const [recordingStartTime, setRecordingStartTime] = useState(null)
    const audioCtxRef = useRef(null)
    const destinationRef = useRef(null)

    // Initialize audio context and destination
    const ensureAudioContext = () => {
        if (!audioCtxRef.current) {
            const AC = window.AudioContext || window.webkitAudioContext
            audioCtxRef.current = new AC({ latencyHint: 'interactive' })
        }
        if (!destinationRef.current) {
            destinationRef.current = audioCtxRef.current.createMediaStreamDestination()
        }
        return audioCtxRef.current
    }

    // Start recording
    const startRecording = async () => {
        if (isRecording) return

        try {
            const ctx = ensureAudioContext()
            ctx.resume()

            setTapSequence([])
            setRecordingStartTime(performance.now())
            setIsRecording(true)
        } catch (error) {
            console.error('Failed to start recording:', error)
        }
    }

    // Stop recording
    const stopRecording = async () => {
        if (!isRecording) return

        setIsRecording(false)

        if (tapSequence.length === 0) {
            setTapSequence([])
            setRecordingStartTime(null)
            return
        }

        try {
            // Calculate total duration including pauses
            const totalDuration = (performance.now() - recordingStartTime) / 1000
            
            // Find the longest sound duration to add padding
            let maxSoundDuration = 0
            for (const tap of tapSequence) {
                const sound = sounds.find(s => String(s.id) === String(tap.soundId))
                if (sound && sound.buffer) {
                    maxSoundDuration = Math.max(maxSoundDuration, sound.buffer.duration)
                }
            }
            
            const sampleRate = 44100
            const bufferLength = Math.ceil((totalDuration + maxSoundDuration) * sampleRate)
            const offlineCtx = new OfflineAudioContext(2, bufferLength, sampleRate)

            // Schedule all sounds at their exact timestamps
            for (const tap of tapSequence) {
                const sound = sounds.find(s => String(s.id) === String(tap.soundId))
                if (!sound || !sound.buffer) continue

                const source = offlineCtx.createBufferSource()
                source.buffer = sound.buffer
                source.connect(offlineCtx.destination)
                const startTime = (tap.timestamp - recordingStartTime) / 1000
                source.start(startTime)
            }

            const renderedBuffer = await offlineCtx.startRendering()

            // Create a name for the recording
            const now = new Date()
            const dateTimeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`
            const recordingName = `tap-sequence-${dateTimeStr}.wav`

            // Add to sounds library
            if (onAddSound) {
                onAddSound(renderedBuffer, recordingName)
            }
        } catch (error) {
            console.error('Failed to process recording:', error)
            alert('Failed to create recording.')
        }

        setTapSequence([])
        setRecordingStartTime(null)
    }

    // Play a sound on a specific pad
    const playPadSound = async (padIndex) => {
        const soundId = padAssignments.get(padIndex)
        if (!soundId) return

        // Record tap with timestamp if recording
        if (isRecording && recordingStartTime) {
            setTapSequence(prev => [...prev, {
                soundId: soundId,
                timestamp: performance.now()
            }])
        }

        const sound = sounds.find(s => String(s.id) === String(soundId))
        if (!sound || !sound.buffer) return

        const ctx = ensureAudioContext()
        ctx.resume()

        try {
            const source = ctx.createBufferSource()
            source.buffer = sound.buffer
            source.connect(ctx.destination)
            source.start(0)
        } catch (error) {
            console.error('Failed to play pad sound:', error)
        }
    }

    // Handle keyboard input for pads
    useEffect(() => {
        const handleKeyPress = (e) => {
            const padIndex = keyMap[e.key.toLowerCase()]
            if (padIndex !== undefined) {
                e.preventDefault()
                playPadSound(padIndex)
            }
        }

        window.addEventListener('keydown', handleKeyPress)
        return () => window.removeEventListener('keydown', handleKeyPress)
    }, [padAssignments, sounds, isRecording])

    // Handle drag and drop for assigning sounds to pads
    const handleDragOver = (e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
    }

    const handleDrop = (e, padIndex) => {
        e.preventDefault()
        const soundId = e.dataTransfer.getData('application/x-daw-sound')
        if (soundId) {
            setPadAssignments(prev => new Map(prev.set(padIndex, soundId)))
        }
    }

    const handlePadClick = (padIndex) => {
        playPadSound(padIndex)
    }

    // Clear pad assignment
    const clearPad = (padIndex, e) => {
        e.stopPropagation()
        setPadAssignments(prev => {
            const newMap = new Map(prev)
            newMap.delete(padIndex)
            return newMap
        })
    }

    // Get pad label (keyboard key)
    const getPadLabel = (padIndex) => padLabels[padIndex] || ''

    return (
        <section className="flex flex-col gap-3 backdrop-brightness-105 text-[var(--color-primary)] shadow-xl rounded-lg p-4 pattern">
            <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Tap Pad</h2>
                <div className="flex items-center gap-2">
                    <button
                        onClick={isRecording ? stopRecording : startRecording}
                        className={`px-3 py-1 text-xs rounded border transition-colors ${
                            isRecording
                                ? 'bg-red-600 text-white border-red-600 animate-pulse'
                                : 'bg-gray-700 text-gray-300 border-gray-600 hover:bg-gray-600'
                        }`}
                        title={isRecording ? 'Stop recording (preserves timing & pauses)' : 'Start recording (preserves timing & pauses)'}
                    >
                        {isRecording ? '● REC' : '○ REC'}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-4 gap-2">
                {Array.from({ length: 16 }, (_, padIndex) => {
                    const soundId = padAssignments.get(padIndex)
                    const sound = soundId ? sounds.find(s => String(s.id) === String(soundId)) : null

                    return (
                        <div
                            key={padIndex}
                            className={`relative aspect-square border-2 rounded-lg cursor-pointer transition-all duration-150 flex flex-col items-center justify-center text-xs font-medium ${
                                sound
                                    ? 'bg-blue-600/80 border-blue-500 hover:bg-blue-500 active:bg-blue-700'
                                    : 'bg-gray-800/50 border-gray-600 hover:bg-gray-700/70 active:bg-gray-600'
                            }`}
                            onClick={() => handlePadClick(padIndex)}
                            onDragOver={handleDragOver}
                            onDrop={(e) => handleDrop(e, padIndex)}
                            title={sound ? `Play: ${sound.name} (${getPadLabel(padIndex)})` : `Assign sound (${getPadLabel(padIndex)})`}
                        >
                            {/* Pad label */}
                            <div className={`absolute top-1 left-1 text-[10px] font-bold ${
                                sound ? 'text-blue-200' : 'text-gray-500'
                            }`}>
                                {getPadLabel(padIndex)}
                            </div>

                            {/* Clear button */}
                            {sound && (
                                <button
                                    className="absolute top-1 right-1 w-3 h-3 bg-red-600 hover:bg-red-500 text-white text-[8px] rounded-full flex items-center justify-center"
                                    onClick={(e) => clearPad(padIndex, e)}
                                    title="Clear assignment"
                                >
                                    ×
                                </button>
                            )}

                            {/* Sound name */}
                            <div className="text-center px-1">
                                {sound ? (
                                    <div className="truncate text-[10px] leading-tight">
                                        {sound.name.split('.')[0]}
                                    </div>
                                ) : (
                                    <div className="text-gray-500 text-[10px]">Empty</div>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>

            <div className="text-xs text-gray-400 text-center">
                Drag sounds here to assign them to pads
            </div>
        </section>
    )
}

export default TapPad