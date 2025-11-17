import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Song, RepeatMode } from '../types';
import { PlayIcon, PauseIcon, NextIcon, PrevIcon, ShuffleIcon, RepeatIcon, RepeatOneIcon, VolumeUpIcon, VolumeMuteIcon, TimerIcon, ChevronDownIcon, InfoIcon } from './Icons';
import TimerModal from './TimerModal';
import ArtistInfoModal from './ArtistInfoModal';

const LOCAL_STORAGE_KEY = 'musicPlayerState';

interface PlayerProps {
  song: Song;
  isPlaying: boolean;
  setIsPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  togglePlayPause: () => void;
  playNext: () => void;
  playPrev: () => void;
  audioRef: React.RefObject<HTMLAudioElement>;
  repeatMode: RepeatMode;
  cycleRepeatMode: () => void;
  isShuffled: boolean;
  toggleShuffle: () => void;
  initialTime: number;
  onInitialTimeApplied: () => void;
  playbackRate: number;
  setPlaybackRate: React.Dispatch<React.SetStateAction<number>>;
  onCollapse: () => void;
  onTimeUpdate: (time: number, duration: number) => void;
}

const Player: React.FC<PlayerProps> = ({ song, isPlaying, togglePlayPause, playNext, playPrev, audioRef, repeatMode, cycleRepeatMode, isShuffled, toggleShuffle, setIsPlaying, initialTime, onInitialTimeApplied, playbackRate, setPlaybackRate, onCollapse, onTimeUpdate }) => {
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isTimerModalOpen, setIsTimerModalOpen] = useState(false);
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
  const sleepTimerRef = useRef<number | null>(null);
  const lastSaveTimeRef = useRef(0);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<{
    context: AudioContext;
    analyser: AnalyserNode;
    source: MediaElementAudioSourceNode;
    dataArray: Uint8Array;
  } | null>(null);
  const animationFrameId = useRef<number | null>(null);

  // Effect to set up the Web Audio API for the visualizer
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const setupAudioContext = () => {
      // Create context and nodes only once
      if (!audioContextRef.current) {
        const context = new (window.AudioContext)();
        const source = context.createMediaElementSource(audio);
        const analyser = context.createAnalyser();

        analyser.fftSize = 256;
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        source.connect(analyser);
        analyser.connect(context.destination);

        audioContextRef.current = { context, source, analyser, dataArray };
      }
      
      // Resume context if it was suspended
      if (audioContextRef.current.context.state === 'suspended') {
        audioContextRef.current.context.resume();
      }
    };

    // The AudioContext must be created after a user gesture. The 'play' event is a reliable way to do this.
    audio.addEventListener('play', setupAudioContext);

    return () => {
      audio.removeEventListener('play', setupAudioContext);
      // Clean up animation frame on component unmount
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [audioRef]);


  // Effect for drawing the visualizer
  useEffect(() => {
    if (!isPlaying || !canvasRef.current || !audioContextRef.current) {
      if(animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
        const canvas = canvasRef.current;
        const canvasCtx = canvas?.getContext('2d');
        if (canvas && canvasCtx) {
          canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
      return;
    }
    
    const { analyser, dataArray } = audioContextRef.current;
    const canvas = canvasRef.current;
    const canvasCtx = canvas.getContext('2d');

    if (!canvasCtx) return;

    const bufferLength = analyser.frequencyBinCount;
    
    const draw = () => {
        animationFrameId.current = requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArray);

        // Set canvas dimensions dynamically to match element size for responsiveness
        const { width, height } = canvas.getBoundingClientRect();
        if(canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }

        canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
        
        const barWidth = (canvas.width / bufferLength);
        let barHeight;
        let x = 0;
        
        const gradient = canvasCtx.createLinearGradient(0, 0, 0, canvas.height);
        gradient.addColorStop(0, 'rgba(192, 132, 252, 0.8)'); // purple-300
        gradient.addColorStop(0.5, 'rgba(124, 58, 237, 0.5)'); // purple-600
        gradient.addColorStop(1, 'rgba(124, 58, 237, 0.2)');   // purple-600

        for (let i = 0; i < bufferLength; i++) {
            barHeight = dataArray[i] * (canvas.height / 256);
            
            canvasCtx.fillStyle = gradient;
            canvasCtx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);

            x += barWidth;
        }
    };

    draw();

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [isPlaying]);

  // Effect to handle song source changes. It now only loads the new song data.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleMetadataLoaded = () => {
      audio.currentTime = initialTime;
      setCurrentTime(initialTime);
      onTimeUpdate(initialTime, audio.duration || 0);
      // "Consume" the initial time so it's not reused on the next track
      if (initialTime > 0) {
        onInitialTimeApplied();
      }
    };
    
    // When the song changes, set the new source and load it.
    // This will interrupt any previous playback, which is intended.
    audio.src = song.url;
    audio.load();
    audio.addEventListener('loadedmetadata', handleMetadataLoaded);

    return () => {
      audio.removeEventListener('loadedmetadata', handleMetadataLoaded);
    };
    // This hook no longer depends on `isPlaying` to prevent re-loading on play/pause.
  }, [song.url, initialTime, onInitialTimeApplied, onTimeUpdate]);

  // Effect to handle play/pause state. This now also handles autoplaying new songs.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      // The play() method is asynchronous and returns a promise.
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          // The "interrupted by a new load request" error is an AbortError.
          // This is expected behavior when the user changes songs while one is playing.
          // We can safely ignore it to prevent cluttering the console.
          if (error.name !== 'AbortError') {
            console.error("Error playing audio:", error);
          }
        });
      }
    } else {
      audio.pause();
    }
    // By depending on `song.url`, this effect will re-run when the song changes,
    // which correctly triggers `play()` if `isPlaying` is true.
  }, [isPlaying, song.url]);

  // Effect to handle loop property
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.loop = repeatMode === RepeatMode.ONE;
  }, [repeatMode, audioRef]);

  // Effect to apply playback rate
  useEffect(() => {
    if (audioRef.current) {
        audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate, audioRef]);


  // Effect for time updates and song ending
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
        const now = Date.now();
        const time = audio.currentTime;
        const duration = audio.duration;
        setCurrentTime(time);
        onTimeUpdate(time, isNaN(duration) ? 0 : duration);

        // Throttle saving currentTime to localStorage to every 5 seconds
        if (now - lastSaveTimeRef.current > 5000) {
            lastSaveTimeRef.current = now;
            const savedStateJSON = localStorage.getItem(LOCAL_STORAGE_KEY);
            if (savedStateJSON) {
                try {
                    const savedState = JSON.parse(savedStateJSON);
                    savedState.currentTime = audio.currentTime;
                    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(savedState));
                } catch (e) {
                    console.error("Failed to update saved state with current time:", e);
                }
            }
        }
    };

    const handleSongEnd = () => {
      if (repeatMode !== RepeatMode.ONE) {
        playNext();
      }
    };
    
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleSongEnd);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleSongEnd);
    };
  }, [playNext, repeatMode, audioRef, onTimeUpdate]);

  useEffect(() => {
    if(audioRef.current) {
        audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted, audioRef]);

  // Handle Media Session API for native OS media controls
  useEffect(() => {
    if (!('mediaSession' in navigator)) {
      return;
    }

    const { mediaSession } = navigator;

    mediaSession.metadata = new MediaMetadata({
      title: song.name,
      artist: song.artist,
      album: song.album,
      artwork: song.coverArt ? [{ src: song.coverArt, sizes: '512x512' }] : [],
    });

    mediaSession.setActionHandler('play', () => {
      if (!isPlaying) togglePlayPause();
    });
    mediaSession.setActionHandler('pause', () => {
      if (isPlaying) togglePlayPause();
    });
    mediaSession.setActionHandler('nexttrack', playNext);
    mediaSession.setActionHandler('previoustrack', playPrev);

    return () => {
      mediaSession.metadata = null;
      mediaSession.setActionHandler('play', null);
      mediaSession.setActionHandler('pause', null);
      mediaSession.setActionHandler('nexttrack', null);
      mediaSession.setActionHandler('previoustrack', null);
    };
  }, [song, isPlaying, togglePlayPause, playNext, playPrev]);


  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (audioRef.current) {
      const newTime = Number(e.target.value);
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const formatTime = (time: number) => {
    if (isNaN(time)) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = Number(e.target.value);
    setVolume(newVolume);
    if(newVolume > 0 && isMuted) {
        setIsMuted(false);
    } else if (newVolume === 0 && !isMuted) {
        setIsMuted(true);
    }
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  const setSleepTimer = useCallback((minutes: number) => {
    if (sleepTimerRef.current) {
      clearTimeout(sleepTimerRef.current);
    }
    if (minutes > 0) {
      sleepTimerRef.current = window.setTimeout(() => {
        if(audioRef.current) {
            audioRef.current.pause();
        }
        setIsPlaying(false);
      }, minutes * 60 * 1000);
    }
  }, [audioRef, setIsPlaying]);

  const playbackSpeeds = [0.75, 1, 1.25, 1.5];
  const cyclePlaybackRate = () => {
    const currentIndex = playbackSpeeds.indexOf(playbackRate);
    const nextIndex = (currentIndex + 1) % playbackSpeeds.length;
    setPlaybackRate(playbackSpeeds[nextIndex]);
  };

  const RepeatButtonIcon = () => {
    switch(repeatMode) {
        case RepeatMode.ONE: return <RepeatOneIcon />;
        case RepeatMode.ALL: return <RepeatIcon className="text-purple-400"/>;
        default: return <RepeatIcon />;
    }
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-between p-4 sm:p-6 text-white">
      <audio ref={audioRef} />
      {/* Header */}
      <div className="w-full flex items-center justify-between flex-shrink-0">
          <button onClick={onCollapse} className="p-2 text-gray-400 hover:text-white z-10">
            <ChevronDownIcon />
          </button>
          <span className="text-gray-400 font-bold uppercase text-sm">Now Playing</span>
          <button className="p-2 text-gray-400 hover:text-white invisible">
             <ChevronDownIcon /> {/* Just for spacing */}
          </button>
      </div>

      {/* Album Art & Visualizer */}
      <div className="relative w-64 h-64 md:w-80 md:h-80 my-4 flex-shrink-0">
        <img
          src={song.coverArt || 'https://picsum.photos/seed/music/300'}
          alt="Album Art"
          className="w-full h-full rounded-2xl shadow-2xl object-cover"
        />
        <div className="absolute inset-0 bg-black/20 rounded-2xl"></div>
         {/* Visualizer Canvas */}
        <div className="absolute inset-x-0 bottom-0 h-1/2 rounded-b-2xl overflow-hidden pointer-events-none">
            <canvas
                ref={canvasRef}
                className="w-full h-full opacity-60"
            />
        </div>
      </div>

      {/* Song Info & Progress */}
      <div className="w-full max-w-md text-center">
        <h2 className="text-2xl font-bold truncate" title={song.name}>{song.name}</h2>
        <p className="text-gray-400 text-lg">{song.artist}</p>
        
        {/* Progress Bar */}
        <div className="w-full mt-4">
            <input
              type="range"
              min="0"
              max={song.duration || 0}
              value={currentTime}
              onChange={handleSeek}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer range-lg"
              style={{ backgroundSize: `${(currentTime / (song.duration || 1)) * 100}% 100%` }}
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(song.duration)}</span>
            </div>
        </div>
      </div>

      {/* Controls */}
      <div className="w-full max-w-md mt-4 mb-4">
          {/* Main Controls */}
          <div className="flex items-center justify-center gap-4 w-full">
             <button onClick={toggleShuffle} className={`p-2 rounded-full transition-colors ${isShuffled ? 'text-purple-400' : 'text-gray-400 hover:text-white'}`}>
                <ShuffleIcon />
            </button>
            <button onClick={playPrev} className="p-2 rounded-full text-gray-200 hover:text-white transition-transform transform hover:scale-110">
              <PrevIcon />
            </button>
            <button onClick={togglePlayPause} className="bg-purple-600 hover:bg-purple-700 text-white p-4 rounded-full shadow-lg transition-transform transform hover:scale-110">
              {isPlaying ? <PauseIcon /> : <PlayIcon />}
            </button>
            <button onClick={playNext} className="p-2 rounded-full text-gray-200 hover:text-white transition-transform transform hover:scale-110">
              <NextIcon />
            </button>
             <button onClick={cycleRepeatMode} className={`p-2 rounded-full transition-colors ${repeatMode === RepeatMode.NONE ? 'text-gray-400 hover:text-white' : 'text-purple-400'}`}>
                <RepeatButtonIcon />
            </button>
          </div>
          
          {/* Volume and Timer */}
          <div className="flex items-center justify-between w-full gap-4 text-gray-400 mt-4">
            <button onClick={() => setIsTimerModalOpen(true)} className="hover:text-white transition-colors w-12 text-left">
                <TimerIcon />
            </button>
            <div className="flex items-center gap-2 flex-grow">
                <button onClick={toggleMute} className="hover:text-white transition-colors">
                    {isMuted || volume === 0 ? <VolumeMuteIcon /> : <VolumeUpIcon />}
                </button>
                <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={isMuted ? 0 : volume}
                    onChange={handleVolumeChange}
                    className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                />
            </div>
            <div className="flex items-center gap-2">
               <button 
                  onClick={() => setIsInfoModalOpen(true)} 
                  className="hover:text-white transition-colors p-2 disabled:text-gray-600 disabled:cursor-not-allowed"
                  aria-label={`Get info about ${song.artist}`}
                  disabled={!song.artist || song.artist === 'Unknown Artist'}
                >
                  <InfoIcon className="w-5 h-5"/>
                </button>
                <button 
                  onClick={cyclePlaybackRate} 
                  className="hover:text-white transition-colors font-mono font-bold text-center w-12"
                  aria-label={`Change playback speed. Current speed: ${playbackRate}x`}
                >
                  {playbackRate.toFixed(2)}x
                </button>
            </div>
          </div>
      </div>
      <TimerModal isOpen={isTimerModalOpen} onClose={() => setIsTimerModalOpen(false)} onSetTimer={setSleepTimer} />
      <ArtistInfoModal isOpen={isInfoModalOpen} onClose={() => setIsInfoModalOpen(false)} artistName={song.artist} />
    </div>
  );
};


export default Player;