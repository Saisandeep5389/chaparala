import React, { useState, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import { SpinnerIcon, CloseIcon } from './Icons';

interface ArtistInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  artistName: string;
}

const ArtistInfoModal: React.FC<ArtistInfoModalProps> = ({ isOpen, onClose, artistName }) => {
  const [info, setInfo] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && artistName && artistName !== 'Unknown Artist') {
      const fetchArtistInfo = async () => {
        setIsLoading(true);
        setError(null);
        setInfo('');
        try {
          const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
          const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Tell me a short, interesting biography about the musical artist: "${artistName}". Focus on their musical style and key achievements. Keep it to about 2-3 paragraphs.`,
          });
          setInfo(response.text);
        } catch (e) {
          console.error("Error fetching artist info:", e);
          setError("Could not fetch artist information. The API key might be missing or invalid. Please try again later.");
        } finally {
          setIsLoading(false);
        }
      };

      fetchArtistInfo();
    }
  }, [isOpen, artistName]);

  if (!isOpen) {
    return null;
  }

  return (
    <div 
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 transition-opacity duration-300"
      onClick={onClose}
    >
      <div 
        className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-lg text-white transform transition-all duration-300 scale-95 flex flex-col"
        onClick={e => e.stopPropagation()}
        style={{ maxHeight: '80vh' }}
      >
        <div className="flex justify-between items-center mb-4 flex-shrink-0">
            <h2 className="text-2xl font-bold">About {artistName}</h2>
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-white rounded-full">
                <CloseIcon />
            </button>
        </div>
        <div className="flex-grow overflow-y-auto pr-2">
            {isLoading && (
                <div className="flex flex-col items-center justify-center h-48">
                    <SpinnerIcon className="w-12 h-12 animate-spin text-purple-400 mb-4" />
                    <p className="text-gray-400">Fetching artist info...</p>
                </div>
            )}
            {error && <p className="text-red-400 bg-red-900/50 p-3 rounded-md">{error}</p>}
            {info && (
                <div className="prose prose-invert text-gray-300 whitespace-pre-wrap">
                    {info.split('\n\n').map((paragraph, index) => <p key={index}>{paragraph}</p>)}
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default ArtistInfoModal;
