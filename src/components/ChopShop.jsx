import React, { useState, useRef, useEffect } from 'react'
import { FiScissors } from 'react-icons/fi'

export function ChopShop(props) {
    const { sounds = [], onAddSounds, className } = props
    const [selectedSoundId, setSelectedSoundId] = useState(null)
    const [chopPoints, setChopPoints] = useState([])
    const [isPlaying, setIsPlaying] = useState(false)
    const [playHead, setPlayHead] = useState(0)
    const [zoom, setZoom] = useState(1)
    const [clickPoint, setClickPoint] = useState(null)

    const canvasRef = useRef(null)
    const audioCtxRef = useRef(null)
    const sourceRef = useRef(null)
    const peaksCache = useRef(new WeakMap())
    const animationFrameRef = useRef(null)

    const selectedSound = sounds.find(s => String(s.id) === String(selectedSoundId))

    // Initialize audio context
    const ensureAudioContext = () => {
        if (!audioCtxRef.current) {
            const AC = window.AudioContext || window.webkitAudioContext
            audioCtxRef.current = new AC({ latencyHint: 'interactive' })
        }
        return audioCtxRef.current
    }

    // Compute peaks for waveform visualization
    const computePeaks = (buffer, peakCount = 1000) => {
        if (!buffer) return null
        
        // Create cache key with buffer and peak count
        const cacheKey = `${peakCount}`
        let bufferCache = peaksCache.current.get(buffer)
        if (!bufferCache) {
            bufferCache = new Map()
            peaksCache.current.set(buffer, bufferCache)
        }
        
        const cached = bufferCache.get(cacheKey)
        if (cached) return cached

        try {
            const channelData = buffer.getChannelData(0)
            const blockSize = Math.floor(channelData.length / peakCount)
            const peaks = new Float32Array(peakCount)

            for (let i = 0; i < peakCount; i++) {
                let start = i * blockSize
                let end = Math.min(start + blockSize, channelData.length)
                let max = 0

                for (let j = start; j < end; j++) {
                    max = Math.max(max, Math.abs(channelData[j]))
                }

                peaks[i] = max
            }

            bufferCache.set(cacheKey, peaks)
            return peaks
        } catch (err) {
            return null
        }
    }

    // Draw waveform
    const drawWaveform = () => {
        if (!canvasRef.current || !selectedSound) return

        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')
        const peakCount = Math.floor(1000 * zoom) // More peaks with higher zoom
        const peaks = computePeaks(selectedSound.buffer, peakCount)

        if (!peaks) return

        const dpr = window.devicePixelRatio || 1
        const width = canvas.clientWidth
        const height = canvas.clientHeight
        const w = width * dpr
        const h = height * dpr

        if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w
            canvas.height = h
            ctx.scale(dpr, dpr)
        }

        // Clear canvas
        ctx.fillStyle = 'rgb(31, 41, 55)'
        ctx.fillRect(0, 0, width, height)

        // Draw waveform with zoom applied
        const centerY = height / 2
        const scaleY = height / 2 * 0.8

        ctx.strokeStyle = 'rgb(59, 130, 246)'
        ctx.lineWidth = 1
        ctx.beginPath()

        for (let i = 0; i < peaks.length; i++) {
            const x = (i / peaks.length) * width
            const y = centerY - peaks[i] * scaleY
            if (i === 0) {
                ctx.moveTo(x, y)
            } else {
                ctx.lineTo(x, y)
            }
        }

        // Draw bottom half
        for (let i = peaks.length - 1; i >= 0; i--) {
            const x = (i / peaks.length) * width
            const y = centerY + peaks[i] * scaleY
            ctx.lineTo(x, y)
        }

        ctx.closePath()
        ctx.fillStyle = 'rgba(59, 130, 246, 0.3)'
        ctx.fill()
        ctx.stroke()

        // Draw chop points
        ctx.strokeStyle = 'rgb(239, 68, 68)' // red-500
        ctx.lineWidth = 2
        chopPoints.forEach(point => {
            const x = (point / selectedSound.duration) * width
            ctx.beginPath()
            ctx.moveTo(x, 0)
            ctx.lineTo(x, height)
            ctx.stroke()
        })

        // Draw click point marker
        if (clickPoint !== null) {
            ctx.strokeStyle = 'rgb(34, 197, 94)' // green-500
            ctx.lineWidth = 2
            ctx.beginPath()
            ctx.moveTo(clickPoint, 0)
            ctx.lineTo(clickPoint, height)
            ctx.stroke()
        }

        // Draw playhead
        if (isPlaying) {
            const x = (playHead / selectedSound.duration) * width
            ctx.strokeStyle = 'rgb(251, 191, 36)' // yellow-400
            ctx.lineWidth = 2
            ctx.beginPath()
            ctx.moveTo(x, 0)
            ctx.lineTo(x, height)
            ctx.stroke()
        }
    }

    // Handle canvas click
    const handleCanvasClick = (e) => {
        if (!canvasRef.current) return

        const rect = canvasRef.current.getBoundingClientRect()
        const x = e.clientX - rect.left
        setClickPoint(x)
    }

    // Play from click point to end
    const playFromPoint = async () => {
        if (!selectedSound || clickPoint === null) return

        const canvas = canvasRef.current
        const rect = canvas.getBoundingClientRect()
        const startTime = (clickPoint / rect.width) * selectedSound.duration
        const endTime = selectedSound.duration

        const ctx = ensureAudioContext()
        ctx.resume()

        if (sourceRef.current) {
            sourceRef.current.stop()
        }

        const source = ctx.createBufferSource()
        source.buffer = selectedSound.buffer
        source.connect(ctx.destination)

        source.start(0, startTime, endTime - startTime)
        sourceRef.current = source

        setIsPlaying(true)
        setPlayHead(startTime)

        // Animate playhead
        const startTimestamp = performance.now()
        const animate = () => {
            const elapsed = (performance.now() - startTimestamp) / 1000
            const currentTime = startTime + elapsed

            if (currentTime >= endTime) {
                setIsPlaying(false)
                setPlayHead(0)
                return
            }

            setPlayHead(currentTime)
            animationFrameRef.current = requestAnimationFrame(animate)
        }
        animate()

        source.onended = () => {
            setIsPlaying(false)
            setPlayHead(0)
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current)
            }
        }
    }

    // Stop playback
    const stopPlayback = () => {
        if (sourceRef.current) {
            sourceRef.current.stop()
            sourceRef.current = null
        }
        setIsPlaying(false)
        setPlayHead(0)
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current)
        }
    }

    // Play full sound
    const playFullSound = async () => {
        if (!selectedSound) return

        try {
            const ctx = ensureAudioContext()
            await ctx.resume()

            if (sourceRef.current) {
                try {
                    sourceRef.current.stop()
                } catch (e) {}
            }

            const source = ctx.createBufferSource()
            source.buffer = selectedSound.buffer
            source.connect(ctx.destination)
            source.start(0)
            sourceRef.current = source
            setIsPlaying(true)
            setPlayHead(0)

            const startTimestamp = performance.now()
            const animate = () => {
                const elapsed = (performance.now() - startTimestamp) / 1000
                if (elapsed >= selectedSound.duration) {
                    setIsPlaying(false)
                    setPlayHead(0)
                    return
                }
                setPlayHead(elapsed)
                animationFrameRef.current = requestAnimationFrame(animate)
            }
            animate()

            source.onended = () => {
                setIsPlaying(false)
                setPlayHead(0)
                if (animationFrameRef.current) {
                    cancelAnimationFrame(animationFrameRef.current)
                }
            }
        } catch (error) {
            console.error('Failed to play full sound:', error)
            setIsPlaying(false)
        }
    }

    // Add chop point at click position
    const addChopAtPoint = () => {
        if (!selectedSound || clickPoint === null) return
        const rect = canvasRef.current.getBoundingClientRect()
        const time = (clickPoint / rect.width) * selectedSound.duration
        setChopPoints(prev => [...prev, time].sort((a, b) => a - b))
        setClickPoint(null) // Clear the marker after adding
    }

    // Create chopped sounds
    const createChops = async () => {
        if (!selectedSound || chopPoints.length === 0) return

        const ctx = ensureAudioContext()
        const sampleRate = selectedSound.buffer.sampleRate
        const originalBuffer = selectedSound.buffer

        const chopBuffers = []
        const chopTimes = [0, ...chopPoints, selectedSound.duration]

        for (let i = 0; i < chopTimes.length - 1; i++) {
            const startTime = chopTimes[i]
            const endTime = chopTimes[i + 1]
            const duration = endTime - startTime

            const frameCount = Math.floor(duration * sampleRate)
            const chopBuffer = ctx.createBuffer(
                originalBuffer.numberOfChannels,
                frameCount,
                sampleRate
            )

            for (let channel = 0; channel < originalBuffer.numberOfChannels; channel++) {
                const originalData = originalBuffer.getChannelData(channel)
                const chopData = chopBuffer.getChannelData(channel)

                const startSample = Math.floor(startTime * sampleRate)
                for (let j = 0; j < frameCount; j++) {
                    chopData[j] = originalData[startSample + j] || 0
                }
            }

            chopBuffers.push({
                buffer: chopBuffer,
                name: `${selectedSound.name}_chop_${i + 1}`,
                duration
            })
        }

        if (onAddSounds) {
            onAddSounds(chopBuffers)
        }

        // Clear chop points
        setChopPoints([])
    }

    // Clear all chop points
    const clearChops = () => {
        setChopPoints([])
    }

    // Redraw when dependencies change
    useEffect(() => {
        drawWaveform()
    }, [selectedSound, chopPoints, playHead, clickPoint, zoom])

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (sourceRef.current) {
                sourceRef.current.stop()
            }
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current)
            }
        }
    }, [])

    return (
        <section className="min-h-full flex flex-col gap-4 backdrop-brightness-105 text-[var(--color-primary)] shadow-xl rounded-lg p-4 pattern overflow-hidden">
            <div className="bg-orange-600/20 border-b border-orange-500/30 px-4 py-3 rounded-t-lg -mx-4 -mt-4 mb-1">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold flex items-center gap-2 text-orange-400">
                        <FiScissors className="w-4 h-4" />
                        Chop Shop
                    </h2>
                    <div className="flex items-center gap-2">
                    <select
                        value={selectedSoundId || ''}
                        onChange={(e) => {
                            setSelectedSoundId(e.target.value)
                            setChopPoints([])
                            setClickPoint(null)
                            setPlayHead(0)
                        }}
                        className="px-2 py-1 text-xs bg-gray-700 text-gray-300 border border-gray-600 rounded"
                    >
                        <option value="">Select sound to chop</option>
                        {sounds.map(sound => (
                            <option key={sound.id} value={sound.id}>
                                {sound.name} ({sound.duration.toFixed(1)}s)
                            </option>
                        ))}
                    </select>
                </div>
            </div>
            </div>

            {selectedSound && (
                <>
                    {/* Waveform Canvas */}
                    <div className="relative">
                        <canvas
                            ref={canvasRef}
                            className="w-full h-32 bg-gray-800 rounded border border-gray-600 cursor-crosshair"
                            onClick={handleCanvasClick}
                            style={{ imageRendering: 'pixelated' }}
                        />
                        <div className="absolute bottom-1 left-1 text-xs text-gray-400">
                            Click to mark position • Use buttons below to preview or add chops
                        </div>
                    </div>

                    {/* Controls */}
                    <div className="flex flex-col gap-3">
                        {/* Playback Controls */}
                        <div className="flex items-center gap-2">
                            <button
                                onClick={playFromPoint}
                                disabled={clickPoint === null}
                                className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                ▶️ Play from Point
                            </button>
                            <button
                                onClick={playFullSound}
                                disabled={!selectedSound}
                                className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                ▶️ Play Full
                            </button>
                            <button
                                onClick={stopPlayback}
                                disabled={!isPlaying}
                                className="px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                ⏹️ Stop
                            </button>
                        </div>

                        {/* Chop Controls */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={addChopAtPoint}
                                    disabled={clickPoint === null}
                                    className="px-3 py-1 text-xs bg-orange-600 text-white rounded hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    ➕ Add Chop
                                </button>
                                <span className="text-xs text-gray-400">
                                    {chopPoints.length} chop points
                                </span>
                                <button
                                    onClick={clearChops}
                                    disabled={chopPoints.length === 0}
                                    className="px-2 py-1 text-xs bg-gray-600 text-gray-300 rounded hover:bg-gray-500 disabled:opacity-50"
                                >
                                    Clear
                                </button>
                            </div>
                            <button
                                onClick={createChops}
                                disabled={chopPoints.length === 0}
                                className="px-3 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                ✂️ Create Chops
                            </button>
                        </div>
                    </div>

                    {/* Zoom Control */}
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">Zoom:</span>
                        <input
                            type="range"
                            min="0.1"
                            max="5"
                            step="0.1"
                            value={zoom}
                            onChange={(e) => setZoom(parseFloat(e.target.value))}
                            className="flex-1"
                        />
                        <span className="text-xs text-gray-400">{zoom.toFixed(1)}x</span>
                    </div>
                </>
            )}

            {!selectedSound && (
                <div className="text-center text-gray-400 text-sm py-12">
                    Select a sound from the dropdown above to start chopping
                </div>
            )}
        </section>
    )
}

export default ChopShop