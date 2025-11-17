
import React, { useState, useEffect } from 'react';

interface TimerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSetTimer: (minutes: number) => void;
}

const TimerModal: React.FC<TimerModalProps> = ({ isOpen, onClose, onSetTimer }) => {
  const [customMinutes, setCustomMinutes] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setCustomMinutes('');
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const handleSetTimer = (minutes: number) => {
    onSetTimer(minutes);
    onClose();
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const minutes = parseInt(customMinutes, 10);
    if (!isNaN(minutes) && minutes > 0) {
      handleSetTimer(minutes);
    }
  };

  const timerOptions = [15, 30, 45, 60, 90];

  return (
    <div 
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 transition-opacity duration-300"
      onClick={onClose}
    >
      <div 
        className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-sm text-white transform transition-all duration-300 scale-95"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold mb-4 text-center">Sleep Timer</h2>
        <div className="grid grid-cols-3 gap-3 mb-4">
          {timerOptions.map(min => (
            <button
              key={min}
              onClick={() => handleSetTimer(min)}
              className="p-3 bg-gray-700 rounded-md hover:bg-purple-600 transition-colors"
            >
              {min} min
            </button>
          ))}
          <button
              onClick={() => handleSetTimer(0)}
              className="p-3 col-span-3 bg-red-600/50 rounded-md hover:bg-red-600 transition-colors"
            >
              Cancel Timer
            </button>
        </div>
        <form onSubmit={handleCustomSubmit} className="flex gap-2">
          <input
            type="number"
            value={customMinutes}
            onChange={(e) => setCustomMinutes(e.target.value)}
            placeholder="Custom (min)"
            className="flex-grow p-2 bg-gray-700 rounded-md border border-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-500"
            min="1"
          />
          <button type="submit" className="p-2 px-4 bg-purple-600 rounded-md hover:bg-purple-700 transition-colors">
            Set
          </button>
        </form>
      </div>
    </div>
  );
};

export default TimerModal;
