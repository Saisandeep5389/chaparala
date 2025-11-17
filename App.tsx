

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Song } from './types';
import { RepeatMode } from './types';
import Player from './components/Player';
import SongList from './components/SongList';
import ConfirmationModal from './components/ConfirmationModal';
import MiniPlayer from './components/MiniPlayer';
import { FolderOpenIcon, MusicNoteIcon, RefreshIcon, SpinnerIcon } from './components/Icons';
import { getDirectoryHandle, setDirectoryHandle } from './db';

declare var jsmediatags: any;
const LOCAL_STORAGE_KEY = 'musicPlayerState';
const UI_STATE_KEY = 'musicPlayerUIState';

// A recursive function to get all files from a directory handle
async function getFilesRecursively(directoryHandle: FileSystemDirectoryHandle, currentPath: string[] = []): Promise<{file: File, path: string[]}[]> {
    const files: {file: File, path: string[]}[] = [];
    for await (const entry of directoryHandle.values()) {
        if (entry.kind === 'file') {
            const file = await entry.getFile();
            if (file.type.startsWith('audio/')) {
                files.push({ file, path: [...currentPath, entry.name] });
            }
        } else if (entry.kind === 'directory') {
            files.push(...await getFilesRecursively(entry, [...currentPath, entry.name]));
        }
    }
    return files;
}

interface NowPlayingSidebarProps {
  currentSong: Song | null;
  onExpand: () => void;
}

const NowPlayingSidebar: React.FC<NowPlayingSidebarProps> = ({ currentSong, onExpand }) => {
  return (
    <div className="hidden md:flex flex-col items-center p-6 bg-black/10 rounded-lg space-y-6 h-full">
      <h2 className="text-xl font-bold text-gray-300 self-start">Now Playing</h2>
      {currentSong ? (
        <div className="flex flex-col items-center text-center w-full">
          <div 
            className="relative w-full aspect-square rounded-lg shadow-2xl overflow-hidden cursor-pointer group mb-6"
            onClick={onExpand}
          >
            <img
              src={currentSong.coverArt || 'https://picsum.photos/seed/music/300'}
              alt="Album Art"
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                <p className="text-white font-bold opacity-0 group-hover:opacity-100 transition-opacity">View Player</p>
            </div>
          </div>
          <div className="w-full">
            <h3 className="text-2xl font-bold text-white truncate" title={currentSong.name}>
              {currentSong.name}
            </h3>
            <p className="text-lg text-gray-400">{currentSong.artist}</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center flex-grow w-full bg-gray-800/20 rounded-lg">
            <MusicNoteIcon className="w-16 h-16 text-gray-500"/>
            <p className="mt-4 text-gray-500">No song selected</p>
        </div>
      )}
    </div>
  );
};

