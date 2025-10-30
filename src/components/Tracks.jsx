import React from 'react';

export function Tracks(props) {
    const {
        projectDuration,
        PPS,
        playHead,
        tracks,
        sounds,
        onClipPointerDown,
        secondsToMmSs,
        updateClip,
        deleteClip,
        handleFilesAdd,
        recordingTrackId,
        stopRecording,
        startRecording,
        addTrack,
        onDropSound,
    } = props

    return (
        <div className="timeline overflow-x-auto">
            <div className="timeline-inner" style={{ width: projectDuration * PPS + 160 }}>
                <div className="relative h-6 border-b border-gray-700 flex gap-[10px]">
                    {Array.from({ length: projectDuration + 1 }).map((_, i) => (
                        <div key={i} className="absolute top-0 h-full w-px bg-gray-600" style={{ left: i * PPS }}>
                            <span className="text-xs text-gray-400" style={{ position: 'absolute', top: 2, left: 4, transform: 'translateX(-50%)' }}>{i}s</span>
                        </div>
                    ))}
                    <div className="absolute top-0 h-full bg-red-600" style={{ left: Math.max(0, Math.min(projectDuration, playHead)) * PPS, width: 2 }} />
                </div>

                <div className="tracks p-2 relative">
                    {tracks.map((t) => (
                        <div key={t.id} className="mb-2">
                            <div className="absolute left-0 top-6 bottom-0 w-full pointer-events-none">
                                {Array.from({ length: (projectDuration + 1 * 10) }).map((_, i) => (
                                    <div key={`grid-${i}`} className={`absolute top-0 bottom-0 w-px ${(i % 10 === 0) ? "bg-white/30" : "bg-white/5"}`} style={{ left: (i / 10) * PPS }} />
                                ))}
                            </div>

                            <div className="flex items-center justify-between px-2 py-1 font-semibold">
                                <div className="text-sm">{t.name}</div>
                                <div className="text-xs text-gray-400">{/* header reserved */}</div>
                            </div>

                            <div className="relative" style={{ height: 72 }}
                                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }}
                                onDrop={(e) => {
                                    e.preventDefault()
                                    const sid = e.dataTransfer.getData('application/x-daw-sound')
                                    if (!sid) return
                                    const sound = (sounds || []).find(s => String(s.id) === String(sid))
                                    if (!sound) return
                                    const rect = e.currentTarget.getBoundingClientRect()
                                    const x = e.clientX - rect.left
                                    const start = Math.max(0, +(x / PPS).toFixed(3))
                                    if (onDropSound) onDropSound(t.id, sound.id, start)
                                }}>
                                {t.clips.map((c) => (
                                    <div key={c.id}
                                        onPointerDown={(e) => onClipPointerDown(e, t.id, c.id)}
                                        className="absolute top-2 h-14 bg-gradient-to-b from-blue-500 to-blue-700 border border-blue-800 rounded-md text-white shadow-lg flex flex-col min-w-[60px] cursor-grab active:cursor-grabbing z-20"
                                        style={{ left: c.start * PPS, width: c.duration * PPS }}>
                                        <div className="text-xs px-2 border-b border-white/20 truncate" title={c.name}>{c.name}</div>
                                        <div className="flex items-center justify-between gap-2 px-2 py-1 text-xs">
                                            <label className="flex items-center gap-2">
                                                <span className="text-[11px]">Start</span>
                                                <input type="number" min="0" step="0.1" value={c.start}
                                                    onChange={(e) => updateClip(t.id, c.id, { start: Math.max(0, parseFloat(e.target.value) || 0) })}
                                                    className="w-16 bg-gray-800 rounded px-1" />
                                            </label>
                                            <span className="text-[11px]">{secondsToMmSs(c.duration)}</span>
                                            <button className="bg-gray-800 border border-gray-600 px-2 rounded" onClick={() => deleteClip(t.id, c.id)}>✕</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {/* per-track controls bottom-left: Import, Record/Stop, +Track */}
                            <div className="absolute left-2 bottom-2 flex items-center gap-2">
                                <label className="relative inline-block px-2 py-1 border border-gray-600 rounded text-sm cursor-pointer bg-gray-800 text-white">Import
                                    <input type="file" accept="audio/*" multiple onChange={(e) => {
                                        const files = Array.from(e.target.files || [])
                                        e.target.value = ''
                                        handleFilesAdd(t.id, files)
                                    }} className="absolute inset-0 opacity-0 cursor-pointer" />
                                </label>
                                {recordingTrackId === t.id ? (
                                    <button onClick={() => stopRecording()} className="px-2 py-1 text-sm bg-red-600 rounded">Stop</button>
                                ) : (
                                    <button onClick={() => startRecording(t.id)} className="px-2 py-1 text-sm rounded bg-green-600 hover:brightness-110">Record</button>
                                )}
                                <button onClick={() => addTrack(t.id)} className="px-2 py-1 text-sm bg-gray-800 border border-gray-600 rounded">+ Track</button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}