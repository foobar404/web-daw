import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FiPlay, FiPause, FiDownload, FiSave, FiFolder, FiMusic, FiGrid, FiLayers, FiSliders, FiScissors, FiPlus, FiTrash2, FiEdit2, FiChevronDown, FiMic } from 'react-icons/fi';
import { MdOutlinePiano, MdPiano } from "react-icons/md";

const panelConfigs = [
    { key: 'sounds', icon: FiMusic, title: 'Sounds Panel', color: 'text-blue-400', bgColor: 'bg-blue-600/20' },
    { key: 'tapPad', icon: FiGrid, title: 'Tap Pad Panel', color: 'text-green-400', bgColor: 'bg-green-600/20' },
    { key: 'chopShop', icon: FiScissors, title: 'Chop Shop Panel', color: 'text-orange-400', bgColor: 'bg-orange-600/20' },
    { key: 'pianoPlayer', icon: MdPiano, title: 'Piano Player Panel', color: 'text-purple-400', bgColor: 'bg-purple-600/20' },
    { key: 'tracks', icon: FiLayers, title: 'Tracks Panel', color: 'text-yellow-400', bgColor: 'bg-yellow-600/20' },
    { key: 'pianoRoll', icon: MdOutlinePiano, title: 'Piano Roll Panel', color: 'text-pink-400', bgColor: 'bg-pink-600/20' },
    { key: 'soundMixer', icon: FiSliders, title: 'Sound Mixer Panel', color: 'text-teal-400', bgColor: 'bg-teal-600/20' },
    { key: 'micRecorder', icon: FiMic, title: 'Mic Recorder Panel', color: 'text-red-400', bgColor: 'bg-red-600/20' }
];

