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
    const { sounds = [] } = props
    const [padAssignments, setPadAssignments] = useState(new Map()) // padIndex -> soundId
    const audioCtxRef = useRef(null)

    // Initialize audio context
    const ensureAudioContext = () => {
        if (!audioCtxRef.current) {
            const AC = window.AudioContext || window.webkitAudioContext
            audioCtxRef.current = new AC({ latencyHint: 'interactive' })
        }
        return audioCtxRef.current
    }

    // Play a sound on a specific pad
    const playPadSound = async (padIndex) => {
        const soundId = padAssignments.get(padIndex)
        if (!soundId) return

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
            // Failed to play pad sound
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
    }, [padAssignments, sounds])

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
                <span className="text-xs text-gray-400">Use keyboard or click</span>
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