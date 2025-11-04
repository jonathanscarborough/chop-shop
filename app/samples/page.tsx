'use client';

import { useState, useEffect, useRef } from 'react';
import BottomNav from '@/components/BottomNav';
import ProjectMenu from '@/components/ProjectMenu';
import { getSamplesByProject, AudioSample, deleteSample, saveMasterRecording } from '@/lib/db';

// Keyboard mapping for samples
const KEYBOARD_KEYS = [
  '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', // Samples 1-10
  'q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', // Samples 11-20
  'a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l',      // Samples 21-29
  'z', 'x', 'c', 'v', 'b', 'n', 'm'                 // Samples 30-36
];

export default function SamplesPage() {
  const [samples, setSamples] = useState<AudioSample[]>([]);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [playbackMode, setPlaybackMode] = useState<'monophonic' | 'polyphonic'>('polyphonic');
  const [currentProjectId, setCurrentProjectId] = useState<string>('default-project');
  const [activeKeys, setActiveKeys] = useState<Set<string>>(new Set());
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedSamples, setSelectedSamples] = useState<Set<string>>(new Set());

  // Master recording states
  const [isMasterRecording, setIsMasterRecording] = useState(false);
  const [masterRecording, setMasterRecording] = useState<Blob | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackPosition, setPlaybackPosition] = useState(0);
  const [duration, setDuration] = useState(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const masterRecorderRef = useRef<MediaRecorder | null>(null);
  const masterDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const playbackSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const playbackStartTimeRef = useRef<number>(0);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    // Initialize Audio Context
    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();

    // Load current project ID from localStorage
    const storedProjectId = localStorage.getItem('currentProjectId');
    if (storedProjectId) {
      setCurrentProjectId(storedProjectId);
    }

    return () => {
      audioContextRef.current?.close();
    };
  }, []);

  // Load samples when project changes
  useEffect(() => {
    if (currentProjectId) {
      loadSamples();
    }
  }, [currentProjectId]);

  // Keyboard event handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input field or in select mode
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || isSelectMode) {
        return;
      }

      const key = e.key.toLowerCase();
      const sampleIndex = KEYBOARD_KEYS.indexOf(key);

      if (sampleIndex !== -1 && sampleIndex < samples.length) {
        // Prevent key repeat
        if (!activeKeys.has(key)) {
          setActiveKeys(prev => new Set(prev).add(key));
          playSample(samples[sampleIndex].blob);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      setActiveKeys(prev => {
        const newSet = new Set(prev);
        newSet.delete(key);
        return newSet;
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [samples, activeKeys, isSelectMode]);

  const loadSamples = async () => {
    try {
      const loadedSamples = await getSamplesByProject(currentProjectId);
      // Sort by timestamp (oldest first)
      loadedSamples.sort((a, b) => a.timestamp - b.timestamp);
      setSamples(loadedSamples);
      console.log(`Loaded ${loadedSamples.length} samples`);
    } catch (error) {
      console.error('Failed to load samples:', error);
    }
  };

  const playSample = async (blob: Blob) => {
    if (!audioContextRef.current) return;

    try {
      // In monophonic mode, stop the currently playing sample
      if (playbackMode === 'monophonic' && currentSourceRef.current) {
        currentSourceRef.current.stop();
        currentSourceRef.current = null;
      }

      const arrayBuffer = await blob.arrayBuffer();
      const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);

      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;

      // Connect to both destination and master recorder if recording
      source.connect(audioContextRef.current.destination);
      if (isMasterRecording && masterDestinationRef.current) {
        source.connect(masterDestinationRef.current);
      }

      // Track the source if monophonic
      if (playbackMode === 'monophonic') {
        currentSourceRef.current = source;
        source.onended = () => {
          if (currentSourceRef.current === source) {
            currentSourceRef.current = null;
          }
        };
      }

      source.start();
      console.log('Playing sample');
    } catch (error) {
      console.error('Failed to play sample:', error);
    }
  };

  const toggleSampleSelection = (sampleId: string) => {
    setSelectedSamples(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sampleId)) {
        newSet.delete(sampleId);
      } else {
        newSet.add(sampleId);
      }
      return newSet;
    });
  };

  const deleteSelectedSamples = async () => {
    if (selectedSamples.size === 0) return;

    if (!confirm(`Delete ${selectedSamples.size} sample${selectedSamples.size > 1 ? 's' : ''}?`)) {
      return;
    }

    try {
      for (const sampleId of selectedSamples) {
        await deleteSample(sampleId);
      }
      setSelectedSamples(new Set());
      setIsSelectMode(false);
      await loadSamples();
      console.log('Deleted', selectedSamples.size, 'samples');
    } catch (error) {
      console.error('Failed to delete samples:', error);
      alert('Failed to delete samples. Please try again.');
    }
  };

  const clearAllSamples = async () => {
    if (samples.length === 0) return;

    if (!confirm(`Delete all ${samples.length} samples? This cannot be undone.`)) {
      return;
    }

    try {
      for (const sample of samples) {
        await deleteSample(sample.id);
      }
      setSamples([]);
      setSelectedSamples(new Set());
      setIsSelectMode(false);
      console.log('Cleared all samples');
    } catch (error) {
      console.error('Failed to clear samples:', error);
      alert('Failed to clear samples. Please try again.');
    }
  };

  const startMasterRecording = () => {
    if (!audioContextRef.current || isMasterRecording) return;

    try {
      // Create a destination for routing audio
      const destination = audioContextRef.current.createMediaStreamDestination();
      masterDestinationRef.current = destination;

      // Create MediaRecorder
      const recorder = new MediaRecorder(destination.stream);
      masterRecorderRef.current = recorder;
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        setMasterRecording(blob);

        // Get duration by decoding the audio
        try {
          const arrayBuffer = await blob.arrayBuffer();
          const audioBuffer = await audioContextRef.current!.decodeAudioData(arrayBuffer);
          const recordingDuration = audioBuffer.duration;

          // Save to database
          const recordingId = `master-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          await saveMasterRecording({
            id: recordingId,
            projectId: currentProjectId,
            blob,
            timestamp: Date.now(),
            duration: recordingDuration
          });

          console.log('Master recording saved to database:', blob.size, 'bytes', recordingDuration, 'seconds');
        } catch (error) {
          console.error('Failed to save master recording:', error);
        }
      };

      recorder.start();
      setIsMasterRecording(true);
      console.log('Master recording started');
    } catch (error) {
      console.error('Failed to start master recording:', error);
      alert('Failed to start recording');
    }
  };

  const stopMasterRecording = () => {
    if (!masterRecorderRef.current || !isMasterRecording) return;

    masterRecorderRef.current.stop();
    setIsMasterRecording(false);
    masterDestinationRef.current = null;
    console.log('Master recording stopped');
  };

  const playMasterRecording = async () => {
    if (!masterRecording || !audioContextRef.current || isPlaying) return;

    try {
      const arrayBuffer = await masterRecording.arrayBuffer();
      const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);

      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);

      playbackSourceRef.current = source;
      playbackStartTimeRef.current = audioContextRef.current.currentTime - playbackPosition;
      setDuration(audioBuffer.duration);

      source.onended = () => {
        setIsPlaying(false);
        setPlaybackPosition(0);
        playbackSourceRef.current = null;
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
      };

      source.start(0, playbackPosition);
      setIsPlaying(true);
      updatePlaybackPosition();
      console.log('Playing master recording');
    } catch (error) {
      console.error('Failed to play master recording:', error);
      alert('Failed to play recording');
    }
  };

  const stopPlayback = () => {
    if (!playbackSourceRef.current || !isPlaying) return;

    playbackSourceRef.current.stop();
    playbackSourceRef.current = null;
    setIsPlaying(false);

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
  };

  const returnToZero = () => {
    if (isPlaying) {
      stopPlayback();
    }
    setPlaybackPosition(0);
  };

  const updatePlaybackPosition = () => {
    if (!audioContextRef.current || !isPlaying) return;

    const currentPosition = audioContextRef.current.currentTime - playbackStartTimeRef.current;
    setPlaybackPosition(Math.min(currentPosition, duration));

    if (currentPosition < duration) {
      animationFrameRef.current = requestAnimationFrame(updatePlaybackPosition);
    }
  };

  const seekTo = (position: number) => {
    const wasPlaying = isPlaying;

    if (isPlaying) {
      stopPlayback();
    }

    setPlaybackPosition(position);

    if (wasPlaying) {
      setTimeout(() => playMasterRecording(), 10);
    }
  };

  const getKeyForIndex = (index: number): string => {
    return KEYBOARD_KEYS[index]?.toUpperCase() || '';
  };

  const gridSize = Math.max(2, Math.ceil(Math.sqrt(samples.length)));

  return (
    <div className="flex flex-col h-screen bg-black">
      {/* Header */}
      <div className="flex justify-between items-center p-4">
        <div className="flex items-center gap-2">
          <h1 className="text-white text-2xl font-bold">Samples</h1>
          {!isSelectMode && (
            <button
              onClick={() => setPlaybackMode(playbackMode === 'monophonic' ? 'polyphonic' : 'monophonic')}
              className="px-3 py-1 rounded-lg text-xs font-bold bg-gray-800 hover:bg-gray-700 text-white"
            >
              {playbackMode === 'monophonic' ? 'MONO' : 'POLY'}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {samples.length > 0 && (
            <>
              {isSelectMode ? (
                <>
                  <button
                    onClick={() => {
                      setIsSelectMode(false);
                      setSelectedSamples(new Set());
                    }}
                    className="px-3 py-1 rounded-lg text-xs font-bold bg-gray-700 hover:bg-gray-600 text-white"
                  >
                    Cancel
                  </button>
                  {selectedSamples.size > 0 && (
                    <button
                      onClick={deleteSelectedSamples}
                      className="px-3 py-1 rounded-lg text-xs font-bold bg-red-600 hover:bg-red-700 text-white"
                    >
                      Delete ({selectedSamples.size})
                    </button>
                  )}
                </>
              ) : (
                <>
                  <button
                    onClick={() => setIsSelectMode(true)}
                    className="px-3 py-1 rounded-lg text-xs font-bold bg-gray-800 hover:bg-gray-700 text-white"
                  >
                    Select
                  </button>
                  <button
                    onClick={clearAllSamples}
                    className="px-3 py-1 rounded-lg text-xs font-bold bg-red-600 hover:bg-red-700 text-white"
                  >
                    Clear All
                  </button>
                </>
              )}
            </>
          )}
          <button
            onClick={() => setIsMenuOpen(true)}
            className="text-white p-2"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Transport Controls */}
      <div className="px-4 py-3 bg-gray-900 border-t border-b border-gray-800">
        {/* Transport Buttons */}
        <div className="flex items-center justify-center gap-3 mb-4">
          <button
            onClick={isMasterRecording ? stopMasterRecording : startMasterRecording}
            disabled={isSelectMode}
            className={`px-6 py-2 rounded-lg font-bold text-sm transition-all ${
              isMasterRecording
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-gray-800 hover:bg-gray-700 text-white'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isMasterRecording ? '⬤ RECORDING' : '⬤ RECORD'}
          </button>

          <button
            onClick={returnToZero}
            disabled={!masterRecording || isSelectMode}
            className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            title="Return to Zero"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M8.445 14.832A1 1 0 0010 14v-2.798l5.445 3.63A1 1 0 0017 14V6a1 1 0 00-1.555-.832L10 8.798V6a1 1 0 00-1.555-.832l-6 4a1 1 0 000 1.664l6 4z" />
            </svg>
          </button>

          <button
            onClick={isPlaying ? stopPlayback : playMasterRecording}
            disabled={!masterRecording || isSelectMode}
            className="p-3 rounded-full bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
              </svg>
            )}
          </button>

          <button
            onClick={() => {
              if (isMasterRecording) {
                stopMasterRecording();
              }
              if (isPlaying) {
                stopPlayback();
              }
            }}
            disabled={(!isPlaying && !isMasterRecording) || isSelectMode}
            className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            title="Stop"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Progress Bar */}
        {masterRecording && duration > 0 && (
          <div className="flex items-center gap-3">
            <div className="text-gray-400 text-xs font-mono w-12 text-right">
              {Math.floor(playbackPosition / 60)}:{Math.floor(playbackPosition % 60).toString().padStart(2, '0')}
            </div>

            <div
              className="flex-1 h-2 bg-gray-800 rounded-full cursor-pointer relative group"
              onClick={(e) => {
                if (isSelectMode || duration === 0) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const percentage = x / rect.width;
                seekTo(percentage * duration);
              }}
            >
              {/* Progress */}
              <div
                className="absolute left-0 top-0 h-full bg-blue-600 rounded-full"
                style={{ width: `${Math.min(100, (playbackPosition / duration) * 100)}%` }}
              />

              {/* Playhead ball */}
              <div
                className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-lg transform group-hover:scale-110"
                style={{ left: `${Math.min(100, (playbackPosition / duration) * 100)}%`, marginLeft: '-8px' }}
              />
            </div>

            <div className="text-gray-400 text-xs font-mono w-12">
              {Math.floor(duration / 60)}:{Math.floor(duration % 60).toString().padStart(2, '0')}
            </div>
          </div>
        )}
      </div>

      {/* Sample Grid */}
      <div className="flex-1 p-4 pb-24 flex items-center justify-center">
        {samples.length === 0 ? (
          <div className="text-center">
            <p className="text-gray-400 text-lg">No samples yet.</p>
            <p className="text-gray-500 text-sm mt-2">Go to Record to create some!</p>
          </div>
        ) : (
          <div
            className="grid gap-2 aspect-square w-full max-w-[min(100vw-2rem,100vh-8rem)]"
            style={{
              gridTemplateColumns: `repeat(${gridSize}, 1fr)`,
              gridTemplateRows: `repeat(${gridSize}, 1fr)`,
            }}
          >
            {samples.map((sample, index) => {
              const keyboardKey = getKeyForIndex(index);
              const isKeyActive = activeKeys.has(keyboardKey.toLowerCase());
              const isSelected = selectedSamples.has(sample.id);

              return (
                <button
                  key={sample.id}
                  onClick={() => isSelectMode ? toggleSampleSelection(sample.id) : playSample(sample.blob)}
                  className={`aspect-square rounded-xl text-white font-bold text-2xl transition-all shadow-lg flex flex-col items-center justify-center relative ${
                    isSelectMode
                      ? isSelected
                        ? 'bg-blue-600 hover:bg-blue-700'
                        : 'bg-gray-800 hover:bg-gray-700'
                      : isKeyActive
                      ? 'bg-blue-600 scale-95'
                      : 'bg-gray-800 hover:bg-gray-700 active:bg-blue-600'
                  }`}
                >
                  {isSelectMode && (
                    <div className="absolute top-2 left-2 w-6 h-6 rounded border-2 border-white flex items-center justify-center bg-gray-900">
                      {isSelected && (
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                  )}
                  <span className="text-4xl">{index + 1}</span>
                  {!isSelectMode && keyboardKey && (
                    <span className="absolute top-2 right-2 text-xs bg-gray-900 px-2 py-1 rounded opacity-60">
                      {keyboardKey}
                    </span>
                  )}
                </button>
              );
            })}
            {/* Fill empty grid cells */}
            {Array.from({ length: gridSize * gridSize - samples.length }).map((_, index) => (
              <div
                key={`empty-${index}`}
                className="aspect-square bg-gray-900 rounded-xl opacity-30"
              />
            ))}
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <BottomNav />

      {/* Project Menu */}
      <ProjectMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
    </div>
  );
}
