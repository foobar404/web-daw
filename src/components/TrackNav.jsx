import React from 'react';
import { FiPlay, FiPause, FiDownload } from 'react-icons/fi';

export function TrackNav(props) {
    const playDisabled = (props.tracks || []).length === 0
    const timeDisplay = props.secondsToMmSs ? props.secondsToMmSs(props.playHead || 0) : '0:00'
    return (
        <header className={`pattern flex items-center gap-4 p-5 backdrop-brightness-105 text-[var(--color-primary)] shadow-xl rounded-lg z-10 ${props.className || ''}`}>
            <div className="flex items-center gap-2">
                <button onClick={props.togglePlayPause} disabled={playDisabled} className={`p-2 rounded hover:bg-gray-800 ${playDisabled ? 'opacity-50 cursor-not-allowed' : ''}`} title="Play/Pause" aria-label="Play/Pause">
                    {props.isPlaying ? <FiPause className="w-5 h-5" /> : <FiPlay className="w-5 h-5" />}
                </button>
                <button onClick={props.exportMp3} className="p-2 rounded hover:bg-gray-800" title="Export MP3" aria-label="Export MP3">
                    <FiDownload className="w-5 h-5" />
                </button>
            </div>
            <div className="flex-1 text-center text-lg font-mono">
                {timeDisplay}
            </div>
            <div className="w-20"></div>
        </header>
    )
}