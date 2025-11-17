
import React from 'react';
import { Song } from '../types';
import { PlayIcon, PauseIcon, NextIcon } from './Icons';

interface MiniPlayerProps {
  song: Song | null;
  isPlaying: boolean;
  togglePlayPause: () => void;
  playNext: () => void;
  onExpand: () => void;
  currentTime: number;
  duration: number;
}

const MiniPlayer: React.FC<MiniPlayerProps> = ({ song, isPlaying, togglePlayPause, playNext, onExpand, currentTime, duration }) => {
  if (!song) {
    return null;
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40" onClick={onExpand}>
      <div className="bg-gray-800/80 backdrop-blur-lg w-full p-2.5 flex items-center gap-3 cursor-pointer shadow-lg">
        <img
          src={song.coverArt || 'https://picsum.photos/seed/music/100'}
          alt="Album Art"
          className="w-12 h-12 rounded-md object-cover"
        />
        <div className="flex-grow overflow-hidden">
          <p className="font-semibold truncate text-white">{song.name}</p>
          <p className="text-sm text-gray-400 truncate">{song.artist}</p>
        </div>
        <div className="flex items-center gap-2 pr-2">
          <button
            onClick={(e) => { e.stopPropagation(); togglePlayPause(); }}
            className="text-white p-2 rounded-full hover:bg-white/10"
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <PauseIcon className="w-6 h-6" /> : <PlayIcon className="w-6 h-6" />}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); playNext(); }}
            className="text-white p-2 rounded-full hover:bg-white/10 hidden sm:block"
            aria-label="Next song"
          >
            <NextIcon className="w-6 h-6" />
          </button>
        </div>
      </div>
      {/* Progress bar */}
      <div className="w-full bg-gray-600 h-1">
        <div className="bg-purple-500 h-1" style={{ width: `${progress}%` }}></div>
      </div>
    </div>
  );
};

export default MiniPlayer;
