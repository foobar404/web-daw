import React from 'react';
import { FiPlay, FiPause, FiDownload, FiSave, FiFolder, FiMusic, FiGrid, FiLayers } from 'react-icons/fi';
import { MdOutlinePiano } from "react-icons/md";

const panelConfigs = [
    { key: 'sounds', icon: FiMusic, title: 'Toggle Sounds Panel' },
    { key: 'tapPad', icon: FiGrid, title: 'Toggle Tap Pad Panel' },
    { key: 'tracks', icon: FiLayers, title: 'Toggle Tracks Panel' },
    { key: 'pianoRoll', icon: MdOutlinePiano, title: 'Toggle Piano Roll Panel' }
];

export function TrackNav(props) {
    const playDisabled = (props.tracks || []).length === 0;
    const timeDisplay = props.secondsToMmSs ? props.secondsToMmSs(props.playHead || 0) : '0:00';

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
                className="flex-1 max-w-xs px-3 py-1 bg-gray-800 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:border-[var(--color-primary)]"
                placeholder="Project Name"
                title="Project Name"
            />

            <div className="flex items-center gap-1">
                {panelConfigs.map(({ key, icon: Icon, title }) => (
                    <button
                        key={key}
                        onClick={() => props.onTogglePanel(key)}
                        className={`p-2 rounded transition-colors ${props.panelVisibility?.[key] ? 'bg-blue-600/20 text-blue-400' : 'hover:bg-gray-800 text-gray-400'}`}
                        title={title}
                        aria-label={title}
                    >
                        <Icon className="w-5 h-5" />
                    </button>
                ))}
            </div>

            <div className="text-center text-lg font-mono min-w-[60px]">
                {timeDisplay}
            </div>
        </header>
    );
}