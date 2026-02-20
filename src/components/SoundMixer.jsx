import React, { useState, useRef, useEffect } from 'react'
import { FiSliders } from 'react-icons/fi'

export function SoundMixer(props) {
    const {
        sounds = [],
        onCreateSound,
        className
    } = props

    const [selectedSoundId, setSelectedSoundId] = useState(null)
    const [pitch, setPitch] = useState(0)
    const [volume, setVolume] = useState(1.0)
    const [silenceThreshold, setSilenceThreshold] = useState(0.01)
    const [reverbMix, setReverbMix] = useState(0)
    const [reverbDecay, setReverbDecay] = useState(2)
    const [delayTime, setDelayTime] = useState(0.3)
    const [delayFeedback, setDelayFeedback] = useState(0.3)
    const [delayMix, setDelayMix] = useState(0)
    const [distortion, setDistortion] = useState(0)
    const [lowPassFreq, setLowPassFreq] = useState(20000)
    const [highPassFreq, setHighPassFreq] = useState(20)
    const [eqLow, setEqLow] = useState(0)
    const [eqMid, setEqMid] = useState(0)
    const [eqHigh, setEqHigh] = useState(0)
    const [pan, setPan] = useState(0)
    const [fadeIn, setFadeIn] = useState(0)
    const [fadeOut, setFadeOut] = useState(0)
    const [reverse, setReverse] = useState(false)
    const [normalize, setNormalize] = useState(false)
    const [isPlaying, setIsPlaying] = useState(false)
    
    const audioCtxRef = useRef(null)
    const activeSourceRef = useRef(null)
    const analyserRef = useRef(null)
    const animationFrameRef = useRef(null)
    const canvasRef = useRef(null)
    const dataArrayRef = useRef(null)

    const selectedSound = sounds.find(s => String(s.id) === String(selectedSoundId))

    const ensureAudioContext = () => {
        if (!audioCtxRef.current) {
            const AC = window.AudioContext || window.webkitAudioContext
            audioCtxRef.current = new AC({ latencyHint: 'interactive' })
        }
        return audioCtxRef.current
    }

    // Initialize analyser for real-time waveform
    const ensureAnalyser = () => {
        const ctx = ensureAudioContext()
        if (!analyserRef.current) {
            analyserRef.current = ctx.createAnalyser()
            analyserRef.current.fftSize = 256
            analyserRef.current.smoothingTimeConstant = 0.8
            dataArrayRef.current = new Uint8Array(analyserRef.current.frequencyBinCount)
        }
        return analyserRef.current
    }

    // Draw real-time waveform
    const drawWaveform = () => {
        if (!canvasRef.current || !analyserRef.current || !dataArrayRef.current) return

        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')
        const analyser = analyserRef.current
        const dataArray = dataArrayRef.current

        analyser.getByteTimeDomainData(dataArray)

        const width = canvas.width
        const height = canvas.height

        // Clear canvas
        ctx.fillStyle = 'rgb(31, 41, 55)' // gray-800
        ctx.fillRect(0, 0, width, height)

        // Draw waveform
        ctx.lineWidth = 2
        ctx.strokeStyle = 'rgb(59, 130, 246)' // blue-500
        ctx.beginPath()

        const sliceWidth = width / dataArray.length
        let x = 0

        for (let i = 0; i < dataArray.length; i++) {
            const v = dataArray[i] / 128.0
            const y = v * height / 2

            if (i === 0) {
                ctx.moveTo(x, y)
            } else {
                ctx.lineTo(x, y)
            }

            x += sliceWidth
        }

        ctx.stroke()

        // Continue animation if still playing
        if (isPlaying) {
            animationFrameRef.current = requestAnimationFrame(drawWaveform)
        }
    }

    // Start waveform animation
    const startWaveform = () => {
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current)
        }
        ensureAnalyser()
        drawWaveform()
    }

    // Stop waveform animation
    const stopWaveform = () => {
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current)
            animationFrameRef.current = null
        }
        // Clear canvas
        if (canvasRef.current) {
            const ctx = canvasRef.current.getContext('2d')
            ctx.fillStyle = 'rgb(31, 41, 55)'
            ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height)
        }
    }

    // Handle canvas resizing
    useEffect(() => {
        const resizeCanvas = () => {
            if (canvasRef.current) {
                const canvas = canvasRef.current
                const rect = canvas.getBoundingClientRect()
                const dpr = window.devicePixelRatio || 1
                
                canvas.width = rect.width * dpr
                canvas.height = rect.height * dpr
                
                const ctx = canvas.getContext('2d')
                ctx.scale(dpr, dpr)
                
                // Redraw if currently playing
                if (isPlaying) {
                    drawWaveform()
                } else {
                    // Clear canvas
                    ctx.fillStyle = 'rgb(31, 41, 55)'
                    ctx.fillRect(0, 0, rect.width, rect.height)
                }
            }
        }

        // Initial resize
        setTimeout(resizeCanvas, 100)
        
        // Resize on window resize
        window.addEventListener('resize', resizeCanvas)
        return () => window.removeEventListener('resize', resizeCanvas)
    }, [isPlaying])

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

            // Apply volume
            if (volume !== 1.0) {
                processedBuffer = applyVolume(processedBuffer, volume)
            }

            // Apply pitch shift
            if (pitch !== 0) {
                processedBuffer = await applyPitchShift(processedBuffer, pitch)
            }

            // Apply filters
            if (lowPassFreq < 20000 || highPassFreq > 20) {
                processedBuffer = applyFilters(processedBuffer, lowPassFreq, highPassFreq)
            }

            // Apply EQ
            if (eqLow !== 0 || eqMid !== 0 || eqHigh !== 0) {
                processedBuffer = applyEQ(processedBuffer, eqLow, eqMid, eqHigh)
            }

            // Apply distortion
            if (distortion > 0) {
                processedBuffer = applyDistortion(processedBuffer, distortion)
            }

            // Apply delay
            if (delayMix > 0) {
                processedBuffer = await applyDelay(processedBuffer, delayTime, delayFeedback, delayMix)
            }

            // Apply reverb
            if (reverbMix > 0) {
                processedBuffer = await applyReverb(processedBuffer, reverbMix, reverbDecay)
            }

            // Apply panning
            if (pan !== 0) {
                processedBuffer = applyPan(processedBuffer, pan)
            }

            // Apply fade in/out
            if (fadeIn > 0 || fadeOut > 0) {
                processedBuffer = applyFade(processedBuffer, fadeIn, fadeOut)
            }

            // Reverse
            if (reverse) {
                processedBuffer = applyReverse(processedBuffer)
            }

            // Normalize
            if (normalize) {
                processedBuffer = applyNormalize(processedBuffer)
            }

            // Remove silence (do this last)
            if (silenceThreshold > 0) {
                processedBuffer = removeSilence(processedBuffer, silenceThreshold)
            }

            // Play the processed buffer
            const ctx = ensureAudioContext()
            ctx.resume()

            const analyser = ensureAnalyser()
            const source = ctx.createBufferSource()
            source.buffer = processedBuffer
            
            // Connect through analyser for waveform visualization
            source.connect(analyser)
            analyser.connect(ctx.destination)
            
            source.onended = () => {
                setIsPlaying(false)
                activeSourceRef.current = null
                stopWaveform()
            }
            source.start(0)
            activeSourceRef.current = source
            
            // Start waveform animation
            startWaveform()
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

            // Apply volume
            if (volume !== 1.0) {
                processedBuffer = applyVolume(processedBuffer, volume)
            }

            // Apply pitch shift
            if (pitch !== 0) {
                processedBuffer = await applyPitchShift(processedBuffer, pitch)
            }

            // Apply filters
            if (lowPassFreq < 20000 || highPassFreq > 20) {
                processedBuffer = applyFilters(processedBuffer, lowPassFreq, highPassFreq)
            }

            // Apply EQ
            if (eqLow !== 0 || eqMid !== 0 || eqHigh !== 0) {
                processedBuffer = applyEQ(processedBuffer, eqLow, eqMid, eqHigh)
            }

            // Apply distortion
            if (distortion > 0) {
                processedBuffer = applyDistortion(processedBuffer, distortion)
            }

            // Apply delay
            if (delayMix > 0) {
                processedBuffer = await applyDelay(processedBuffer, delayTime, delayFeedback, delayMix)
            }

            // Apply reverb
            if (reverbMix > 0) {
                processedBuffer = await applyReverb(processedBuffer, reverbMix, reverbDecay)
            }

            // Apply panning
            if (pan !== 0) {
                processedBuffer = applyPan(processedBuffer, pan)
            }

            // Apply fade in/out
            if (fadeIn > 0 || fadeOut > 0) {
                processedBuffer = applyFade(processedBuffer, fadeIn, fadeOut)
            }

            // Reverse
            if (reverse) {
                processedBuffer = applyReverse(processedBuffer)
            }

            // Normalize
            if (normalize) {
                processedBuffer = applyNormalize(processedBuffer)
            }

            // Remove silence (do this last)
            if (silenceThreshold > 0) {
                processedBuffer = removeSilence(processedBuffer, silenceThreshold)
            }

            // Create new sound
            if (onCreateSound) {
                const effectsList = []
                if (volume !== 1.0) effectsList.push(`${Math.round(volume * 100)}% vol`)
                if (pitch !== 0) effectsList.push(`${pitch > 0 ? '+' : ''}${pitch}st`)
                if (lowPassFreq < 20000) effectsList.push(`LP${lowPassFreq}Hz`)
                if (highPassFreq > 20) effectsList.push(`HP${highPassFreq}Hz`)
                if (eqLow !== 0 || eqMid !== 0 || eqHigh !== 0) effectsList.push('EQ')
                if (distortion > 0) effectsList.push('dist')
                if (delayMix > 0) effectsList.push('delay')
                if (reverbMix > 0) effectsList.push('reverb')
                if (pan !== 0) effectsList.push(`pan${pan > 0 ? 'R' : 'L'}`)
                if (fadeIn > 0 || fadeOut > 0) effectsList.push('fade')
                if (reverse) effectsList.push('rev')
                if (normalize) effectsList.push('norm')
                if (silenceThreshold > 0) effectsList.push('trim')
                
                await onCreateSound({
                    name: `${selectedSound.name}${effectsList.length > 0 ? ` (${effectsList.join(', ')})` : ''}`,
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

    // New effect functions
    const applyVolume = (buffer, gain) => {
        const audioCtx = new AudioContext()
        const newBuffer = audioCtx.createBuffer(
            buffer.numberOfChannels,
            buffer.length,
            buffer.sampleRate
        )

        for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
            const oldData = buffer.getChannelData(ch)
            const newData = newBuffer.getChannelData(ch)
            for (let i = 0; i < buffer.length; i++) {
                newData[i] = oldData[i] * gain
            }
        }

        return newBuffer
    }

    const applyFilters = (buffer, lowPassFreq, highPassFreq) => {
        const offlineCtx = new OfflineAudioContext(
            buffer.numberOfChannels,
            buffer.length,
            buffer.sampleRate
        )

        const source = offlineCtx.createBufferSource()
        source.buffer = buffer

        let lastNode = source

        if (highPassFreq > 20) {
            const highPass = offlineCtx.createBiquadFilter()
            highPass.type = 'highpass'
            highPass.frequency.value = highPassFreq
            lastNode.connect(highPass)
            lastNode = highPass
        }

        if (lowPassFreq < 20000) {
            const lowPass = offlineCtx.createBiquadFilter()
            lowPass.type = 'lowpass'
            lowPass.frequency.value = lowPassFreq
            lastNode.connect(lowPass)
            lastNode = lowPass
        }

        lastNode.connect(offlineCtx.destination)
        source.start(0)

        return offlineCtx.startRendering()
    }

    const applyEQ = (buffer, lowGain, midGain, highGain) => {
        const offlineCtx = new OfflineAudioContext(
            buffer.numberOfChannels,
            buffer.length,
            buffer.sampleRate
        )

        const source = offlineCtx.createBufferSource()
        source.buffer = buffer

        // Low shelf (below 250Hz)
        const lowShelf = offlineCtx.createBiquadFilter()
        lowShelf.type = 'lowshelf'
        lowShelf.frequency.value = 250
        lowShelf.gain.value = lowGain

        // High shelf (above 4000Hz)
        const highShelf = offlineCtx.createBiquadFilter()
        highShelf.type = 'highshelf'
        highShelf.frequency.value = 4000
        highShelf.gain.value = highGain

        // Mid peaking (around 1000Hz)
        const midPeak = offlineCtx.createBiquadFilter()
        midPeak.type = 'peaking'
        midPeak.frequency.value = 1000
        midPeak.Q.value = 1
        midPeak.gain.value = midGain

        source.connect(lowShelf)
        lowShelf.connect(midPeak)
        midPeak.connect(highShelf)
        highShelf.connect(offlineCtx.destination)

        source.start(0)

        return offlineCtx.startRendering()
    }

    const applyDistortion = (buffer, amount) => {
        const audioCtx = new AudioContext()
        const newBuffer = audioCtx.createBuffer(
            buffer.numberOfChannels,
            buffer.length,
            buffer.sampleRate
        )

        const distortionFunction = (sample) => {
            return Math.sign(sample) * (1 - Math.exp(-Math.abs(sample) * amount))
        }

        for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
            const oldData = buffer.getChannelData(ch)
            const newData = newBuffer.getChannelData(ch)
            for (let i = 0; i < buffer.length; i++) {
                newData[i] = distortionFunction(oldData[i])
            }
        }

        return newBuffer
    }

    const applyDelay = async (buffer, delayTime, feedback, mix) => {
        const sampleRate = buffer.sampleRate
        const delaySamples = Math.floor(delayTime * sampleRate)
        const offlineCtx = new OfflineAudioContext(
            buffer.numberOfChannels,
            buffer.length + delaySamples,
            sampleRate
        )

        const source = offlineCtx.createBufferSource()
        source.buffer = buffer

        const delay = offlineCtx.createDelay(delayTime)
        delay.delayTime.value = delayTime

        const feedbackGain = offlineCtx.createGain()
        feedbackGain.gain.value = feedback

        const mixGain = offlineCtx.createGain()
        mixGain.gain.value = mix

        const dryGain = offlineCtx.createGain()
        dryGain.gain.value = 1 - mix

        // Dry signal
        source.connect(dryGain)
        dryGain.connect(offlineCtx.destination)

        // Wet signal with delay
        source.connect(delay)
        delay.connect(feedbackGain)
        feedbackGain.connect(delay)
        delay.connect(mixGain)
        mixGain.connect(offlineCtx.destination)

        source.start(0)

        return await offlineCtx.startRendering()
    }

    const applyPan = (buffer, panValue) => {
        const audioCtx = new AudioContext()
        const newBuffer = audioCtx.createBuffer(
            2, // Force stereo
            buffer.length,
            buffer.sampleRate
        )

        const leftGain = Math.max(0, Math.min(1, 1 - panValue))
        const rightGain = Math.max(0, Math.min(1, 1 + panValue))

        for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
            const oldData = buffer.getChannelData(ch)
            const leftData = newBuffer.getChannelData(0)
            const rightData = newBuffer.getChannelData(1)

            for (let i = 0; i < buffer.length; i++) {
                const sample = oldData[i]
                leftData[i] += sample * leftGain
                rightData[i] += sample * rightGain
            }
        }

        return newBuffer
    }

    const applyFade = (buffer, fadeInTime, fadeOutTime) => {
        const audioCtx = new AudioContext()
        const newBuffer = audioCtx.createBuffer(
            buffer.numberOfChannels,
            buffer.length,
            buffer.sampleRate
        )

        const fadeInSamples = Math.floor(fadeInTime * buffer.sampleRate)
        const fadeOutSamples = Math.floor(fadeOutTime * buffer.sampleRate)
        const fadeOutStart = buffer.length - fadeOutSamples

        for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
            const oldData = buffer.getChannelData(ch)
            const newData = newBuffer.getChannelData(ch)

            for (let i = 0; i < buffer.length; i++) {
                let gain = 1.0

                // Fade in
                if (i < fadeInSamples) {
                    gain *= i / fadeInSamples
                }

                // Fade out
                if (i > fadeOutStart) {
                    const fadeProgress = (i - fadeOutStart) / fadeOutSamples
                    gain *= (1 - fadeProgress)
                }

                newData[i] = oldData[i] * gain
            }
        }

        return newBuffer
    }

    const applyReverse = (buffer) => {
        const audioCtx = new AudioContext()
        const newBuffer = audioCtx.createBuffer(
            buffer.numberOfChannels,
            buffer.length,
            buffer.sampleRate
        )

        for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
            const oldData = buffer.getChannelData(ch)
            const newData = newBuffer.getChannelData(ch)

            for (let i = 0; i < buffer.length; i++) {
                newData[i] = oldData[buffer.length - 1 - i]
            }
        }

        return newBuffer
    }

    const applyNormalize = (buffer) => {
        let maxAmplitude = 0

        // Find max amplitude
        for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
            const data = buffer.getChannelData(ch)
            for (let i = 0; i < buffer.length; i++) {
                maxAmplitude = Math.max(maxAmplitude, Math.abs(data[i]))
            }
        }

        if (maxAmplitude === 0) return buffer

        const gain = 1 / maxAmplitude
        return applyVolume(buffer, gain)
    }

    return (
        <section className={`flex flex-col h-full pattern backdrop-brightness-105 text-[var(--color-primary)] shadow-xl rounded-lg overflow-hidden my-4 ${className || ''}`}>
            <div className="bg-teal-600/20 border-b border-teal-500/30 p-4">
                <h2 className="text-sm font-semibold flex items-center gap-2 text-teal-400">
                    <FiSliders className="w-4 h-4" />
                    Sound Mixer
                </h2>
            </div>

            <div className="flex-1 overflow-y-auto p-3 pb-8 space-y-3">
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

                        {/* Volume */}  
                        <div className="flex flex-col gap-2 p-3 bg-gray-800/50 rounded border border-gray-700">
                            <label className="text-sm font-medium text-gray-200">Volume</label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="range"
                                    min="0.1"
                                    max="2.0"
                                    step="0.1"
                                    value={volume}
                                    onChange={(e) => setVolume(parseFloat(e.target.value))}
                                    className="flex-1 accent-[var(--color-primary)]"
                                />
                                <span className="text-sm font-medium px-2 py-1 rounded border bg-gray-700 border-gray-600 min-w-[3rem] text-center">
                                    {Math.round(volume * 100)}%
                                </span>
                            </div>
                        </div>

                        {/* Filters */}
                        <div className="flex flex-col gap-3 p-3 bg-gray-800/50 rounded border border-gray-700">
                            <label className="text-sm font-medium text-gray-200">Filters</label>
                            
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-gray-400">Low Pass</span>
                                    <span className="text-sm font-medium px-2 py-0.5 rounded border bg-gray-700 border-gray-600">
                                        {lowPassFreq}Hz
                                    </span>
                                </div>
                                <input
                                    type="range"
                                    min="100"
                                    max="20000"
                                    step="100"
                                    value={lowPassFreq}
                                    onChange={(e) => setLowPassFreq(parseInt(e.target.value))}
                                    className="w-full accent-[var(--color-primary)]"
                                />
                            </div>

                            <div className="flex flex-col gap-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-gray-400">High Pass</span>
                                    <span className="text-sm font-medium px-2 py-0.5 rounded border bg-gray-700 border-gray-600">
                                        {highPassFreq}Hz
                                    </span>
                                </div>
                                <input
                                    type="range"
                                    min="20"
                                    max="5000"
                                    step="10"
                                    value={highPassFreq}
                                    onChange={(e) => setHighPassFreq(parseInt(e.target.value))}
                                    className="w-full accent-[var(--color-primary)]"
                                />
                            </div>
                        </div>

                        {/* EQ */}
                        <div className="flex flex-col gap-3 p-3 bg-gray-800/50 rounded border border-gray-700">
                            <label className="text-sm font-medium text-gray-200">Equalizer</label>
                            
                            <div className="grid grid-cols-3 gap-2">
                                <div className="flex flex-col gap-1">
                                    <span className="text-xs text-gray-400 text-center">Low</span>
                                    <input
                                        type="range"
                                        min="-12"
                                        max="12"
                                        value={eqLow}
                                        onChange={(e) => setEqLow(parseInt(e.target.value))}
                                        className="w-full accent-[var(--color-primary)]"
                                        orient="vertical"
                                        style={{ writingMode: 'bt-lr' }}
                                    />
                                    <span className="text-xs text-center">{eqLow}dB</span>
                                </div>
                                <div className="flex flex-col gap-1">
                                    <span className="text-xs text-gray-400 text-center">Mid</span>
                                    <input
                                        type="range"
                                        min="-12"
                                        max="12"
                                        value={eqMid}
                                        onChange={(e) => setEqMid(parseInt(e.target.value))}
                                        className="w-full accent-[var(--color-primary)]"
                                        orient="vertical"
                                        style={{ writingMode: 'bt-lr' }}
                                    />
                                    <span className="text-xs text-center">{eqMid}dB</span>
                                </div>
                                <div className="flex flex-col gap-1">
                                    <span className="text-xs text-gray-400 text-center">High</span>
                                    <input
                                        type="range"
                                        min="-12"
                                        max="12"
                                        value={eqHigh}
                                        onChange={(e) => setEqHigh(parseInt(e.target.value))}
                                        className="w-full accent-[var(--color-primary)]"
                                        orient="vertical"
                                        style={{ writingMode: 'bt-lr' }}
                                    />
                                    <span className="text-xs text-center">{eqHigh}dB</span>
                                </div>
                            </div>
                        </div>

                        {/* Distortion */}
                        <div className="flex flex-col gap-2 p-3 bg-gray-800/50 rounded border border-gray-700">
                            <label className="text-sm font-medium text-gray-200">Distortion</label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="range"
                                    min="0"
                                    max="10"
                                    step="0.1"
                                    value={distortion}
                                    onChange={(e) => setDistortion(parseFloat(e.target.value))}
                                    className="flex-1 accent-[var(--color-primary)]"
                                />
                                <span className="text-sm font-medium px-2 py-1 rounded border bg-gray-700 border-gray-600 min-w-[3rem] text-center">
                                    {distortion.toFixed(1)}
                                </span>
                            </div>
                        </div>

                        {/* Delay */}
                        <div className="flex flex-col gap-3 p-3 bg-gray-800/50 rounded border border-gray-700">
                            <label className="text-sm font-medium text-gray-200">Delay/Echo</label>
                            
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-gray-400">Time</span>
                                    <span className="text-sm font-medium px-2 py-0.5 rounded border bg-gray-700 border-gray-600">
                                        {delayTime.toFixed(2)}s
                                    </span>
                                </div>
                                <input
                                    type="range"
                                    min="0.1"
                                    max="2.0"
                                    step="0.05"
                                    value={delayTime}
                                    onChange={(e) => setDelayTime(parseFloat(e.target.value))}
                                    className="w-full accent-[var(--color-primary)]"
                                />
                            </div>

                            <div className="flex flex-col gap-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-gray-400">Feedback</span>
                                    <span className="text-sm font-medium px-2 py-0.5 rounded border bg-gray-700 border-gray-600">
                                        {Math.round(delayFeedback * 100)}%
                                    </span>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max="0.9"
                                    step="0.05"
                                    value={delayFeedback}
                                    onChange={(e) => setDelayFeedback(parseFloat(e.target.value))}
                                    className="w-full accent-[var(--color-primary)]"
                                />
                            </div>

                            <div className="flex flex-col gap-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-gray-400">Mix</span>
                                    <span className="text-sm font-medium px-2 py-0.5 rounded border bg-gray-700 border-gray-600">
                                        {Math.round(delayMix * 100)}%
                                    </span>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.01"
                                    value={delayMix}
                                    onChange={(e) => setDelayMix(parseFloat(e.target.value))}
                                    className="w-full accent-[var(--color-primary)]"
                                />
                            </div>
                        </div>

                        {/* Panning */}
                        <div className="flex flex-col gap-2 p-3 bg-gray-800/50 rounded border border-gray-700">
                            <label className="text-sm font-medium text-gray-200">Stereo Pan</label>
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-400">L</span>
                                <input
                                    type="range"
                                    min="-1"
                                    max="1"
                                    step="0.1"
                                    value={pan}
                                    onChange={(e) => setPan(parseFloat(e.target.value))}
                                    className="flex-1 accent-[var(--color-primary)]"
                                />
                                <span className="text-xs text-gray-400">R</span>
                                <span className="text-sm font-medium px-2 py-1 rounded border bg-gray-700 border-gray-600 min-w-[3rem] text-center">
                                    {pan === 0 ? 'C' : pan > 0 ? `${Math.round(pan * 100)}%R` : `${Math.round(Math.abs(pan) * 100)}%L`}
                                </span>
                            </div>
                        </div>

                        {/* Fade In/Out */}
                        <div className="flex flex-col gap-3 p-3 bg-gray-800/50 rounded border border-gray-700">
                            <label className="text-sm font-medium text-gray-200">Fade</label>
                            
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-gray-400">Fade In</span>
                                    <span className="text-sm font-medium px-2 py-0.5 rounded border bg-gray-700 border-gray-600">
                                        {fadeIn.toFixed(1)}s
                                    </span>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max="5"
                                    step="0.1"
                                    value={fadeIn}
                                    onChange={(e) => setFadeIn(parseFloat(e.target.value))}
                                    className="w-full accent-[var(--color-primary)]"
                                />
                            </div>

                            <div className="flex flex-col gap-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-gray-400">Fade Out</span>
                                    <span className="text-sm font-medium px-2 py-0.5 rounded border bg-gray-700 border-gray-600">
                                        {fadeOut.toFixed(1)}s
                                    </span>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max="5"
                                    step="0.1"
                                    value={fadeOut}
                                    onChange={(e) => setFadeOut(parseFloat(e.target.value))}
                                    className="w-full accent-[var(--color-primary)]"
                                />
                            </div>
                        </div>

                        {/* Options */}
                        <div className="flex flex-col gap-3 p-3 bg-gray-800/50 rounded border border-gray-700">
                            <label className="text-sm font-medium text-gray-200">Options</label>
                            
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-gray-300">Reverse</span>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={reverse}
                                        onChange={(e) => setReverse(e.target.checked)}
                                        className="sr-only peer"
                                    />
                                    <div className="w-9 h-5 bg-gray-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[var(--color-primary)] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[var(--color-primary)]"></div>
                                </label>
                            </div>

                            <div className="flex items-center justify-between">
                                <span className="text-sm text-gray-300">Normalize</span>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={normalize}
                                        onChange={(e) => setNormalize(e.target.checked)}
                                        className="sr-only peer"
                                    />
                                    <div className="w-9 h-5 bg-gray-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[var(--color-primary)] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[var(--color-primary)]"></div>
                                </label>
                            </div>
                        </div>

                        {/* Real-time Waveform Display */}
                        <div className="mb-4">
                            <div className="text-sm text-gray-300 mb-2">Live Output Waveform</div>
                            <canvas
                                ref={canvasRef}
                                className="w-full h-20 bg-gray-800 rounded border border-gray-600"
                                style={{ imageRendering: 'pixelated' }}
                            />
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
