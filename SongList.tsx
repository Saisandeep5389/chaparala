

import React from 'react';
import { Song } from '../types';
import { MusicNoteIcon, PlayIcon, CloseIcon, SearchIcon, TrashIcon } from './Icons';

interface SongListProps {
  songs: Song[];
  playQueue: number[];
  currentSong: Song | null;
  onSongSelect: (index: number) => void;
  isPlaying: boolean;
  onClose: () => void;
  searchTerm: string;
  onSearchTermChange: (term: string) => void;
  onSongDelete: (songIndex: number) => void;
  canDelete: boolean;
}

const SongList: React.FC<SongListProps> = ({ songs, playQueue, currentSong, onSongSelect, isPlaying, onClose, searchTerm, onSearchTermChange, onSongDelete, canDelete }) => {

  const filteredQueue = playQueue.filter(songIndex => {
    const song = songs[songIndex];
    if (!song) return false;
    const lowerCaseSearchTerm = searchTerm.toLowerCase();
    return (
        song.name.toLowerCase().includes(lowerCaseSearchTerm) ||
        song.artist.toLowerCase().includes(lowerCaseSearchTerm) ||
        song.album.toLowerCase().includes(lowerCaseSearchTerm)
    );
  });
  
  const formatTime = (time: number) => {
    if (isNaN(time)) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between text-xl font-bold mb-4 sticky top-0 bg-gray-900/95 backdrop-blur-sm z-10 p-4 md:p-0 md:bg-transparent md:backdrop-blur-none">
        <h2 className="text-2xl font-bold">Your Library</h2>
      </div>
       <div className="relative mb-4">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
        <input
          type="text"
          placeholder="Search your library..."
          value={searchTerm}
          onChange={(e) => onSearchTermChange(e.target.value)}
          className="w-full bg-gray-900/50 border border-gray-700 rounded-lg pl-10 pr-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>
      <ul className="space-y-2 flex-grow overflow-y-auto pb-24">
        {filteredQueue.map((songIndex, queueIndex) => {
          const song = songs[songIndex];
          if (!song) return null;
          const isCurrent = currentSong?.id === song.id;
          return (
            <li
              key={`${song.id}-${queueIndex}`}
              onClick={() => onSongSelect(songIndex)}
              className={`flex items-center p-3 rounded-lg cursor-pointer transition-all duration-200 group ${
                isCurrent ? 'bg-purple-600/30 text-white' : 'hover:bg-gray-700/50 text-gray-300'
              }`}
            >
              <div className="w-10 h-10 bg-gray-700 rounded-md flex items-center justify-center mr-4 flex-shrink-0 relative">
                {song.coverArt ? (
                    <img src={song.coverArt} alt={song.album} className="w-full h-full object-cover rounded-md" />
                ) : (
                    <MusicNoteIcon className="w-5 h-5 text-gray-400" />
                )}
                {isCurrent && isPlaying && (
                    <div className="absolute inset-0 bg-black/50 rounded-md flex items-center justify-center">
                        <div className="w-5 h-5 flex items-center justify-around">
                            <span className="w-1 h-full bg-purple-400 animate-[bounce_1.2s_ease-in-out_infinite]"></span>
                            <span className="w-1 h-full bg-purple-400 animate-[bounce_1.4s_ease-in-out_infinite]"></span>
                            <span className="w-1 h-full bg-purple-400 animate-[bounce_1.6s_ease_in-out_infinite]"></span>
                        </div>
                    </div>
                )}
              </div>
              <div className="flex-grow overflow-hidden">
                <p className="font-semibold truncate">{song.name}</p>
                <p className="text-sm text-gray-400 truncate">{song.artist}</p>
              </div>
              <div className="ml-4 flex-shrink-0 w-20 text-right relative">
                 <span className={`text-sm text-gray-400 transition-opacity ${!isCurrent ? 'group-hover:opacity-0' : ''}`}>
                    {formatTime(song.duration)}
                </span>
                {!isCurrent && (
                    <div className="absolute inset-0 flex items-center justify-end opacity-0 group-hover:opacity-100 transition-opacity gap-2">
                        {canDelete && (
                            <button
                                onClick={(e) => { e.stopPropagation(); onSongDelete(songIndex); }}
                                className="p-1 text-gray-400 hover:text-red-500 rounded-full"
                                aria-label={`Delete ${song.name}`}
                            >
                                <TrashIcon className="w-5 h-5" />
                            </button>
                        )}
                        <PlayIcon className="w-6 h-6 text-gray-300" />
                    </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <style>{`
        @keyframes bounce {
          0%, 100% { transform: scaleY(0.4); }
          50% { transform: scaleY(1.0); }
        }
      `}</style>
    </div>
  );
};

export default SongList;