const App: React.FC = () => {
  const [songs, setSongs] = useState<Song[]>([]);
  const [currentSongIndex, setCurrentSongIndex] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>(RepeatMode.NONE);
  const [isShuffled, setIsShuffled] = useState(false);
  const [playQueue, setPlayQueue] = useState<number[]>([]);
  const [originalQueue, setOriginalQueue] = useState<number[]>([]);
  const [directoryHandle, setHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<PermissionState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [initialTime, setInitialTime] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [songToDelete, setSongToDelete] = useState<number | null>(null);
  const [isPlayerExpanded, setIsPlayerExpanded] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const audioRef = useRef<HTMLAudioElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // On mount, check for a saved directory handle and restore UI state
  useEffect(() => {
    // Only check for saved handle if the API is supported
    if (typeof window.showDirectoryPicker === 'function') {
      const checkForSavedHandle = async () => {
        try {
          const handle = await getDirectoryHandle();
          if (handle) {
            const status = await handle.queryPermission({ mode: 'readwrite' });
            setHandle(handle);
            setPermissionStatus(status);
            if (status === 'granted') {
              setPermissionDenied(false);
              loadSongsFromHandle(handle);
            } else if (status === 'denied') {
              setPermissionDenied(true);
            }
          }
        } catch (error) {
            console.error("Error checking for saved directory handle:", error);
        }
      };
      checkForSavedHandle();
    }
    
    // Restore UI State from localStorage
    try {
      const savedUIStateJSON = localStorage.getItem(UI_STATE_KEY);
      if (savedUIStateJSON) {
        const savedUIState = JSON.parse(savedUIStateJSON);
        if (typeof savedUIState.searchTerm === 'string') {
          setSearchTerm(savedUIState.searchTerm);
        }
      }
    } catch (e) {
      console.error("Failed to load UI state from localStorage:", e);
      localStorage.removeItem(UI_STATE_KEY);
    }
  }, []);

  const getSongMetadata = (file: File): Promise<Partial<Song>> => {
    return new Promise((resolve) => {
        new jsmediatags.Reader(file)
            .setTagsToRead(["title", "artist", "album", "picture"])
            .read({
                onSuccess: (tagObject: any) => {
                    const { tags } = tagObject;
                    const metadata: Partial<Song> = {
                        name: tags.title || file.name.replace(/\.[^/.]+$/, ""),
                        artist: tags.artist || 'Unknown Artist',
                        album: tags.album || 'Unknown Album',
                    };

                    if (tags.picture) {
                        const { data, format } = tags.picture;
                        const blob = new Blob(data, { type: format });
                        metadata.coverArt = URL.createObjectURL(blob);
                    }
                    resolve(metadata);
                },
                onError: () => {
                    resolve({
                        name: file.name.replace(/\.[^/.]+$/, ""),
                        artist: 'Unknown Artist',
                        album: 'Unknown Album',
                    });
                }
            });
    });
  };

  const getAudioDuration = (url: string): Promise<number> => {
    return new Promise((resolve) => {
        const audio = new Audio(url);
        audio.onloadedmetadata = () => {
            resolve(audio.duration);
        };
        audio.onerror = () => {
            resolve(0); // Resolve with 0 if there's an error
        };
    });
  };

  const processAudioFiles = useCallback(async (audioFileEntries: { file: File, path: string[] }[]) => {
      if (audioFileEntries.length === 0) {
        alert("No audio files found.");
        return;
      }
      setIsLoading(true);
      try {
        const newSongs: Song[] = await Promise.all(audioFileEntries.map(async ({ file, path }) => {
            const url = URL.createObjectURL(file);
            const metadata = await getSongMetadata(file);
            const duration = await getAudioDuration(url);
            
            return {
                id: `${file.name}-${file.lastModified}`,
                name: metadata.name!,
                artist: metadata.artist!,
                album: metadata.album!,
                duration: duration,
                url,
                coverArt: metadata.coverArt,
                path
            };
        }));

        setSongs(newSongs);

        // Try to load saved state from localStorage
        const savedStateJSON = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (savedStateJSON) {
            try {
                const savedState = JSON.parse(savedStateJSON);
                // Validate if the saved state corresponds to the current song library
                if (savedState.songCount === newSongs.length && savedState.playQueue) {
                    setPlayQueue(savedState.playQueue);
                    setOriginalQueue(savedState.originalQueue);
                    setCurrentSongIndex(savedState.currentSongIndex);
                    setIsShuffled(savedState.isShuffled);
                    setRepeatMode(savedState.repeatMode);
                    setInitialTime(savedState.currentTime || 0);
                    setPlaybackRate(savedState.playbackRate || 1);
                    setIsPlaying(false); // Always start paused
                    return; // Exit if state is successfully restored
                }
            } catch (e) {
                console.error("Failed to parse saved state:", e);
                localStorage.removeItem(LOCAL_STORAGE_KEY);
            }
        }

        // If no valid saved state, initialize fresh
        const initialQueue = newSongs.map((_, index) => index);
        setOriginalQueue(initialQueue);
        setPlayQueue(initialQueue);
        setCurrentSongIndex(0);
        setIsPlaying(false);
        setInitialTime(0);
        setPlaybackRate(1);

      } finally {
        setIsLoading(false);
      }
  }, []);

  const loadSongsFromHandle = useCallback(async (handle: FileSystemDirectoryHandle) => {
      if (!handle) return;
      const audioFileEntries = await getFilesRecursively(handle);
      await processAudioFiles(audioFileEntries);
  }, [processAudioFiles]);

  const handleFileSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files) return;
    localStorage.removeItem(LOCAL_STORAGE_KEY); // Clear old state for new files
    const audioFiles = Array.from(event.target.files).filter(file => file.type.startsWith('audio/'));
    const audioFileEntries = audioFiles.map(file => ({ file, path: [file.name] }));
    await processAudioFiles(audioFileEntries);
  };

  const handleSelectFolder = async () => {
    // Modern API with persistence support
    if (typeof window.showDirectoryPicker === 'function') {
        try {
            const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
            localStorage.removeItem(LOCAL_STORAGE_KEY); // Clear old state for new folder
            await setDirectoryHandle(handle);
            setHandle(handle);
            setPermissionStatus('granted');
            setPermissionDenied(false); // Reset permission denied state on new selection
            await loadSongsFromHandle(handle);
        } catch (error) {
            // Do not log an error if the user cancels the picker
            if ((error as DOMException).name !== 'AbortError') {
              console.error("Error selecting directory:", error);
            }
        }
    } else {
        // Fallback for unsupported browsers
        console.warn("`showDirectoryPicker` is not supported. Using a fallback input.");
        fileInputRef.current?.click();
    }
  };

  const handleRestoreFolder = async () => {
      if(!directoryHandle) return;
      const status = await directoryHandle.requestPermission({ mode: 'readwrite' });
      setPermissionStatus(status);
      if (status === 'granted') {
          setPermissionDenied(false); // Reset permission denied state
          await loadSongsFromHandle(directoryHandle);
      } else if (status === 'denied') {
          setPermissionDenied(true);
      }
  };
  
    const handleSongDeleteRequest = (songIndex: number) => {
        setSongToDelete(songIndex);
    };

    const handleConfirmDelete = async () => {
        if (songToDelete === null || !directoryHandle) return;

        const deletedSongIndex = songToDelete;
        const song = songs[deletedSongIndex];

        try {
            // Re-verify write permission before deleting
            const permission = await directoryHandle.requestPermission({ mode: 'readwrite' });
            if (permission !== 'granted') {
                alert("Permission to write was denied. Cannot delete the file.");
                setSongToDelete(null);
                return;
            }

            // Traverse the path and delete the file
            let currentHandle = directoryHandle;
            for (let i = 0; i < song.path.length - 1; i++) {
                currentHandle = await currentHandle.getDirectoryHandle(song.path[i]);
            }
            await currentHandle.removeEntry(song.path[song.path.length - 1]);
            
            // --- Update application state ---
            const wasPlaying = isPlaying;
            const oldPlayingOriginalIndex = currentSongIndex !== null ? playQueue[currentSongIndex] : null;

            const newSongs = songs.filter((_, index) => index !== deletedSongIndex);
            
            if (newSongs.length === 0) {
                setSongs([]);
                setOriginalQueue([]);
                setPlayQueue([]);
                setCurrentSongIndex(null);
                setIsPlaying(false);
                localStorage.removeItem(LOCAL_STORAGE_KEY);
                return;
            }

            const newOriginalQueue = originalQueue.filter(i => i !== deletedSongIndex).map(i => (i > deletedSongIndex ? i - 1 : i));
            const newPlayQueue = playQueue.filter(i => i !== deletedSongIndex).map(i => (i > deletedSongIndex ? i - 1 : i));
            
            let newCurrentSongIndex = 0;
            
            if (oldPlayingOriginalIndex === deletedSongIndex) {
                // The song that was playing has been deleted, move to the next one
                const oldQueueIndex = currentSongIndex!;
                newCurrentSongIndex = oldQueueIndex % newPlayQueue.length;
                setInitialTime(0); // Start next song from the beginning
                setIsPlaying(wasPlaying); // Keep playing if it was active
            } else if (oldPlayingOriginalIndex !== null) {
                // Another song was deleted, find the current song's new position
                const newPlayingOriginalIndex = oldPlayingOriginalIndex > deletedSongIndex ? oldPlayingOriginalIndex - 1 : oldPlayingOriginalIndex;
                const newQueueIndex = newPlayQueue.indexOf(newPlayingOriginalIndex);
                newCurrentSongIndex = newQueueIndex !== -1 ? newQueueIndex : 0;
            }
            
            setSongs(newSongs);
            setOriginalQueue(newOriginalQueue);
            setPlayQueue(newPlayQueue);
            setCurrentSongIndex(newCurrentSongIndex);

        } catch (error) {
            console.error("Error deleting song:", error);
            alert(`Failed to delete '${song.name}'. Check console for details.`);
        } finally {
            setSongToDelete(null);
        }
    };
    
    const handleTimeUpdate = (time: number, dur: number) => {
        setCurrentTime(time);
        setDuration(dur);
    };

  useEffect(() => {
    const urlsToRevoke = songs.flatMap(s => [s.url, s.coverArt]).filter(Boolean) as string[];
    return () => {
      urlsToRevoke.forEach(url => URL.revokeObjectURL(url));
    };
  }, [songs]);
  
  // Save playback state on change
  useEffect(() => {
    if (songs.length > 0 && currentSongIndex !== null) {
      // Read existing state to preserve the accurately saved currentTime from the Player component
      const savedStateJSON = localStorage.getItem(LOCAL_STORAGE_KEY);
      let currentTime = 0;
      if (savedStateJSON) {
          try {
              currentTime = JSON.parse(savedStateJSON).currentTime || 0;
          } catch {
              // Ignore parsing errors, default to 0
          }
      }

      const stateToSave = {
        songCount: songs.length,
        playQueue,
        originalQueue,
        currentSongIndex,
        isShuffled,
        repeatMode,
        playbackRate,
        currentTime,
      };
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(stateToSave));
    }
  }, [songs.length, playQueue, originalQueue, currentSongIndex, isShuffled, repeatMode, playbackRate]);
  
  // Save UI state on change
  useEffect(() => {
    const uiStateToSave = {
      searchTerm,
    };
    localStorage.setItem(UI_STATE_KEY, JSON.stringify(uiStateToSave));
  }, [searchTerm]);

  // Save playback state on page close
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (songs.length > 0 && currentSongIndex !== null && audioRef.current) {
        const stateToSave = {
          songCount: songs.length,
          playQueue,
          originalQueue,
          currentSongIndex,
          isShuffled,
          repeatMode,
          playbackRate,
          currentTime: audioRef.current.currentTime,
        };
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(stateToSave));
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [songs.length, playQueue, originalQueue, currentSongIndex, isShuffled, repeatMode, playbackRate]);


  const currentSong = currentSongIndex !== null ? songs[playQueue[currentSongIndex]] : null;

  const playSong = useCallback((index: number) => {
    const queueIndex = playQueue.findIndex(i => i === index);
    if(queueIndex !== -1) {
        if (currentSongIndex !== queueIndex) setInitialTime(0);
        setCurrentSongIndex(queueIndex);
        setIsPlaying(true);
    } else {
        // If not in queue (e.g., shuffle is on), find it in original and play
        const originalIndex = originalQueue.indexOf(index);
        if(originalIndex !== -1) {
            if (currentSongIndex !== originalIndex) setInitialTime(0);
            setCurrentSongIndex(originalIndex);
            setIsPlaying(true);
        }
    }
  }, [playQueue, originalQueue, currentSongIndex]);

  const handleSongSelect = (index: number) => {
    playSong(index);
    setIsPlayerExpanded(false); // Close panel on song selection
  };

  const togglePlayPause = useCallback(() => {
    if (currentSongIndex === null && songs.length > 0) {
      setCurrentSongIndex(0);
      setIsPlaying(true);
    } else {
      setIsPlaying(prev => !prev);
    }
  }, [currentSongIndex, songs.length]);

  const playNext = useCallback(() => {
    if (currentSongIndex === null) return;
    let nextIndex = (currentSongIndex + 1);
    if (nextIndex >= playQueue.length) {
      if(repeatMode === RepeatMode.ALL) {
        nextIndex = 0;
      } else {
        setIsPlaying(false);
        return;
      }
    }
    setInitialTime(0);
    setCurrentSongIndex(nextIndex);
    setIsPlaying(true);
  }, [currentSongIndex, playQueue.length, repeatMode]);

  const playPrev = useCallback(() => {
    if (currentSongIndex === null) return;
    const prevIndex = (currentSongIndex - 1 + playQueue.length) % playQueue.length;
    setInitialTime(0);
    setCurrentSongIndex(prevIndex);
    setIsPlaying(true);
  }, [currentSongIndex, playQueue.length]);

  const toggleShuffle = useCallback(() => {
    setIsShuffled(prev => {
        const nextIsShuffled = !prev;
        if(nextIsShuffled) {
            const currentSongOriginalIndex = currentSongIndex !== null ? playQueue[currentSongIndex] : -1;
            const shuffled = [...originalQueue].sort(() => Math.random() - 0.5);
            const newQueue = [...shuffled];
            if (currentSongOriginalIndex !== -1) {
                const currentInShuffled = newQueue.indexOf(currentSongOriginalIndex);
                if (currentInShuffled > 0) {
                    [newQueue[0], newQueue[currentInShuffled]] = [newQueue[currentInShuffled], newQueue[0]];
                }
            }
            setPlayQueue(newQueue);
            setCurrentSongIndex(0);
        } else {
            const currentSongOriginalIndex = currentSongIndex !== null ? playQueue[currentSongIndex] : -1;
            setPlayQueue(originalQueue);
            if(currentSongOriginalIndex !== -1) {
                setCurrentSongIndex(originalQueue.indexOf(currentSongOriginalIndex));
            } else {
                setCurrentSongIndex(0);
            }
        }
        return nextIsShuffled;
    });
  }, [originalQueue, playQueue, currentSongIndex]);

  const cycleRepeatMode = useCallback(() => {
    setRepeatMode(prev => (prev + 1) % 3);
  }, []);
  
  return (
    <div className="relative min-h-screen text-white flex flex-col font-sans overflow-hidden">
        {/* Background Layer */}
        <div
            className="absolute inset-0 bg-cover bg-center transition-all duration-1000 z-0"
            style={{
                backgroundImage: currentSong?.coverArt ? `url(${currentSong.coverArt})` : 'none',
                opacity: currentSong?.coverArt ? 1 : 0,
                filter: 'blur(32px) brightness(0.3)',
                transform: 'scale(1.2)',
            }}
        />
        {/* Glassmorphism overlay */}
        <div className="absolute inset-0 bg-black/20 backdrop-blur-sm z-0" />
        
       <ConfirmationModal
            isOpen={songToDelete !== null}
            onClose={() => setSongToDelete(null)}
            onConfirm={handleConfirmDelete}
            title="Delete Song"
            message={`Are you sure you want to delete "${songToDelete !== null ? songs[songToDelete]?.name : ''}"? This action is irreversible and will permanently remove the file from your disk.`}
        />

      <main className="relative z-10 flex-grow flex flex-col overflow-hidden">
        {isLoading ? (
          <div className="flex-grow flex flex-col items-center justify-center text-center p-8">
            <SpinnerIcon className="w-16 h-16 animate-spin text-purple-400 mb-6" />
            <h2 className="text-2xl font-bold mb-2">Scanning Your Music...</h2>
            <p className="text-gray-400">Please wait while we're preparing your library.</p>
          </div>
        ) : songs.length === 0 ? (
           <div className="flex-grow flex flex-col items-center justify-center text-center p-4 sm:p-8">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelection}
              webkitdirectory=""
              directory=""
              multiple
              className="hidden"
              accept="audio/*"
            />
            <div className="bg-black/20 backdrop-blur-md p-8 sm:p-12 rounded-2xl shadow-2xl border border-white/10 max-w-2xl w-full">
                <MusicNoteIcon className="w-28 h-28 sm:w-32 sm:h-32 text-purple-400 mb-6 mx-auto" />
                <h1 className="text-4xl sm:text-5xl font-bold mb-3">Offline Music Player</h1>
                <p className="text-gray-300 mb-8 max-w-md mx-auto text-lg">
                  Your music, your browser, your rules. No uploads, no cloud. Just pure offline playback.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <button 
                    onClick={handleSelectFolder}
                    className="cursor-pointer bg-purple-600 hover:bg-purple-500 text-white font-bold py-4 px-8 rounded-full text-lg transition-all transform hover:scale-105 inline-flex items-center justify-center gap-3 shadow-lg shadow-purple-900/50">
                      <FolderOpenIcon className="w-6 h-6" />
                      Select Music Folder
                  </button>
                  {permissionStatus === 'prompt' && directoryHandle && (
                    <button 
                      onClick={handleRestoreFolder}
                      className="cursor-pointer bg-gray-700 hover:bg-gray-600 text-white font-bold py-4 px-8 rounded-full text-lg transition-all transform hover:scale-105 inline-flex items-center justify-center gap-3 shadow-lg">
                        <RefreshIcon className="w-6 h-6" />
                        Restore Folder
                    </button>
                  )}
                </div>
                {permissionDenied && (
                    <p className="text-red-400 mt-6 max-w-md mx-auto bg-red-900/50 p-4 rounded-lg border border-red-500">
                        Access to the previously selected folder was denied. Please select the folder again to grant permission.
                    </p>
                )}
            </div>
          </div>
        ) : (
          <>
            {/* Full Screen Player Modal */}
            <div className={`fixed inset-0 z-50 bg-gray-900/95 backdrop-blur-sm transition-transform duration-300 ease-in-out flex items-center justify-center ${isPlayerExpanded ? 'translate-y-0' : 'translate-y-full'}`}>
              {currentSong && (
                <Player
                  song={currentSong}
                  isPlaying={isPlaying}
                  setIsPlaying={setIsPlaying}
                  togglePlayPause={togglePlayPause}
                  playNext={playNext}
                  playPrev={playPrev}
                  audioRef={audioRef}
                  repeatMode={repeatMode}
                  cycleRepeatMode={cycleRepeatMode}
                  isShuffled={isShuffled}
                  toggleShuffle={toggleShuffle}
                  initialTime={initialTime}
                  onInitialTimeApplied={() => setInitialTime(0)}
                  playbackRate={playbackRate}
                  setPlaybackRate={setPlaybackRate}
                  onCollapse={() => setIsPlayerExpanded(false)}
                  onTimeUpdate={handleTimeUpdate}
                />
              )}
            </div>

            {/* Main Content Area */}
            <div className="flex-grow w-full grid md:grid-cols-3 lg:grid-cols-4 gap-6 p-4 overflow-hidden">
                <NowPlayingSidebar 
                    currentSong={currentSong} 
                    onExpand={() => setIsPlayerExpanded(true)}
                />
                
                {/* Playlist */}
                <div className="md:col-span-2 lg:col-span-3 h-full overflow-hidden">
                   <SongList
                      songs={songs}
                      playQueue={playQueue}
                      currentSong={currentSong}
                      onSongSelect={handleSongSelect}
                      onSongDelete={handleSongDeleteRequest}
                      canDelete={!!directoryHandle}
                      isPlaying={isPlaying}
                      onClose={() => {}} // No-op
                      searchTerm={searchTerm}
                      onSearchTermChange={setSearchTerm}
                    />
                </div>
            </div>
            
            {/* Mini Player */}
            {currentSong && (
              <MiniPlayer
                  song={currentSong}
                  isPlaying={isPlaying}
                  togglePlayPause={togglePlayPause}
                  playNext={playNext}
                  onExpand={() => setIsPlayerExpanded(true)}
                  currentTime={currentTime}
                  duration={duration}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default App;