import { useState, useRef, useEffect } from 'react'
import { FiMusic } from 'react-icons/fi'

const COLORS = [
    '#3b82f6', '#22c55e', '#a855f7', '#ef4444', '#eab308', '#ec4899',
    '#6366f1', '#14b8a6', '#f97316', '#06b6d4', '#84cc16', '#f43f5e'
]

export function Sounds({ sounds = [], onAddFiles, onReorderSounds, onRemoveSound, className }) {
    const [draggedIdx, setDraggedIdx] = useState(null)
    const [search, setSearch] = useState('')
    const audioCtxRef = useRef(null)

    const getAudioContext = () => {
        if (!audioCtxRef.current) {
            audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)()
        }
        return audioCtxRef.current
    }

    const playSound = (sound) => {
        if (!sound?.buffer) return
        const ctx = getAudioContext()
        ctx.resume()
        const source = ctx.createBufferSource()
        source.buffer = sound.buffer
        source.connect(ctx.destination)
        source.start(0)
    }

    const drawWaveform = (canvas, buffer, color) => {
        if (!canvas || !buffer) return
        const ctx = canvas.getContext('2d')
        const { width, height } = canvas
        const data = buffer.getChannelData(0)
        const step = Math.ceil(data.length / width)
        const amp = height / 2

        ctx.clearRect(0, 0, width, height)
        ctx.fillStyle = color
        ctx.globalAlpha = 0.8

        for (let i = 0; i < width; i++) {
            let min = 1.0
            let max = -1.0
            for (let j = 0; j < step; j++) {
                const datum = data[i * step + j] || 0
                if (datum < min) min = datum
                if (datum > max) max = datum
            }
            const barHeight = Math.max(1, (max - min) * amp)
            ctx.fillRect(i, amp - (max * amp), 1, barHeight)
        }
    }

    useEffect(() => {
        sounds.forEach((sound, idx) => {
            const canvas = document.getElementById(`waveform-${sound.id}`)
            if (canvas) drawWaveform(canvas, sound.buffer, COLORS[idx % COLORS.length])
        })
    }, [sounds])

    const filtered = sounds.filter(s => s.name.toLowerCase().includes(search.toLowerCase()))

    const handleDragStart = (e, idx) => {
        setDraggedIdx(idx)
        e.dataTransfer.setData('application/x-daw-sound', String(sounds[idx].id))
        e.dataTransfer.effectAllowed = 'move'
    }

    const handleDragOver = (e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
    }

    const handleDrop = (e, targetIdx) => {
        e.preventDefault()
        if (draggedIdx !== null && draggedIdx !== targetIdx && onReorderSounds) {
            onReorderSounds(draggedIdx, targetIdx)
        }
        setDraggedIdx(null)
    }

    const handleFileDrop = async (e) => {
        e.preventDefault()
        const items = Array.from(e.dataTransfer.items)
        const files = []

        const processEntry = async (entry) => {
            if (entry.isFile) {
                if (/\.(wav|mp3|ogg|m4a|aac|flac|webm)$/i.test(entry.name)) {
                    const file = await new Promise(resolve => entry.file(resolve))
                    files.push(file)
                }
            } else if (entry.isDirectory) {
                const reader = entry.createReader()
                const entries = await new Promise(resolve => reader.readEntries(resolve))
                for (const child of entries) await processEntry(child)
            }
        }

        for (const item of items) {
            if (item.kind === 'file') {
                const entry = item.webkitGetAsEntry()
                if (entry) await processEntry(entry)
            }
        }

        if (files.length && onAddFiles) onAddFiles(files)
    }

    return (
        <section 
            className={`min-h-full flex flex-col gap-3 backdrop-brightness-105 text-[var(--color-primary)] shadow-xl rounded-lg p-4 pattern overflow-hidden ${className || ''}`}
            onDragOver={handleDragOver}
            onDrop={handleFileDrop}
        >
            <div className="bg-blue-600/20 border-b border-blue-500/30 px-4 py-2 rounded -mx-4 -mt-4 mb-1">
                <h2 className="text-sm font-semibold flex items-center gap-2 text-blue-400">
                    <FiMusic className="w-4 h-4" />
                    Sounds ({sounds.length})
                </h2>
            </div>

            <label className="text-xs px-3 py-1.5 bg-gray-800 border border-gray-600 rounded cursor-pointer hover:bg-gray-700 text-center">
                Import Files
                <input 
                    type="file" 
                    accept="audio/*" 
                    multiple 
                    onChange={(e) => {
                        const files = Array.from(e.target.files || [])
                        e.target.value = ''
                        if (onAddFiles) onAddFiles(files)
                    }} 
                    className="hidden" 
                />
            </label>

            <input
                type="text"
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="text-xs px-3 py-1.5 bg-gray-800 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:border-[var(--color-primary)]"
            />

            <div className="flex-1 overflow-auto min-h-0">
                {filtered.length === 0 ? (
                    <div className="text-xs text-gray-400 text-center py-4">
                        {sounds.length === 0 ? 'Drop files or folders here' : 'No matches'}
                    </div>
                ) : (
                    <div className="grid grid-cols-4 gap-2">
                        {filtered.map((sound) => {
                            const idx = sounds.findIndex(s => s.id === sound.id)
                            const color = COLORS[sound.id % COLORS.length]
                            const isDragging = draggedIdx === idx
                            
                            return (
                                <div 
                                    key={sound.id}
                                    className={`border rounded overflow-hidden transition-all cursor-grab active:cursor-grabbing ${isDragging ? 'opacity-40' : 'opacity-100'}`}
                                    style={{ borderColor: color + '80', backgroundColor: color + '20' }}
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, idx)}
                                    onDragOver={handleDragOver}
                                    onDrop={(e) => handleDrop(e, idx)}
                                    onDragEnd={() => setDraggedIdx(null)}
                                    onClick={() => playSound(sound)}
                                >
                                    <div className="relative h-12 group">
                                        <canvas 
                                            id={`waveform-${sound.id}`} 
                                            width="300" 
                                            height="48" 
                                            className="w-full h-full"
                                        />
                                        <div 
                                            className="absolute top-1 left-1 w-6 h-6 rounded flex items-center justify-center text-white font-bold text-sm pointer-events-none"
                                            style={{ backgroundColor: color }}
                                        >
                                            {sound.id}
                                        </div>
                                        <button
                                            className="absolute top-1 right-1 w-5 h-5 bg-black/60 hover:bg-black/80 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                if (onRemoveSound) onRemoveSound(sound.id)
                                            }}
                                        >
                                            ×
                                        </button>
                                    </div>
                                    <div className="px-2 py-1 bg-black/30 flex items-center justify-between text-xs">
                                        <div className="truncate flex-1 text-white font-medium" title={sound.name}>
                                            {sound.name}
                                        </div>
                                        <div className="text-gray-300 ml-2">
                                            {(sound.duration || 0).toFixed(1)}s
                                        </div>
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
