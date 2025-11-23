'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import BottomNav from '@/components/BottomNav';
import ProjectMenu from '@/components/ProjectMenu';
import HowToUseOverlay from '@/components/HowToUseOverlay';
import HelpButton from '@/components/HelpButton';
import { getSamplesByProject, AudioSample } from '@/lib/db';

// Audio effects interface
interface SampleEffects {
  reverb: { enabled: boolean; decay: number; wet: number };
  delay: { enabled: boolean; time: number; feedback: number; wet: number };
  compression: { enabled: boolean; threshold: number; ratio: number; attack: number; release: number };
  eq: { enabled: boolean; low: number; mid: number; high: number };
  volume: number;
  pan: number;
}

const DEFAULT_EFFECTS: SampleEffects = {
  reverb: { enabled: false, decay: 2, wet: 0.3 },
  delay: { enabled: false, time: 0.3, feedback: 0.3, wet: 0.5 },
  compression: { enabled: false, threshold: -24, ratio: 4, attack: 0.003, release: 0.25 },
  eq: { enabled: false, low: 0, mid: 0, high: 0 },
  volume: 1,
  pan: 0
};

export default function SequencePage() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isHowToUseOpen, setIsHowToUseOpen] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState<string>('');
  const [samples, setSamples] = useState<AudioSample[]>([]);
  const [sampleEffects, setSampleEffects] = useState<Map<string, SampleEffects>>(new Map());
  const [isPlaying, setIsPlaying] = useState(false);
  const [bpm, setBpm] = useState(120);
  const [stepCount, setStepCount] = useState(16);
  const [subdivision, setSubdivision] = useState<'4n' | '8n' | '16n' | '32n'>('16n');
  const [currentStep, setCurrentStep] = useState(-1);
  const [selectedSample, setSelectedSample] = useState<string | null>(null);

  // Grid state: Map<sampleId, boolean[]> - true = step is active
  const [grid, setGrid] = useState<Map<string, boolean[]>>(new Map());

  // Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const ToneRef = useRef<any>(null);
  const sequenceRef = useRef<any>(null);
  const samplesRef = useRef<AudioSample[]>([]);
  const gridRef = useRef<Map<string, boolean[]>>(new Map());
  const sampleEffectsRef = useRef<Map<string, SampleEffects>>(new Map());

  // Load current project
  useEffect(() => {
    const storedProjectId = localStorage.getItem('currentProjectId');
    if (storedProjectId) {
      setCurrentProjectId(storedProjectId);
      loadSamples(storedProjectId);
    }
  }, []);

  // Update refs when state changes
  useEffect(() => {
    samplesRef.current = samples;
  }, [samples]);

  useEffect(() => {
    gridRef.current = grid;
  }, [grid]);

  useEffect(() => {
    sampleEffectsRef.current = sampleEffects;
  }, [sampleEffects]);

  // Real-time BPM changes during playback
  useEffect(() => {
    if (ToneRef.current && isPlaying) {
      ToneRef.current.Transport.bpm.value = bpm;
    }
  }, [bpm, isPlaying]);

  // Initialize audio context and load Tone.js
  useEffect(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    const loadTone = async () => {
      if (!ToneRef.current) {
        const Tone = await import('tone');
        ToneRef.current = Tone;
        console.log('Tone.js loaded');
      }
    };
    loadTone();

    return () => {
      if (sequenceRef.current) {
        sequenceRef.current.stop();
        sequenceRef.current.dispose();
      }
      if (ToneRef.current && ToneRef.current.Transport.state === 'started') {
        ToneRef.current.Transport.stop();
      }
    };
  }, []);

  const loadSamples = async (projectId: string) => {
    try {
      const loadedSamples = await getSamplesByProject(projectId);
      setSamples(loadedSamples);

      // Initialize grid and effects for each sample
      const newGrid = new Map<string, boolean[]>();
      const newEffects = new Map<string, SampleEffects>();
      loadedSamples.forEach(sample => {
        newGrid.set(sample.id, Array(stepCount).fill(false));
        newEffects.set(sample.id, { ...DEFAULT_EFFECTS });
      });
      setGrid(newGrid);
      setSampleEffects(newEffects);

      console.log(`Loaded ${loadedSamples.length} samples`);
    } catch (error) {
      console.error('Failed to load samples:', error);
    }
  };

  // Update grid when step count changes
  useEffect(() => {
    setGrid(prev => {
      const newGrid = new Map();
      prev.forEach((steps, sampleId) => {
        if (steps.length < stepCount) {
          // Add more steps
          newGrid.set(sampleId, [...steps, ...Array(stepCount - steps.length).fill(false)]);
        } else if (steps.length > stepCount) {
          // Remove extra steps
          newGrid.set(sampleId, steps.slice(0, stepCount));
        } else {
          newGrid.set(sampleId, steps);
        }
      });
      return newGrid;
    });
  }, [stepCount]);

  // Rebuild sequence when step count or subdivision changes
  useEffect(() => {
    if (isPlaying) {
      // Restart sequence with new parameters
      stopSequencer();
      setTimeout(() => startSequencer(), 100);
    }
  }, [stepCount, subdivision]);

  // Generate impulse response for reverb
  const createImpulseResponse = (ctx: AudioContext, decay: number): AudioBuffer => {
    const sampleRate = ctx.sampleRate;
    const length = sampleRate * decay;
    const impulse = ctx.createBuffer(2, length, sampleRate);
    const leftChannel = impulse.getChannelData(0);
    const rightChannel = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
      const n = length - i;
      leftChannel[i] = (Math.random() * 2 - 1) * Math.pow(n / length, 2);
      rightChannel[i] = (Math.random() * 2 - 1) * Math.pow(n / length, 2);
    }

    return impulse;
  };

  const buildEffectsChain = (ctx: AudioContext, sampleId: string, sourceNode: AudioNode): AudioNode => {
    const effects = sampleEffectsRef.current.get(sampleId) || DEFAULT_EFFECTS;
    let currentNode: AudioNode = sourceNode;

    // Compression
    if (effects.compression.enabled) {
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = effects.compression.threshold;
      compressor.ratio.value = effects.compression.ratio;
      compressor.attack.value = effects.compression.attack;
      compressor.release.value = effects.compression.release;
      currentNode.connect(compressor);
      currentNode = compressor;
    }

    // EQ (3-band)
    if (effects.eq.enabled) {
      const lowShelf = ctx.createBiquadFilter();
      lowShelf.type = 'lowshelf';
      lowShelf.frequency.value = 320;
      lowShelf.gain.value = effects.eq.low;

      const mid = ctx.createBiquadFilter();
      mid.type = 'peaking';
      mid.frequency.value = 1000;
      mid.Q.value = 0.5;
      mid.gain.value = effects.eq.mid;

      const highShelf = ctx.createBiquadFilter();
      highShelf.type = 'highshelf';
      highShelf.frequency.value = 3200;
      highShelf.gain.value = effects.eq.high;

      currentNode.connect(lowShelf);
      lowShelf.connect(mid);
      mid.connect(highShelf);
      currentNode = highShelf;
    }

    // Delay
    if (effects.delay.enabled) {
      const delayNode = ctx.createDelay(5);
      delayNode.delayTime.value = effects.delay.time;
      const delayFeedback = ctx.createGain();
      delayFeedback.gain.value = effects.delay.feedback;
      const delayWet = ctx.createGain();
      delayWet.gain.value = effects.delay.wet;
      const delayDry = ctx.createGain();
      delayDry.gain.value = 1 - effects.delay.wet;

      currentNode.connect(delayDry);
      currentNode.connect(delayNode);
      delayNode.connect(delayFeedback);
      delayFeedback.connect(delayNode);
      delayNode.connect(delayWet);

      const delayMix = ctx.createGain();
      delayDry.connect(delayMix);
      delayWet.connect(delayMix);
      currentNode = delayMix;
    }

    // Reverb
    if (effects.reverb.enabled) {
      const convolver = ctx.createConvolver();
      convolver.buffer = createImpulseResponse(ctx, effects.reverb.decay);

      const reverbWet = ctx.createGain();
      reverbWet.gain.value = effects.reverb.wet;
      const reverbDry = ctx.createGain();
      reverbDry.gain.value = 1 - effects.reverb.wet;

      currentNode.connect(convolver);
      convolver.connect(reverbWet);
      currentNode.connect(reverbDry);

      const reverbMix = ctx.createGain();
      reverbWet.connect(reverbMix);
      reverbDry.connect(reverbMix);
      currentNode = reverbMix;
    }

    // Pan
    const panner = ctx.createStereoPanner();
    panner.pan.value = effects.pan;
    currentNode.connect(panner);
    currentNode = panner;

    // Volume
    const volumeGain = ctx.createGain();
    volumeGain.gain.value = effects.volume;
    currentNode.connect(volumeGain);
    currentNode = volumeGain;

    return currentNode;
  };

  const playSample = useCallback(async (blob: Blob, sampleId: string) => {
    if (!audioContextRef.current) return;

    try {
      const arrayBuffer = await blob.arrayBuffer();
      const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);

      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;

      // Apply effects chain
      const outputNode = buildEffectsChain(audioContextRef.current, sampleId, source);
      outputNode.connect(audioContextRef.current.destination);

      source.start();
    } catch (error) {
      console.error('Failed to play sample:', error);
    }
  }, []);

  const toggleStep = useCallback((sampleId: string, stepIndex: number) => {
    setGrid(prev => {
      const newGrid = new Map(prev);
      const steps = [...(newGrid.get(sampleId) || Array(stepCount).fill(false))];
      steps[stepIndex] = !steps[stepIndex];
      newGrid.set(sampleId, steps);
      return newGrid;
    });
  }, [stepCount]);

  const clearPattern = useCallback(() => {
    setGrid(prev => {
      const newGrid = new Map();
      prev.forEach((_, sampleId) => {
        newGrid.set(sampleId, Array(stepCount).fill(false));
      });
      return newGrid;
    });
  }, [stepCount]);

  const startSequencer = useCallback(async () => {
    if (!ToneRef.current) {
      console.error('Tone.js not loaded');
      return;
    }

    const Tone = ToneRef.current;

    // Start Tone.js context
    await Tone.start();

    // Clear existing sequence
    if (sequenceRef.current) {
      sequenceRef.current.stop();
      sequenceRef.current.dispose();
    }

    // Set BPM
    Tone.Transport.bpm.value = bpm;

    // Create sequence
    const steps = Array.from({ length: stepCount }, (_, i) => i);

    sequenceRef.current = new Tone.Sequence(
      (time: number, step: number) => {
        // Update UI on animation frame
        Tone.Draw.schedule(() => {
          setCurrentStep(step);
        }, time);

        // Play samples for this step
        const currentGrid = gridRef.current;
        const currentSamples = samplesRef.current;

        currentSamples.forEach(sample => {
          const sampleSteps = currentGrid.get(sample.id);
          if (sampleSteps && sampleSteps[step]) {
            // Schedule sample playback at the exact time
            Tone.Draw.schedule(() => {
              playSample(sample.blob, sample.id);
            }, time);
          }
        });
      },
      steps,
      subdivision
    );

    sequenceRef.current.start(0);
    Tone.Transport.start();
    setIsPlaying(true);

    console.log('Sequencer started, BPM:', bpm, 'Steps:', stepCount, 'Subdivision:', subdivision);
  }, [bpm, stepCount, subdivision, playSample]);

  const stopSequencer = useCallback(() => {
    if (ToneRef.current) {
      ToneRef.current.Transport.stop();
      ToneRef.current.Transport.position = 0;
    }

    if (sequenceRef.current) {
      sequenceRef.current.stop();
    }

    setIsPlaying(false);
    setCurrentStep(-1);

    console.log('Sequencer stopped');
  }, []);

  const togglePlayback = useCallback(() => {
    if (isPlaying) {
      stopSequencer();
    } else {
      startSequencer();
    }
  }, [isPlaying, startSequencer, stopSequencer]);

  const updateEffect = useCallback((sampleId: string, effectType: keyof SampleEffects, value: any) => {
    setSampleEffects(prev => {
      const newEffects = new Map(prev);
      const currentEffects = newEffects.get(sampleId) || { ...DEFAULT_EFFECTS };
      newEffects.set(sampleId, { ...currentEffects, [effectType]: value });
      return newEffects;
    });
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white">
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsMenuOpen(true)}
              className="px-4 py-2 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors"
            >
              Projects
            </button>
            <h1 className="text-2xl font-bold">Step Sequencer</h1>
          </div>
          <HelpButton onClick={() => setIsHowToUseOpen(true)} />
        </div>

        {/* Transport Controls */}
        <div className="bg-gray-800/50 rounded-lg p-4 mb-6 space-y-4">
          <div className="flex items-center gap-4">
            <button
              onClick={togglePlayback}
              className={`px-6 py-3 rounded-lg font-bold transition-all ${
                isPlaying
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              {isPlaying ? '⏸ Stop' : '▶ Play'}
            </button>

            <div className="flex-1 flex items-center gap-2">
              <label className="text-sm text-gray-400 min-w-[100px]">
                Tempo: {bpm} BPM
              </label>
              <input
                type="range"
                min="60"
                max="240"
                value={bpm}
                onChange={(e) => setBpm(parseInt(e.target.value))}
                className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            <button
              onClick={clearPattern}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
            >
              Clear
            </button>
          </div>

          {/* Step Count and Subdivision Controls */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-400">Steps:</label>
              <select
                value={stepCount}
                onChange={(e) => setStepCount(parseInt(e.target.value))}
                className="bg-gray-700 text-white px-3 py-1 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {[8, 16, 24, 32].map(count => (
                  <option key={count} value={count}>{count}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-400">Subdivision:</label>
              <select
                value={subdivision}
                onChange={(e) => setSubdivision(e.target.value as any)}
                className="bg-gray-700 text-white px-3 py-1 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="4n">Quarter Notes</option>
                <option value="8n">8th Notes</option>
                <option value="16n">16th Notes</option>
                <option value="32n">32nd Notes</option>
              </select>
            </div>
          </div>
        </div>

        {/* Step Sequencer Grid */}
        {samples.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-400 text-lg">No samples available.</p>
            <p className="text-gray-500 text-sm mt-2">Go to Record to create samples first!</p>
          </div>
        ) : (
          <div className="space-y-2">
            {samples.map((sample, sampleIndex) => {
              const sampleSteps = grid.get(sample.id) || Array(stepCount).fill(false);
              const effects = sampleEffects.get(sample.id) || DEFAULT_EFFECTS;
              const isSelected = selectedSample === sample.id;

              return (
                <div key={sample.id} className="space-y-2">
                  <div className="bg-gray-800/30 rounded-lg p-3 border border-gray-700">
                    <div className="flex items-center gap-2">
                      {/* Sample name/number with effects button */}
                      <div className="w-24 flex flex-col gap-1">
                        <div className="text-xs font-mono text-gray-400 truncate">
                          {sample.name || `Sample ${sampleIndex + 1}`}
                        </div>
                        <button
                          onClick={() => setSelectedSample(isSelected ? null : sample.id)}
                          className="text-xs px-2 py-0.5 bg-gray-700 hover:bg-gray-600 rounded transition-colors"
                        >
                          FX
                        </button>
                      </div>

                      {/* Step buttons */}
                      <div className="flex-1 flex gap-1">
                        {sampleSteps.map((isActive, stepIndex) => {
                          const isCurrentStep = currentStep === stepIndex;
                          const isBeat = stepIndex % 4 === 0;

                          return (
                            <button
                              key={stepIndex}
                              onClick={() => toggleStep(sample.id, stepIndex)}
                              className={`flex-1 h-10 rounded transition-all ${
                                isActive
                                  ? isCurrentStep
                                    ? 'bg-blue-400 scale-110 shadow-lg shadow-blue-500/50'
                                    : 'bg-blue-600 hover:bg-blue-500'
                                  : isCurrentStep
                                  ? 'bg-gray-600 scale-105'
                                  : isBeat
                                  ? 'bg-gray-700 hover:bg-gray-600'
                                  : 'bg-gray-800 hover:bg-gray-700'
                              } ${isBeat ? 'border-l-2 border-gray-600' : ''}`}
                            />
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Effects Panel */}
                  {isSelected && (
                    <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700 space-y-3">
                      <div className="grid grid-cols-2 gap-4">
                        {/* Volume */}
                        <div>
                          <label className="text-xs text-gray-400">Volume</label>
                          <input
                            type="range"
                            min="0"
                            max="2"
                            step="0.1"
                            value={effects.volume}
                            onChange={(e) => updateEffect(sample.id, 'volume', parseFloat(e.target.value))}
                            className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                          />
                          <div className="text-xs text-gray-500 text-center">{(effects.volume * 100).toFixed(0)}%</div>
                        </div>

                        {/* Pan */}
                        <div>
                          <label className="text-xs text-gray-400">Pan</label>
                          <input
                            type="range"
                            min="-1"
                            max="1"
                            step="0.1"
                            value={effects.pan}
                            onChange={(e) => updateEffect(sample.id, 'pan', parseFloat(e.target.value))}
                            className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                          />
                          <div className="text-xs text-gray-500 text-center">
                            {effects.pan < 0 ? `L${Math.abs(effects.pan * 100).toFixed(0)}` : effects.pan > 0 ? `R${(effects.pan * 100).toFixed(0)}` : 'C'}
                          </div>
                        </div>
                      </div>

                      {/* Reverb */}
                      <div>
                        <label className="flex items-center gap-2 mb-2">
                          <input
                            type="checkbox"
                            checked={effects.reverb.enabled}
                            onChange={(e) => updateEffect(sample.id, 'reverb', { ...effects.reverb, enabled: e.target.checked })}
                            className="rounded"
                          />
                          <span className="text-sm text-gray-300">Reverb</span>
                        </label>
                        {effects.reverb.enabled && (
                          <div className="grid grid-cols-2 gap-2 ml-6">
                            <div>
                              <label className="text-xs text-gray-400">Decay</label>
                              <input
                                type="range"
                                min="0.1"
                                max="5"
                                step="0.1"
                                value={effects.reverb.decay}
                                onChange={(e) => updateEffect(sample.id, 'reverb', { ...effects.reverb, decay: parseFloat(e.target.value) })}
                                className="w-full h-1 bg-gray-700 rounded-lg"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-gray-400">Wet</label>
                              <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.05"
                                value={effects.reverb.wet}
                                onChange={(e) => updateEffect(sample.id, 'reverb', { ...effects.reverb, wet: parseFloat(e.target.value) })}
                                className="w-full h-1 bg-gray-700 rounded-lg"
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Delay */}
                      <div>
                        <label className="flex items-center gap-2 mb-2">
                          <input
                            type="checkbox"
                            checked={effects.delay.enabled}
                            onChange={(e) => updateEffect(sample.id, 'delay', { ...effects.delay, enabled: e.target.checked })}
                            className="rounded"
                          />
                          <span className="text-sm text-gray-300">Delay</span>
                        </label>
                        {effects.delay.enabled && (
                          <div className="grid grid-cols-3 gap-2 ml-6">
                            <div>
                              <label className="text-xs text-gray-400">Time</label>
                              <input
                                type="range"
                                min="0.01"
                                max="2"
                                step="0.01"
                                value={effects.delay.time}
                                onChange={(e) => updateEffect(sample.id, 'delay', { ...effects.delay, time: parseFloat(e.target.value) })}
                                className="w-full h-1 bg-gray-700 rounded-lg"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-gray-400">Feedback</label>
                              <input
                                type="range"
                                min="0"
                                max="0.9"
                                step="0.05"
                                value={effects.delay.feedback}
                                onChange={(e) => updateEffect(sample.id, 'delay', { ...effects.delay, feedback: parseFloat(e.target.value) })}
                                className="w-full h-1 bg-gray-700 rounded-lg"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-gray-400">Wet</label>
                              <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.05"
                                value={effects.delay.wet}
                                onChange={(e) => updateEffect(sample.id, 'delay', { ...effects.delay, wet: parseFloat(e.target.value) })}
                                className="w-full h-1 bg-gray-700 rounded-lg"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Info */}
        <div className="mt-6 text-center text-sm text-gray-500">
          <p>Click grid squares to activate steps. Click FX to adjust effects per sample.</p>
          <p className="mt-1">{stepCount} steps | {subdivision} | Powered by Tone.js</p>
        </div>
      </div>

      {/* Modals */}
      <ProjectMenu
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        currentProjectId={currentProjectId}
        onProjectChange={(projectId) => {
          setCurrentProjectId(projectId);
          loadSamples(projectId);
          if (isPlaying) stopSequencer();
        }}
      />

      <HowToUseOverlay
        isOpen={isHowToUseOpen}
        onClose={() => setIsHowToUseOpen(false)}
        content={{
          title: "Step Sequencer",
          instructions: [
            "Click grid squares to activate steps for each sample",
            "Press Play to start the sequence",
            "Adjust tempo with the BPM slider - changes happen in real-time!",
            "Change step count (8, 16, 24, 32) and subdivision (4n to 32nd notes)",
            "Click FX button on any sample to add reverb, delay, and adjust volume/pan",
            "Clear button removes all active steps"
          ]
        }}
      />

      <BottomNav />
    </div>
  );
}
