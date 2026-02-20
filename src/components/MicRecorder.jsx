import { useState, useRef, useEffect } from 'react';
import { FiMic, FiStopCircle, FiSave, FiSettings } from 'react-icons/fi';

export function MicRecorder({ onAddSound, decodeFileToBuffer }) {
  const [isRecording, setIsRecording] = useState(false)
  const [audioDevices, setAudioDevices] = useState([])
  const [selectedDevice, setSelectedDevice] = useState('')
  const [recordedChunks, setRecordedChunks] = useState([])
  const [audioLevel, setAudioLevel] = useState(0)
  
  // Audio modulation controls
  const [pitch, setPitch] = useState(0) // -12 to +12 semitones
  const [gain, setGain] = useState(1) // 0 to 2
  const [lowPassFreq, setLowPassFreq] = useState(20000) // 20Hz to 20kHz
  const [highPassFreq, setHighPassFreq] = useState(20)
  const [reverbMix, setReverbMix] = useState(0) // 0 to 1
  
  const mediaRecorderRef = useRef(null)
  const mediaStreamRef = useRef(null)
  const audioContextRef = useRef(null)
  const analyserRef = useRef(null)
  const sourceNodeRef = useRef(null)
  const gainNodeRef = useRef(null)
  const lowPassRef = useRef(null)
  const highPassRef = useRef(null)
  const convolverRef = useRef(null)
  const animationFrameRef = useRef(null)
  const canvasRef = useRef(null)

  // Get audio devices
  useEffect(() => {
    async function getDevices() {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        const audioInputs = devices.filter(d => d.kind === 'audioinput')
        setAudioDevices(audioInputs)
        if (audioInputs.length > 0 && !selectedDevice) {
          setSelectedDevice(audioInputs[0].deviceId)
        }
      } catch (err) {
        console.error('Failed to get devices', err)
      }
    }
    getDevices()
  }, [])

  // Draw waveform
  useEffect(() => {
    if (!isRecording || !analyserRef.current || !canvasRef.current) return
    
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const analyser = analyserRef.current
    const bufferLength = analyser.fftSize
    const dataArray = new Uint8Array(bufferLength)
    
    function draw() {
      animationFrameRef.current = requestAnimationFrame(draw)
      analyser.getByteTimeDomainData(dataArray)
      
      // Calculate audio level
      let sum = 0
      for (let i = 0; i < bufferLength; i++) {
        const normalized = (dataArray[i] - 128) / 128
        sum += normalized * normalized
      }
      const rms = Math.sqrt(sum / bufferLength)
      setAudioLevel(Math.min(rms * 5, 1))
      
      // Draw waveform
      ctx.fillStyle = 'rgb(20, 20, 30)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.lineWidth = 2
      ctx.strokeStyle = 'rgb(34, 211, 238)'
      ctx.beginPath()
      
      const sliceWidth = canvas.width / bufferLength
      let x = 0
      
      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0
        const y = v * canvas.height / 2
        
        if (i === 0) {
          ctx.moveTo(x, y)
        } else {
          ctx.lineTo(x, y)
        }
        
        x += sliceWidth
      }
      
      ctx.lineTo(canvas.width, canvas.height / 2)
      ctx.stroke()
    }
    
    draw()
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [isRecording])

  // Update audio effects in real-time
  useEffect(() => {
    if (!gainNodeRef.current) return
    gainNodeRef.current.gain.value = gain
  }, [gain])

  useEffect(() => {
    if (!lowPassRef.current) return
    lowPassRef.current.frequency.value = lowPassFreq
  }, [lowPassFreq])

  useEffect(() => {
    if (!highPassRef.current) return
    highPassRef.current.frequency.value = highPassFreq
  }, [highPassFreq])

  async function startRecording() {
    try {
      const constraints = {
        audio: {
          deviceId: selectedDevice ? { exact: selectedDevice } : undefined,
          channelCount: 2,
          sampleRate: 48000,
          sampleSize: 16,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      }
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      mediaStreamRef.current = stream
      
      // Create audio context for real-time effects with high sample rate
      const AudioContext = window.AudioContext || window.webkitAudioContext
      const audioContext = new AudioContext({ sampleRate: 48000 })
      audioContextRef.current = audioContext
      
      // Resume audio context if suspended
      if (audioContext.state === 'suspended') {
        await audioContext.resume()
      }
      
      const source = audioContext.createMediaStreamSource(stream)
      sourceNodeRef.current = source
      
      // Create effects chain
      const gainNode = audioContext.createGain()
      gainNode.gain.value = gain
      gainNodeRef.current = gainNode
      
      const lowPass = audioContext.createBiquadFilter()
      lowPass.type = 'lowpass'
      lowPass.frequency.value = lowPassFreq
      lowPassRef.current = lowPass
      
      const highPass = audioContext.createBiquadFilter()
      highPass.type = 'highpass'
      highPass.frequency.value = highPassFreq
      highPassRef.current = highPass
      
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 2048
      analyserRef.current = analyser
      
      // Connect nodes
      source.connect(gainNode)
      gainNode.connect(highPass)
      highPass.connect(lowPass)
      lowPass.connect(analyser)
      
      // Create destination for recording
      const destination = audioContext.createMediaStreamDestination()
      lowPass.connect(destination)
      analyser.connect(audioContext.destination) // Enable real-time playback
      
      // Use the processed stream for recording
      const processedStream = destination.stream
      
      // Try to use highest quality codec available
      let mimeType = 'audio/webm'
      const options = { mimeType, audioBitsPerSecond: 256000 }
      
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        options.mimeType = 'audio/webm;codecs=opus'
      } else if (MediaRecorder.isTypeSupported('audio/webm;codecs=pcm')) {
        options.mimeType = 'audio/webm;codecs=pcm'
      }
      
      const mediaRecorder = new MediaRecorder(processedStream, options)
      mediaRecorderRef.current = mediaRecorder
      
      const chunks = []
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data)
        }
      }
      
      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunks, { type: options.mimeType })
        setRecordedChunks(chunks)
        
        // Auto-save to sounds
        await saveRecording(blob)
      }
      
      mediaRecorder.start(250)
      setIsRecording(true)
    } catch (err) {
      alert('Failed to start recording: ' + err.message)
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop())
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close()
    }
    
    setIsRecording(false)
    setAudioLevel(0)
  }

  async function saveRecording(blob) {
    try {
      if (!blob || blob.size === 0) {
        alert('No recording to save')
        return
      }
      
      // Decode the audio
      const arrayBuffer = await blob.arrayBuffer()
      const AudioContext = window.AudioContext || window.webkitAudioContext
      const tempContext = new AudioContext()
      let audioBuffer = await tempContext.decodeAudioData(arrayBuffer)
      
      // Apply pitch shift if needed
      if (pitch !== 0) {
        const rate = Math.pow(2, pitch / 12)
        const newLength = Math.floor(audioBuffer.length / rate)
        const offlineContext = new OfflineAudioContext(
          audioBuffer.numberOfChannels,
          newLength,
          audioBuffer.sampleRate
        )
        
        const source = offlineContext.createBufferSource()
        source.buffer = audioBuffer
        source.playbackRate.value = rate
        source.connect(offlineContext.destination)
        source.start()
        
        audioBuffer = await offlineContext.startRendering()
      }
      
      const now = new Date()
      const timestamp = `${now.getMonth() + 1}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}-${now.getSeconds()}`
      const name = `mic-recording-${timestamp}.webm`
      
      onAddSound?.(audioBuffer, name)
      tempContext.close()
    } catch (err) {
      alert('Failed to save recording: ' + err.message)
    }
  }

  return (
    <div className="h-full flex flex-col gap-4 p-4 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <FiMic className="w-5 h-5" />
          Mic Recorder
        </h3>
      </div>

      {/* Input Device Selection */}
      <div className="flex flex-col gap-2">
        <label className="text-sm text-gray-400">Audio Input</label>
        <select
          value={selectedDevice}
          onChange={(e) => setSelectedDevice(e.target.value)}
          disabled={isRecording}
          className="px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white text-sm disabled:opacity-50"
        >
          {audioDevices.map(device => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label || `Device ${device.deviceId.slice(0, 8)}`}
            </option>
          ))}
        </select>
      </div>

      {/* Waveform Display */}
      <div className="relative bg-gray-950 border border-gray-700 rounded-lg overflow-hidden">
        <canvas
          ref={canvasRef}
          width={600}
          height={120}
          className="w-full h-[120px]"
        />
        {!isRecording && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-sm">
            Not recording
          </div>
        )}
      </div>

      {/* Audio Level Meter */}
      <div className="flex flex-col gap-2">
        <label className="text-sm text-gray-400">Volume</label>
        <div className="h-4 bg-gray-800 rounded-full overflow-hidden border border-gray-700">
          <div
            className="h-full bg-gradient-to-r from-red-500 to-red-700 transition-all duration-75"
            style={{ width: `${Math.min(audioLevel * 100, 100)}%` }}
          />
        </div>
      </div>

      {/* Controls */}
      <div className="grid grid-cols-2 gap-3">
        {/* Gain */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400">Gain</label>
          <input
            type="range"
            min="0"
            max="2"
            step="0.01"
            value={gain}
            onChange={(e) => setGain(parseFloat(e.target.value))}
            className="w-full"
          />
          <span className="text-xs text-gray-500">{gain.toFixed(2)}x</span>
        </div>

        {/* Pitch */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400">Pitch</label>
          <input
            type="range"
            min="-12"
            max="12"
            step="1"
            value={pitch}
            onChange={(e) => setPitch(parseInt(e.target.value))}
            className="w-full"
          />
          <span className="text-xs text-gray-500">{pitch > 0 ? '+' : ''}{pitch} semi</span>
        </div>

        {/* Low Pass Filter */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400">Low Pass</label>
          <input
            type="range"
            min="20"
            max="20000"
            step="10"
            value={lowPassFreq}
            onChange={(e) => setLowPassFreq(parseInt(e.target.value))}
            className="w-full"
          />
          <span className="text-xs text-gray-500">{lowPassFreq}Hz</span>
        </div>

        {/* High Pass Filter */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400">High Pass</label>
          <input
            type="range"
            min="20"
            max="5000"
            step="10"
            value={highPassFreq}
            onChange={(e) => setHighPassFreq(parseInt(e.target.value))}
            className="w-full"
          />
          <span className="text-xs text-gray-500">{highPassFreq}Hz</span>
        </div>
      </div>

      {/* Record Button */}
      <div className="mt-auto pt-4 border-t border-gray-700">
        {!isRecording ? (
          <button
            onClick={startRecording}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors font-medium"
          >
            <FiMic className="w-5 h-5" />
            Start Recording
          </button>
        ) : (
          <button
            onClick={stopRecording}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors font-medium"
          >
            <FiStopCircle className="w-5 h-5" />
            Stop & Save
          </button>
        )}
      </div>

      <div className="text-xs text-gray-500 text-center">
        Recording will be automatically saved to Sounds library
      </div>
    </div>
  )
}