export function TrackNav(props) {
    const [showLayoutMenu, setShowLayoutMenu] = useState(false)
    const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 })
    const buttonRef = useRef(null)
    const menuRef = useRef(null)
    const playDisabled = (props.tracks || []).length === 0;
    const timeDisplay = props.secondsToMmSs ? props.secondsToMmSs(props.playHead || 0) : '0:00';
    const currentLayout = props.layoutPresets?.find(l => l.id === props.currentLayoutId)

    useEffect(() => {
        if (showLayoutMenu && buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect()
            setMenuPosition({
                top: rect.bottom + 8,
                right: window.innerWidth - rect.right
            })
        }
    }, [showLayoutMenu])

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target) && 
                buttonRef.current && !buttonRef.current.contains(e.target)) {
                setShowLayoutMenu(false)
            }
        }
        if (showLayoutMenu) {
            document.addEventListener('mousedown', handleClickOutside)
            return () => document.removeEventListener('mousedown', handleClickOutside)
        }
    }, [showLayoutMenu])

    const handleSaveNewLayout = () => {
        const name = prompt('Enter layout name:')
        if (name) {
            props.onSaveNewLayout?.(name)
        }
    }

    const handleRenameLayout = (layoutId, e) => {
        e.stopPropagation()
        const layout = props.layoutPresets?.find(l => l.id === layoutId)
        if (layout) {
            const name = prompt('Enter new name:', layout.name)
            if (name && name !== layout.name) {
                props.onRenameLayout?.(layoutId, name)
            }
        }
    }

    const handleDeleteLayout = (layoutId, e) => {
        e.stopPropagation()
        const layout = props.layoutPresets?.find(l => l.id === layoutId)
        if (layout && confirm(`Delete layout "${layout.name}"?`)) {
            props.onDeleteLayout?.(layoutId)
        }
    }

    return (
        <header className={`pattern flex items-center gap-4 p-5 backdrop-brightness-105 text-[var(--color-primary)] shadow-xl rounded-lg z-10 ${props.className || ''}`}>
            <div className="flex items-center gap-2">
                <button 
                    onClick={props.togglePlayPause} 
                    disabled={playDisabled} 
                    className={`p-2 rounded hover:bg-gray-800 ${playDisabled ? 'opacity-50 cursor-not-allowed' : ''}`} 
                    title="Play/Pause" 
                    aria-label="Play/Pause"
                >
                    {props.isPlaying ? <FiPause className="w-5 h-5" /> : <FiPlay className="w-5 h-5" />}
                </button>
                <button 
                    onClick={props.saveProject} 
                    className="p-2 rounded hover:bg-gray-800" 
                    title="Save Project" 
                    aria-label="Save Project"
                >
                    <FiSave className="w-5 h-5" />
                </button>
                <button 
                    onClick={props.loadProject} 
                    className="p-2 rounded hover:bg-gray-800" 
                    title="Load Project" 
                    aria-label="Load Project"
                >
                    <FiFolder className="w-5 h-5" />
                </button>
                <button 
                    onClick={props.exportMp3} 
                    className="p-2 rounded hover:bg-gray-800" 
                    title="Export MP3" 
                    aria-label="Export MP3"
                >
                    <FiDownload className="w-5 h-5" />
                </button>
            </div>

            <input
                type="text"
                value={props.projectName || ''}
                onChange={(e) => props.onProjectNameChange?.(e.target.value)}
                onKeyDown={(e) => {
                    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape') {
                        e.stopPropagation()
                    }
                }}
                className="flex-1 max-w-xs px-3 py-1 bg-gray-800 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:border-[var(--color-primary)]"
                placeholder="Project Name"
                title="Project Name"
            />

            <div className="flex items-center gap-1">
                {panelConfigs.map(({ key, icon: Icon, title, color, bgColor }) => (
                    <button
                        key={key}
                        onClick={() => props.onTogglePanel?.(key)}
                        className={`p-2 rounded transition-colors ${props.panelVisibility?.[key] ? `${bgColor} ${color}` : 'hover:bg-gray-800 text-gray-400'}`}
                        title={title}
                    >
                        <Icon className="w-5 h-5" />
                    </button>
                ))}
            </div>

            <div className="relative">
                <button
                    ref={buttonRef}
                    onClick={() => setShowLayoutMenu(!showLayoutMenu)}
                    className="flex items-center gap-2 px-3 py-2 bg-gray-800 border border-gray-600 rounded hover:bg-gray-700 transition-colors"
                    title="Manage Layouts"
                >
                    <FiLayers className="w-4 h-4" />
                    <span className="text-sm">{currentLayout?.name || 'Layout'}</span>
                    <FiChevronDown className="w-3 h-3" />
                </button>

                {showLayoutMenu && createPortal(
                    <div 
                        ref={menuRef}
                        className="fixed bg-gray-900/95 backdrop-blur-md border border-gray-700/80 rounded-lg shadow-2xl min-w-[300px] z-[9999] text-white"
                        style={{
                            top: `${menuPosition.top}px`,
                            right: `${menuPosition.right}px`
                        }}
                    >
                        <div className="p-4">
                            {/* Layout list */}
                            <div className="mb-4">
                                <div className="text-xs font-semibold text-gray-400 mb-3 px-2 uppercase tracking-wider">Layouts</div>
                                {props.layoutPresets?.map(layout => (
                                    <div 
                                        key={layout.id}
                                        className={`flex items-center justify-between gap-2 px-3 py-2 mb-1 rounded-md transition-all ${layout.id === props.currentLayoutId ? 'bg-gray-800/80 border border-gray-600' : 'hover:bg-gray-800/50'}`}
                                    >
                                        <button
                                            onClick={() => {
                                                props.onSwitchLayout?.(layout.id)
                                            }}
                                            className="flex-1 text-left text-sm font-medium"
                                        >
                                            {layout.name}
                                        </button>
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={(e) => handleRenameLayout(layout.id, e)}
                                                className="p-1.5 rounded hover:bg-gray-700 hover:text-blue-400 transition-all"
                                                title="Rename"
                                            >
                                                <FiEdit2 className="w-3.5 h-3.5" />
                                            </button>
                                            {props.layoutPresets.length > 1 && (
                                                <button
                                                    onClick={(e) => handleDeleteLayout(layout.id, e)}
                                                    className="p-1.5 rounded hover:bg-gray-700 hover:text-red-400 transition-all"
                                                    title="Delete"
                                                >
                                                    <FiTrash2 className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                <button
                                    onClick={handleSaveNewLayout}
                                    className="w-full mt-3 flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-green-600/20 hover:bg-green-600/30 text-green-400 border border-green-600/30 hover:border-green-600/50 transition-all font-medium"
                                    title="Save Current as New Layout"
                                >
                                    <FiPlus className="w-4 h-4" />
                                    <span className="text-sm">Save as New Layout</span>
                                </button>
                            </div>

                            {/* Panel visibility toggles */}
                            <div className="border-t border-gray-700/50 pt-4">
                                <div className="text-xs font-semibold text-gray-400 mb-3 px-2 uppercase tracking-wider">Panels</div>
                                <div className="grid grid-cols-2 gap-2">
                                    {panelConfigs.map(({ key, icon: Icon, title, color, bgColor }) => (
                                        <button
                                            key={key}
                                            onClick={() => props.onTogglePanel?.(key)}
                                            className={`flex items-center gap-2 px-3 py-2 rounded-md transition-all font-medium ${props.panelVisibility?.[key] ? `${bgColor} ${color} border border-current/30` : 'bg-gray-800/30 hover:bg-gray-800/50 text-gray-400 hover:text-gray-300'}`}
                                            title={title}
                                        >
                                            <Icon className="w-4 h-4" />
                                            <span className="text-xs truncate">{title.replace(' Panel', '')}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>,
                    document.body
                )}
            </div>

            <div className="text-center text-lg font-mono min-w-[60px]">
                {timeDisplay}
            </div>
        </header>
    );
}