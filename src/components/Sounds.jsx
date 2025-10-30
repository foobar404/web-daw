import React from 'react'

export function Sounds(props) {
    const { sounds = [], onAddFiles } = props

    return (
        <section className="flex flex-col gap-5 backdrop-brightness-105 text-[var(--color-primary)] shadow-xl rounded-lg p-5 pattern min-w-[200px]">
            <h2 className="text-sm font-semibold">Sounds</h2>
            <label className="text-xs px-2 py-1 bg-gray-800 border border-gray-600 rounded cursor-pointer">Import
                <input type="file" accept="audio/*" multiple onChange={(e) => {
                    const files = Array.from(e.target.files || [])
                    e.target.value = ''
                    if (onAddFiles) onAddFiles(files)
                }} className="hidden" />
            </label>

            <div className="max-h-48 overflow-auto">
                {sounds.length === 0 ? (
                    <div className="text-xs text-gray-400/50">No sounds imported. Use Import to add files.</div>
                ) : (
                    <ul className="flex flex-col gap-2">
                        {sounds.map((s) => (
                            <li key={s.id} className="p-2 bg-gray-800 border border-gray-700 rounded flex items-center justify-between text-sm text-white"
                                draggable
                                onDragStart={(e) => {
                                    e.dataTransfer.setData('application/x-daw-sound', String(s.id))
                                    e.dataTransfer.effectAllowed = 'copy'
                                }}
                                onDragEnd={(e) => { /* no-op */ }}
                            >
                                <div className="truncate" title={s.name}>{s.name}</div>
                                <div className="text-xs text-gray-400 ml-2">{Math.round((s.duration || 0) * 10) / 10}s</div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </section>
    )
}

export default Sounds
