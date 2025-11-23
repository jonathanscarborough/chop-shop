'use client';

import { useState, useEffect, useRef } from 'react';

interface MetronomeProps {
  isPlaying?: boolean;
  onBpmChange?: (bpm: number) => void;
  onSubdivisionChange?: (subdivision: number) => void;
  layout?: 'vertical' | 'horizontal';
}

// Beat subdivision options: 1 = quarter note, 2 = 8th, 4 = 16th, 8 = 32nd
export type BeatSubdivision = 1 | 2 | 4 | 8;

export default function Metronome({ isPlaying = false, onBpmChange, onSubdivisionChange, layout = 'vertical' }: MetronomeProps) {
  const [isEnabled, setIsEnabled] = useState(false);
  const [bpm, setBpm] = useState(120);
  const [subdivision, setSubdivision] = useState<BeatSubdivision>(4); // Default to 16th notes
  const [tapTimes, setTapTimes] = useState<number[]>([]);
  const [isTapping, setIsTapping] = useState(false);
  const [isFlashing, setIsFlashing] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const tapTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const flashTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Notify parent of BPM changes
  useEffect(() => {
    if (onBpmChange) {
      onBpmChange(bpm);
    }
  }, [bpm, onBpmChange]);

  // Notify parent of subdivision changes
  useEffect(() => {
    if (onSubdivisionChange) {
      onSubdivisionChange(subdivision);
    }
  }, [subdivision, onSubdivisionChange]);

  useEffect(() => {
    // Initialize a separate audio context for the metronome
    // This ensures it won't be recorded with the master recording
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (tapTimeoutRef.current) {
        clearTimeout(tapTimeoutRef.current);
      }
      if (flashTimeoutRef.current) {
        clearTimeout(flashTimeoutRef.current);
      }
      // Note: We don't close the audio context here because it's isolated
      // and will be garbage collected when the component unmounts
    };
  }, []);

  useEffect(() => {
    // Start or stop metronome based on enabled state
    if (isEnabled && audioContextRef.current) {
      // Resume AudioContext if suspended (required by browser autoplay policy)
      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().then(() => {
          startMetronome();
        });
      } else {
        startMetronome();
      }
    } else {
      stopMetronome();
    }

    return () => {
      stopMetronome();
    };
  }, [isEnabled, bpm]);

  const playClick = () => {
    if (!audioContextRef.current) return;

    const ctx = audioContextRef.current;
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.frequency.value = 1000; // 1kHz click
    gainNode.gain.value = 0.3;

    oscillator.start(ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);
    oscillator.stop(ctx.currentTime + 0.05);

    // Trigger visual flash
    setIsFlashing(true);
    if (flashTimeoutRef.current) {
      clearTimeout(flashTimeoutRef.current);
    }
    flashTimeoutRef.current = setTimeout(() => {
      setIsFlashing(false);
    }, 100); // Flash for 100ms
  };

  const startMetronome = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    const interval = 60000 / bpm; // Convert BPM to milliseconds
    intervalRef.current = setInterval(() => {
      playClick();
    }, interval);

    // Play first click immediately
    playClick();
  };

  const stopMetronome = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const handleBpmChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;

    // Allow empty string for editing
    if (value === '') {
      return;
    }

    const numValue = parseInt(value);
    if (!isNaN(numValue) && numValue >= 20 && numValue <= 300) {
      setBpm(numValue);
    }
  };

  const handleBpmBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);

    // If invalid or out of range, reset to current bpm
    if (isNaN(value) || value < 20 || value > 300) {
      e.target.value = bpm.toString();
    }
  };

  const handleTapTempo = () => {
    const now = Date.now();

    // Clear existing timeout
    if (tapTimeoutRef.current) {
      clearTimeout(tapTimeoutRef.current);
    }

    setIsTapping(true);

    // Add current tap time
    const newTapTimes = [...tapTimes, now];

    // Keep only the last 4 taps for more accurate calculation
    const recentTaps = newTapTimes.slice(-4);
    setTapTimes(recentTaps);

    // Calculate BPM if we have at least 2 taps
    if (recentTaps.length >= 2) {
      const intervals: number[] = [];
      for (let i = 1; i < recentTaps.length; i++) {
        intervals.push(recentTaps[i] - recentTaps[i - 1]);
      }

      // Average interval in milliseconds
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;

      // Convert to BPM
      const calculatedBpm = Math.round(60000 / avgInterval);

      // Only update if within valid range
      if (calculatedBpm >= 20 && calculatedBpm <= 300) {
        setBpm(calculatedBpm);
      }
    }

    // Reset tap times after 2 seconds of no tapping
    tapTimeoutRef.current = setTimeout(() => {
      setTapTimes([]);
      setIsTapping(false);
    }, 2000);
  };

  const getSubdivisionLabel = (sub: BeatSubdivision): string => {
    switch (sub) {
      case 1: return '1/4';
      case 2: return '1/8';
      case 4: return '1/16';
      case 8: return '1/32';
    }
  };

  // Metronome SVG Icon (traditional triangular design)
  const MetronomeIcon = () => (
    <svg
      className={`w-8 h-8 cursor-pointer transition-all hover:scale-110 ${
        isEnabled ? 'text-green-500' : 'text-gray-500'
      }`}
      viewBox="0 0 100 100"
      fill="currentColor"
      onClick={() => setIsEnabled(!isEnabled)}
    >
      {/* Base */}
      <rect x="20" y="85" width="60" height="8" rx="2" />
      {/* Triangular body */}
      <path d="M 50 15 L 25 85 L 75 85 Z" />
      {/* Pendulum rod */}
      <line
        x1="50"
        y1="25"
        x2={isEnabled && isFlashing ? "60" : "55"}
        y2="70"
        stroke={isEnabled ? "#22c55e" : "#6b7280"}
        strokeWidth="2"
        strokeLinecap="round"
        className="transition-all duration-75"
      />
      {/* Pendulum weight */}
      <circle
        cx={isEnabled && isFlashing ? "60" : "55"}
        cy="70"
        r="5"
        fill={isEnabled ? "#22c55e" : "#6b7280"}
        className="transition-all duration-75"
      />
    </svg>
  );

  if (layout === 'horizontal') {
    return (
      <div className="bg-gray-900 rounded-xl p-3 flex items-center gap-4">
        {/* Clickable Metronome Icon */}
        <MetronomeIcon />

        {/* BPM Input */}
        <div className="flex items-center gap-2">
          <label className="text-gray-400 text-xs whitespace-nowrap">BPM</label>
          <input
            type="number"
            min="20"
            max="300"
            value={bpm}
            onChange={handleBpmChange}
            onBlur={handleBpmBlur}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            className="w-16 bg-gray-800 text-white rounded-lg px-2 py-1 text-center font-bold text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Beat Subdivision Selector */}
        <div className="flex items-center gap-2">
          <label className="text-gray-400 text-xs whitespace-nowrap">Note</label>
          <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
            {([1, 2, 4, 8] as BeatSubdivision[]).map((sub) => (
              <button
                key={sub}
                onClick={() => setSubdivision(sub)}
                className={`px-2 py-1 rounded text-xs font-bold transition-all ${
                  subdivision === sub
                    ? 'bg-blue-600 text-white'
                    : 'bg-transparent text-gray-400 hover:text-white'
                }`}
              >
                {getSubdivisionLabel(sub)}
              </button>
            ))}
          </div>
        </div>

        {/* Tap Tempo Button */}
        <button
          onClick={handleTapTempo}
          className={`px-3 py-1 rounded-lg font-bold text-xs transition-all whitespace-nowrap ${
            isTapping
              ? 'bg-blue-600 text-white scale-95'
              : 'bg-gray-800 hover:bg-gray-700 text-white'
          }`}
        >
          Tap Tempo
        </button>

        {/* Beat Indicator */}
        {isEnabled && (
          <div
            className={`w-3 h-3 rounded-full transition-all duration-75 ${
              isFlashing
                ? 'bg-green-400 shadow-lg shadow-green-400/50 scale-125'
                : 'bg-gray-700'
            }`}
          />
        )}

        {/* Tapping Indicator */}
        {isTapping && tapTimes.length >= 2 && (
          <span className="text-blue-400 text-xs">
            {tapTimes.length} taps
          </span>
        )}
      </div>
    );
  }

  // Vertical layout (default)
  return (
    <div className="bg-gray-900 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-center">
        <MetronomeIcon />
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1">
          <label className="text-gray-400 text-xs block mb-1">BPM</label>
          <input
            type="number"
            min="20"
            max="300"
            value={bpm}
            onChange={handleBpmChange}
            onBlur={handleBpmBlur}
            className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-center font-bold text-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <button
          onClick={handleTapTempo}
          className={`flex-1 h-full rounded-lg font-bold text-sm transition-all ${
            isTapping
              ? 'bg-blue-600 text-white scale-95'
              : 'bg-gray-800 hover:bg-gray-700 text-white'
          }`}
          style={{ minHeight: '60px' }}
        >
          <div className="flex flex-col items-center justify-center">
            <svg className="w-5 h-5 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11" />
            </svg>
            <span>Tap Tempo</span>
          </div>
        </button>
      </div>

      {/* Beat Subdivision Selector */}
      <div className="space-y-2">
        <label className="text-gray-400 text-xs block">Beat Subdivision</label>
        <div className="grid grid-cols-4 gap-1 bg-gray-800 rounded-lg p-1">
          {([1, 2, 4, 8] as BeatSubdivision[]).map((sub) => (
            <button
              key={sub}
              onClick={() => setSubdivision(sub)}
              className={`px-2 py-2 rounded text-xs font-bold transition-all ${
                subdivision === sub
                  ? 'bg-blue-600 text-white'
                  : 'bg-transparent text-gray-400 hover:text-white'
              }`}
            >
              {getSubdivisionLabel(sub)}
            </button>
          ))}
        </div>
      </div>

      {isTapping && tapTimes.length >= 2 && (
        <div className="text-center text-blue-400 text-xs">
          Tapping... {tapTimes.length} taps
        </div>
      )}

      {/* Visual Beat Indicator */}
      {isEnabled && (
        <div className="flex items-center justify-center gap-3">
          <div className="flex items-center gap-2">
            <div
              className={`w-4 h-4 rounded-full transition-all duration-75 ${
                isFlashing
                  ? 'bg-green-400 shadow-lg shadow-green-400/50 scale-125'
                  : 'bg-gray-700'
              }`}
            />
            <span className="text-green-400 text-xs font-bold">BEAT</span>
          </div>
        </div>
      )}
    </div>
  );
}
