'use client';

import { useState, useEffect, useRef } from 'react';

interface MetronomeProps {
  isPlaying?: boolean;
}

export default function Metronome({ isPlaying = false }: MetronomeProps) {
  const [isEnabled, setIsEnabled] = useState(false);
  const [bpm, setBpm] = useState(120);
  const [tapTimes, setTapTimes] = useState<number[]>([]);
  const [isTapping, setIsTapping] = useState(false);
  const [isFlashing, setIsFlashing] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const tapTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const flashTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  return (
    <div className="bg-gray-900 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-white font-bold flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Metronome
        </h3>
        <button
          onClick={() => setIsEnabled(!isEnabled)}
          className={`px-3 py-1 rounded-lg font-bold text-sm transition-all ${
            isEnabled
              ? 'bg-green-600 hover:bg-green-700 text-white'
              : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
          }`}
        >
          {isEnabled ? 'ON' : 'OFF'}
        </button>
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
