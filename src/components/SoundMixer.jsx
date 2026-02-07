import React, { useState, useRef } from 'react'

export function SoundMixer(props) {
    const {
        sounds = [],
        onCreateSound,
        className
    } = props

    const [selectedSoundId, setSelectedSoundId] = useState(null)
    const [pitch, setPitch] = useState(0)
    const [silenceThreshold, setSilenceThreshold] = useState(0.01)
    const [reverbMix, setReverbMix] = useState(0)
    const [reverbDecay, setReverbDecay] = useState(2)
    const [isPlaying, setIsPlaying] = useState(false)
    
    const audioCtxRef = useRef(null)
    const activeSourceRef = useRef(null)

    const selectedSound = sounds.find(s => String(s.id) === String(selectedSoundId))

    const ensureAudioContext = () => {
        if (!audioCtxRef.current) {
            const AC = window.AudioContext || window.webkitAudioContext
            audioCtxRef.current = new AC({ latencyHint: 'interactive' })
        }
        return audioCtxRef.current
    }

    const previewSound = async () => {
        if (isPlaying) {
            // Stop playback
            if (activeSourceRef.current) {
                try { activeSourceRef.current.stop(0) } catch (e) {}
                activeSourceRef.current = null
            }
            setIsPlaying(false)
            return
        }

        if (!selectedSound || !selectedSound.buffer) return

        try {
            const buffer = selectedSound.buffer
            let processedBuffer = buffer

            // Apply pitch shift
            if (pitch !== 0) {
                processedBuffer = await applyPitchShift(processedBuffer, pitch)
            }

            // Remove silence
            if (silenceThreshold > 0) {
                processedBuffer = removeSilence(processedBuffer, silenceThreshold)
            }

            // Apply reverb
            if (reverbMix > 0) {
                processedBuffer = await applyReverb(processedBuffer, reverbMix, reverbDecay)
            }

            // Play the processed buffer
            const ctx = ensureAudioContext()
            ctx.resume()

            const source = ctx.createBufferSource()
            source.buffer = processedBuffer
            source.connect(ctx.destination)
            source.onended = () => {
                setIsPlaying(false)
                activeSourceRef.current = null
            }
            source.start(0)
            activeSourceRef.current = source
            setIsPlaying(true)
        } catch (error) {
            alert('Failed to preview sound: ' + error.message)
            setIsPlaying(false)
        }
    }

    const applyEffects = async () => {
        if (!selectedSound || !selectedSound.buffer) return

        try {
            const sampleRate = 44100
            const buffer = selectedSound.buffer
            let processedBuffer = buffer

            // Apply pitch shift
            if (pitch !== 0) {
                processedBuffer = await applyPitchShift(processedBuffer, pitch)
            }

            // Remove silence
            if (silenceThreshold > 0) {
                processedBuffer = removeSilence(processedBuffer, silenceThreshold)
            }

            // Apply reverb
            if (reverbMix > 0) {
                processedBuffer = await applyReverb(processedBuffer, reverbMix, reverbDecay)
            }

            // Create new sound
            if (onCreateSound) {
                const effectsList = []
                if (pitch !== 0) effectsList.push(`${pitch > 0 ? '+' : ''}${pitch}st`)
                if (silenceThreshold > 0) effectsList.push('trim')
                if (reverbMix > 0) effectsList.push('reverb')
                
                await onCreateSound({
                    name: `${selectedSound.name} (${effectsList.join(', ')})`,
                    buffer: processedBuffer,
                    duration: processedBuffer.duration
                })
            }
        } catch (error) {
            alert('Failed to apply effects: ' + error.message)
        }
    }

    const applyPitchShift = async (buffer, semitones) => {
        const playbackRate = Math.pow(2, semitones / 12)
        const newLength = Math.floor(buffer.length / playbackRate)
        const offlineCtx = new OfflineAudioContext(
            buffer.numberOfChannels,
            newLength,
            buffer.sampleRate
        )

        const source = offlineCtx.createBufferSource()
        source.buffer = buffer
        source.playbackRate.value = playbackRate
        source.connect(offlineCtx.destination)
        source.start(0)

        return await offlineCtx.startRendering()
    }

    const removeSilence = (buffer, threshold) => {
        const channels = []
        for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
            channels.push(buffer.getChannelData(ch))
        }

        let start = 0
        let end = buffer.length - 1

        // Find start
        for (let i = 0; i < buffer.length; i++) {
            let hasSignal = false
            for (let ch = 0; ch < channels.length; ch++) {
                if (Math.abs(channels[ch][i]) > threshold) {
                    hasSignal = true
                    break
                }
            }
            if (hasSignal) {
                start = i
                break
            }
        }

        // Find end
        for (let i = buffer.length - 1; i >= 0; i--) {
            let hasSignal = false
            for (let ch = 0; ch < channels.length; ch++) {
                if (Math.abs(channels[ch][i]) > threshold) {
                    hasSignal = true
                    break
                }
            }
            if (hasSignal) {
                end = i
                break
            }
        }

        const newLength = end - start + 1
        const audioCtx = new AudioContext()
        const newBuffer = audioCtx.createBuffer(
            buffer.numberOfChannels,
            newLength,
            buffer.sampleRate
        )

        for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
            const newChannelData = newBuffer.getChannelData(ch)
            const oldChannelData = buffer.getChannelData(ch)
            for (let i = 0; i < newLength; i++) {
                newChannelData[i] = oldChannelData[start + i]
            }
        }

        return newBuffer
    }

    const applyReverb = async (buffer, mix, decay) => {
        const sampleRate = buffer.sampleRate
        const duration = buffer.duration + decay
        const offlineCtx = new OfflineAudioContext(
            buffer.numberOfChannels,
            Math.ceil(duration * sampleRate),
            sampleRate
        )

        // Dry signal
        const dryGain = offlineCtx.createGain()
        dryGain.gain.value = 1 - mix
        const drySource = offlineCtx.createBufferSource()
        drySource.buffer = buffer
        drySource.connect(dryGain)
        dryGain.connect(offlineCtx.destination)
        drySource.start(0)

        // Wet signal with convolver
        const wetGain = offlineCtx.createGain()
        wetGain.gain.value = mix
        const wetSource = offlineCtx.createBufferSource()
        wetSource.buffer = buffer
        
        const convolver = offlineCtx.createConvolver()
        convolver.buffer = createReverbImpulse(offlineCtx, decay)
        
        wetSource.connect(convolver)
        convolver.connect(wetGain)
        wetGain.connect(offlineCtx.destination)
        wetSource.start(0)

        return await offlineCtx.startRendering()
    }

    const createReverbImpulse = (audioContext, decay) => {
        const sampleRate = audioContext.sampleRate
        const length = sampleRate * decay
        const impulse = audioContext.createBuffer(2, length, sampleRate)
        
        for (let channel = 0; channel < 2; channel++) {
            const channelData = impulse.getChannelData(channel)
            for (let i = 0; i < length; i++) {
                channelData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2)
            }
        }
        
        return impulse
    }

    return (
        <section className={`flex flex-col h-full pattern backdrop-brightness-105 text-[var(--color-primary)] shadow-xl rounded-lg overflow-hidden ${className || ''}`}>
            <div className="p-4 border-b border-gray-600">
                <h2 className="text-lg font-semibold">Sound Mixer</h2>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {/* Sound Selection */}
                <div className="flex flex-col gap-2">
                    <label className="text-xs font-medium text-gray-300">Select Sound:</label>
                    <select
                        value={selectedSoundId || ''}
                        onChange={(e) => setSelectedSoundId(e.target.value)}
                        className="bg-gray-800/80 border border-gray-600 rounded px-2 py-1.5 text-sm text-white focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-all duration-200"
                    >
                        <option value="">Select a sound...</option>
                        {sounds.map(sound => (
                            <option key={sound.id} value={sound.id}>
                                {sound.name} ({Math.round(sound.duration * 10) / 10}s)
                            </option>
                        ))}
                    </select>
                </div>

                {selectedSound && (
                    <>
                        {/* Pitch Shift */}
                        <div className="flex flex-col gap-2 p-3 bg-gray-800/50 rounded border border-gray-700">
                            <label className="text-sm font-medium text-gray-200">Pitch Shift</label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="range"
                                    min="-12"
                                    max="12"
                                    value={pitch}
                                    onChange={(e) => setPitch(parseInt(e.target.value))}
                                    className="flex-1 accent-[var(--color-primary)]"
                                />
                                <span className={`text-sm font-medium px-2 py-1 rounded border min-w-[3rem] text-center ${
                                    pitch === 0 ? 'bg-gray-700 border-gray-600' : 
                                    pitch > 0 ? 'bg-green-900/50 border-green-600 text-green-300' : 
                                    'bg-red-900/50 border-red-600 text-red-300'
                                }`}>
                                    {pitch > 0 ? '+' : ''}{pitch} st
                                </span>
                            </div>
                        </div>

                        {/* Remove Silence */}
                        <div className="flex flex-col gap-2 p-3 bg-gray-800/50 rounded border border-gray-700">
                            <label className="text-sm font-medium text-gray-200">Trim Silence</label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="range"
                                    min="0"
                                    max="0.1"
                                    step="0.001"
                                    value={silenceThreshold}
                                    onChange={(e) => setSilenceThreshold(parseFloat(e.target.value))}
                                    className="flex-1 accent-[var(--color-primary)]"
                                />
                                <span className="text-sm font-medium px-2 py-1 rounded border bg-gray-700 border-gray-600 min-w-[4rem] text-center">
                                    {(silenceThreshold * 100).toFixed(1)}%
                                </span>
                            </div>
                            <p className="text-xs text-gray-400">Removes silence from start and end</p>
                        </div>

                        {/* Reverb */}
                        <div className="flex flex-col gap-3 p-3 bg-gray-800/50 rounded border border-gray-700">
                            <label className="text-sm font-medium text-gray-200">Reverb</label>
                            
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-gray-400">Mix</span>
                                    <span className="text-sm font-medium px-2 py-0.5 rounded border bg-gray-700 border-gray-600">
                                        {Math.round(reverbMix * 100)}%
                                    </span>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.01"
                                    value={reverbMix}
                                    onChange={(e) => setReverbMix(parseFloat(e.target.value))}
                                    className="w-full accent-[var(--color-primary)]"
                                />
                            </div>

                            <div className="flex flex-col gap-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-gray-400">Decay</span>
                                    <span className="text-sm font-medium px-2 py-0.5 rounded border bg-gray-700 border-gray-600">
                                        {reverbDecay.toFixed(1)}s
                                    </span>
                                </div>
                                <input
                                    type="range"
                                    min="0.5"
                                    max="5"
                                    step="0.1"
                                    value={reverbDecay}
                                    onChange={(e) => setReverbDecay(parseFloat(e.target.value))}
                                    className="w-full accent-[var(--color-primary)]"
                                />
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-2">
                            <button
                                onClick={previewSound}
                                className={`flex-1 px-4 py-2 text-sm font-medium rounded border transition-all duration-200 ${
                                    isPlaying
                                        ? 'bg-red-600/90 border-red-500 text-white hover:bg-red-500'
                                        : 'bg-green-600/90 border-green-500 text-white hover:bg-green-500'
                                }`}
                            >
                                {isPlaying ? '⏹️ Stop Preview' : '▶️ Preview'}
                            </button>
                            <button
                                onClick={applyEffects}
                                className="flex-1 px-4 py-2 text-sm font-medium bg-[var(--color-primary)]/90 border border-[var(--color-primary)] text-white rounded hover:bg-[var(--color-primary)] transition-all duration-200"
                            >
                                🎛️ Create Sound
                            </button>
                        </div>
                    </>
                )}

                {!selectedSound && (
                    <div className="text-center text-gray-400 text-sm py-8">
                        Select a sound to apply effects
                    </div>
                )}
            </div>
        </section>
    )
}

export default SoundMixer
