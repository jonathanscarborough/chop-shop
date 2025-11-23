'use client';

import { useState, useEffect, useRef } from 'react';
import BottomNav from '@/components/BottomNav';
import ProjectMenu from '@/components/ProjectMenu';
import Metronome from '@/components/Metronome';
import HelpButton from '@/components/HelpButton';
import HowToUseOverlay from '@/components/HowToUseOverlay';
import AudioEditor from '@/components/AudioEditor';
import { getSamplesByProject, AudioSample, deleteSample, saveMasterRecording, saveSample } from '@/lib/db';
import midiService, { MIDIStorage, MIDIDeviceInfo, MIDIHelpers } from '@/lib/midi';
import { useRouter } from 'next/navigation';

// Keyboard mapping for samples
const KEYBOARD_KEYS = [
  '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', // Samples 1-10
  'q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', // Samples 11-20
  'a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l',      // Samples 21-29
  'z', 'x', 'c', 'v', 'b', 'n', 'm'                 // Samples 30-36
];

// Audio effects interface
interface SampleEffects {
  volume: number; // 0 to 2 (0% to 200%)
  pan: number; // -1 to 1 (L to R)
  reverb: { enabled: boolean; decay: number; wet: number };
  delay: { enabled: boolean; time: number; feedback: number; wet: number };
  compression: { enabled: boolean; threshold: number; ratio: number; attack: number; release: number };
  eq: { enabled: boolean; low: number; mid: number; high: number };
  phaser: { enabled: boolean; speed: number; depth: number };
  flanger: { enabled: boolean; speed: number; depth: number; feedback: number };
  chorus: { enabled: boolean; rate: number; depth: number };
}

const DEFAULT_EFFECTS: SampleEffects = {
  volume: 1, // 100%
  pan: 0, // Center
  reverb: { enabled: false, decay: 2, wet: 0.3 },
  delay: { enabled: false, time: 0.3, feedback: 0.3, wet: 0.5 },
  compression: { enabled: false, threshold: -24, ratio: 4, attack: 0.003, release: 0.25 },
  eq: { enabled: false, low: 0, mid: 0, high: 0 },
  phaser: { enabled: false, speed: 0.5, depth: 1 },
  flanger: { enabled: false, speed: 0.2, depth: 0.002, feedback: 0.5 },
  chorus: { enabled: false, rate: 1.5, depth: 0.002 }
};

export default function SamplesPage() {
  const router = useRouter();
  const [samples, setSamples] = useState<AudioSample[]>([]);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isHowToUseOpen, setIsHowToUseOpen] = useState(false);
  const [playbackMode, setPlaybackMode] = useState<'monophonic' | 'polyphonic'>('polyphonic');
  const [currentProjectId, setCurrentProjectId] = useState<string>('default-project');
  const [activeKeys, setActiveKeys] = useState<Set<string>>(new Set());
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedSamples, setSelectedSamples] = useState<Set<string>>(new Set());
  const [isInstrumentMenuOpen, setIsInstrumentMenuOpen] = useState(false);
  const [savedInstruments, setSavedInstruments] = useState<string[]>([]);
  const [showLoadSubmenu, setShowLoadSubmenu] = useState(false);
  const [editingSample, setEditingSample] = useState<{blob: Blob; id: string; index: number; name?: string; midiNote?: number} | null>(null);
  const [midiDevices, setMidiDevices] = useState<MIDIDeviceInfo[]>([]);
  const [selectedMidiDevice, setSelectedMidiDevice] = useState<string>('');
  const [isMidiPanelExpanded, setIsMidiPanelExpanded] = useState(false);

  // Audio effects states
  const [sampleEffects, setSampleEffects] = useState<Map<string, SampleEffects>>(new Map());
  const [selectedEffectsSample, setSelectedEffectsSample] = useState<string | null>(null);
  const [hoveredSample, setHoveredSample] = useState<string | null>(null);
  const [showEffectsMenu, setShowEffectsMenu] = useState<string | null>(null);
  const [playingSamples, setPlayingSamples] = useState<Map<string, { source: AudioBufferSourceNode; startTime: number; duration: number }>>(new Map());

  // Save effects to localStorage whenever they change
  useEffect(() => {
    if (currentProjectId && sampleEffects.size > 0) {
      const effectsKey = `effects_${currentProjectId}`;
      const effectsArray = Array.from(sampleEffects.entries());
      localStorage.setItem(effectsKey, JSON.stringify(effectsArray));
    }
  }, [sampleEffects, currentProjectId]);

  // Load effects from localStorage when project changes
  useEffect(() => {
    if (currentProjectId) {
      const effectsKey = `effects_${currentProjectId}`;
      const savedEffects = localStorage.getItem(effectsKey);
      if (savedEffects) {
        try {
          const effectsArray = JSON.parse(savedEffects);
          setSampleEffects(new Map(effectsArray));
        } catch (error) {
          console.error('Failed to load effects:', error);
        }
      }
    }
  }, [currentProjectId]);

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

    // Load saved instruments list
    loadSavedInstruments();

    // Initialize MIDI
    midiService.initialize().then(success => {
      if (success) {
        console.log('MIDI initialized successfully');
        const devices = midiService.getInputDevices();
        setMidiDevices(devices);

        // Try to restore previous MIDI device
        const savedDeviceId = localStorage.getItem('midiDeviceId');
        if (savedDeviceId && devices.find(d => d.id === savedDeviceId)) {
          setSelectedMidiDevice(savedDeviceId);
          midiService.setActiveInput(savedDeviceId);
        }
      }
    });

    return () => {
      audioContextRef.current?.close();
      midiService.disconnect();
    };
  }, []);

  const loadSavedInstruments = () => {
    try {
      const instrumentsData = localStorage.getItem('savedInstruments');
      if (instrumentsData) {
        try {
          const instruments = JSON.parse(instrumentsData);
          if (Array.isArray(instruments)) {
            setSavedInstruments(instruments);
          } else {
            console.error('Invalid instruments data, clearing');
            localStorage.removeItem('savedInstruments');
            setSavedInstruments([]);
          }
        } catch (parseError) {
          console.error('Failed to parse savedInstruments, clearing:', parseError);
          localStorage.removeItem('savedInstruments');
          setSavedInstruments([]);
        }
      }
    } catch (error) {
      console.error('Failed to load saved instruments:', error);
      setSavedInstruments([]);
    }
  };

  // Load samples when project changes
  useEffect(() => {
    if (currentProjectId) {
      loadSamples();
    }
  }, [currentProjectId]);

  // Set up MIDI note event handler
  useEffect(() => {
    if (!currentProjectId) return;

    const unsubscribe = midiService.onNoteEvent((note, velocity, noteOn) => {
      if (!noteOn || isSelectMode) return;

      // Find sample with matching MIDI note
      const sample = samples.find(s => s.midiNote === note);
      if (sample) {
        playSample(sample.blob, sample.id);
      }
    });

    return unsubscribe;
  }, [samples, currentProjectId, isSelectMode]);

  // Animation loop for progress updates
  useEffect(() => {
    let animationFrameId: number;
    const updateProgress = () => {
      if (playingSamples.size > 0) {
        // Force re-render by updating a dummy state
        setPlayingSamples(prev => new Map(prev));
      }
      animationFrameId = requestAnimationFrame(updateProgress);
    };

    if (playingSamples.size > 0) {
      animationFrameId = requestAnimationFrame(updateProgress);
    }

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [playingSamples.size]);

  // Keyboard event handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in a text input field, but allow keyboard shortcuts when using range sliders or checkboxes
      if (
        (e.target instanceof HTMLInputElement && e.target.type !== 'range' && e.target.type !== 'checkbox') ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      // ? key to open How to Use
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        setIsHowToUseOpen(true);
        return;
      }

      // Don't process sample triggers when in select mode
      if (isSelectMode) {
        return;
      }

      const key = e.key.toLowerCase();
      const sampleIndex = KEYBOARD_KEYS.indexOf(key);

      if (sampleIndex !== -1 && sampleIndex < samples.length) {
        // Prevent key repeat
        if (!activeKeys.has(key)) {
          setActiveKeys(prev => new Set(prev).add(key));
          playSample(samples[sampleIndex].blob, samples[sampleIndex].id);
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
    const effects = sampleEffects.get(sampleId) || DEFAULT_EFFECTS;
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

    // Reverb (impulse response convolution)
    if (effects.reverb.enabled) {
      const convolver = ctx.createConvolver();
      convolver.buffer = createImpulseResponse(ctx, effects.reverb.decay);

      const reverbWet = ctx.createGain();
      reverbWet.gain.value = effects.reverb.wet;
      const reverbDry = ctx.createGain();
      reverbDry.gain.value = 1 - effects.reverb.wet;

      // Wet path (with reverb)
      currentNode.connect(convolver);
      convolver.connect(reverbWet);

      // Dry path (without reverb)
      currentNode.connect(reverbDry);

      // Mix wet and dry
      const reverbMix = ctx.createGain();
      reverbWet.connect(reverbMix);
      reverbDry.connect(reverbMix);
      currentNode = reverbMix;
    }

    // Pan (stereo panner)
    const panner = ctx.createStereoPanner();
    panner.pan.value = typeof effects.pan === 'number' && !isNaN(effects.pan) ? effects.pan : 0;
    currentNode.connect(panner);
    currentNode = panner;

    // Volume (gain)
    const volumeGain = ctx.createGain();
    volumeGain.gain.value = typeof effects.volume === 'number' && !isNaN(effects.volume) ? effects.volume : 1;
    currentNode.connect(volumeGain);
    currentNode = volumeGain;

    return currentNode;
  };

  const playSample = async (blob: Blob, sampleId?: string) => {
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

      // Build effects chain if sampleId provided
      let outputNode: AudioNode;
      if (sampleId) {
        outputNode = buildEffectsChain(audioContextRef.current, sampleId, source);
      } else {
        outputNode = source;
      }

      // Connect to destination and master recorder if recording
      outputNode.connect(audioContextRef.current.destination);
      if (isMasterRecording && masterDestinationRef.current) {
        outputNode.connect(masterDestinationRef.current);
      }

      // Track playing samples for progress and handle cleanup
      if (sampleId) {
        const startTime = audioContextRef.current.currentTime;
        const duration = audioBuffer.duration;
        setPlayingSamples(prev => new Map(prev).set(sampleId, { source, startTime, duration }));
      }

      // Set up onended handler
      source.onended = () => {
        // Remove from playing samples
        if (sampleId) {
          setPlayingSamples(prev => {
            const newMap = new Map(prev);
            newMap.delete(sampleId);
            return newMap;
          });
        }
        // Clear monophonic ref if needed
        if (playbackMode === 'monophonic' && currentSourceRef.current === source) {
          currentSourceRef.current = null;
        }
      };

      // Track the source if monophonic
      if (playbackMode === 'monophonic') {
        currentSourceRef.current = source;
      }

      source.start();
      console.log('Playing sample with effects:', sampleId);
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

    // Check which samples are assigned in sequencers
    const sequenceKey = `sequence_${currentProjectId}`;
    const savedSequence = localStorage.getItem(sequenceKey);
    const assignedSampleIds = new Set<string>();

    if (savedSequence) {
      try {
        const sequenceData = JSON.parse(savedSequence);
        if (sequenceData && sequenceData.sequencers && Array.isArray(sequenceData.sequencers)) {
          sequenceData.sequencers.forEach((seq: any) => {
            if (seq && seq.steps && Array.isArray(seq.steps)) {
              seq.steps.forEach((sampleId: string | null) => {
                if (sampleId) assignedSampleIds.add(sampleId);
              });
            }
          });
        }
      } catch (error) {
        console.error('Failed to parse sequencer data:', error);
        // Clear corrupt data
        localStorage.removeItem(sequenceKey);
      }
    }

    const samplesToDelete = Array.from(selectedSamples).filter(id => !assignedSampleIds.has(id));
    const samplesToKeep = Array.from(selectedSamples).filter(id => assignedSampleIds.has(id));

    let message = `Delete ${selectedSamples.size} sample${selectedSamples.size > 1 ? 's' : ''}?`;
    if (samplesToKeep.length > 0) {
      message = `Delete ${samplesToDelete.length} sample${samplesToDelete.length > 1 ? 's' : ''}? (${samplesToKeep.length} assigned in sequencers will be preserved)`;
    }

    if (!confirm(message)) {
      return;
    }

    try {
      for (const sampleId of samplesToDelete) {
        await deleteSample(sampleId);
      }
      setSelectedSamples(new Set());
      setIsSelectMode(false);
      await loadSamples();
      console.log(`Deleted ${samplesToDelete.length} samples, kept ${samplesToKeep.length} assigned samples`);
      if (samplesToKeep.length > 0) {
        alert(`Deleted ${samplesToDelete.length} samples. ${samplesToKeep.length} samples preserved because they are assigned in sequencers.`);
      }
    } catch (error) {
      console.error('Failed to delete samples:', error);
      alert('Failed to delete samples. Please try again.');
    }
  };

  const clearAllSamples = async () => {
    if (samples.length === 0) return;

    const message = `Delete all ${samples.length} samples? This cannot be undone.`;

    if (!confirm(message)) {
      return;
    }

    try {
      for (const sample of samples) {
        await deleteSample(sample.id);
      }
      setSamples([]);
      setSelectedSamples(new Set());
      setIsSelectMode(false);
      console.log(`Cleared all ${samples.length} samples`);
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

      // Try to use the best available codec with high bitrate
      let mimeType = 'audio/webm;codecs=opus';
      let options: MediaRecorderOptions = { mimeType, audioBitsPerSecond: 256000 }; // 256 kbps for high quality

      // Check if the preferred codec is supported
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        console.log('Opus codec not supported, trying alternatives...');

        // Try other high-quality options
        const alternatives = [
          'audio/webm',
          'audio/ogg;codecs=opus',
          'audio/mp4',
          ''
        ];

        for (const alt of alternatives) {
          if (MediaRecorder.isTypeSupported(alt)) {
            mimeType = alt;
            options = alt ? { mimeType: alt, audioBitsPerSecond: 256000 } : { audioBitsPerSecond: 256000 };
            console.log('Using codec:', alt || 'default');
            break;
          }
        }
      }

      // Create MediaRecorder with high-quality settings
      const recorder = new MediaRecorder(destination.stream, options);
      masterRecorderRef.current = recorder;
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: mimeType || 'audio/webm' });
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

      // Start recording with shorter timeslice for better accuracy
      recorder.start(100); // Capture data every 100ms
      setIsMasterRecording(true);
      console.log('Master recording started with codec:', mimeType);
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

  const clearMasterRecording = async () => {
    if (!masterRecording) return;

    if (!confirm('Are you sure you want to delete this recording?')) {
      return;
    }

    try {
      // Stop playback if playing
      if (isPlaying) {
        stopPlayback();
      }

      // Clear the recording
      setMasterRecording(null);
      setDuration(0);
      setPlaybackPosition(0);

      // Delete from database if it exists
      const { deleteMasterRecording, getMasterRecordingByProject } = await import('@/lib/db');
      const recording = await getMasterRecordingByProject(currentProjectId);
      if (recording) {
        await deleteMasterRecording(recording.id);
        console.log('Master recording deleted from database');
      }
    } catch (error) {
      console.error('Failed to clear recording:', error);
      alert('Failed to clear recording. Please try again.');
    }
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
    if (!audioContextRef.current || !playbackSourceRef.current) return;

    const currentPosition = audioContextRef.current.currentTime - playbackStartTimeRef.current;
    setPlaybackPosition(currentPosition);

    // Continue updating while source is playing
    animationFrameRef.current = requestAnimationFrame(updatePlaybackPosition);
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

  const handleSaveEditedSample = async (editedBlob: Blob) => {
    if (!editingSample) return;

    try {
      // Initialize audio context if needed
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      // Get duration of edited sample
      const arrayBuffer = await editedBlob.arrayBuffer();
      let duration = 0;

      try {
        const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer.slice(0));
        duration = audioBuffer.duration;
      } catch (decodeError) {
        console.warn('Could not decode audio for duration, using default:', decodeError);
        duration = 1; // Default duration if decode fails
      }

      // Update the sample in IndexedDB
      await saveSample({
        id: editingSample.id,
        projectId: currentProjectId,
        blob: editedBlob,
        timestamp: Date.now(),
        duration: duration
      });

      // Reload samples to show the updated version
      await loadSamples();
      console.log('Saved edited sample:', editingSample.id);
    } catch (error) {
      console.error('Failed to save edited sample:', error);
      // Don't alert on auto-save failures, just log them
    }
  };

  const handleSampleNameChange = async (newName: string) => {
    if (!editingSample) return;

    try {
      // Find the current sample to get its blob and other properties
      const currentSample = samples.find(s => s.id === editingSample.id);
      if (!currentSample) return;

      // Update the sample in IndexedDB with the new name
      await saveSample({
        id: editingSample.id,
        projectId: currentProjectId,
        blob: currentSample.blob,
        timestamp: currentSample.timestamp,
        duration: currentSample.duration,
        name: newName,
        midiNote: currentSample.midiNote
      });

      // Update the editingSample state to reflect the new name
      setEditingSample(prev => prev ? { ...prev, name: newName } : null);

      // Reload samples to show the updated name everywhere
      await loadSamples();
      console.log('Saved sample name:', newName);
    } catch (error) {
      console.error('Failed to save sample name:', error);
    }
  };

  // Instrument Management Functions
  const handleSaveInstrument = async () => {
    const instrumentName = prompt('Enter a name for this instrument:');
    if (!instrumentName) return;

    try {
      const instrumentData = {
        name: instrumentName,
        timestamp: Date.now(),
        samples: samples.map(s => ({ id: s.id, timestamp: s.timestamp })),
        effects: Array.from(sampleEffects.entries())
      };

      const key = `instrument_${instrumentName}_${Date.now()}`;
      localStorage.setItem(key, JSON.stringify(instrumentData));

      // Update instruments list
      const newInstruments = [...savedInstruments, key];
      localStorage.setItem('savedInstruments', JSON.stringify(newInstruments));
      setSavedInstruments(newInstruments);

      alert(`Instrument "${instrumentName}" saved successfully!`);
    } catch (error) {
      console.error('Failed to save instrument:', error);
      alert('Failed to save instrument. Please try again.');
    }
  };

  const handleLoadInstrument = async (instrumentKey: string) => {
    try {
      const instrumentData = localStorage.getItem(instrumentKey);
      if (!instrumentData) {
        alert('Instrument not found.');
        return;
      }

      const parsed = JSON.parse(instrumentData);
      // Load effects
      const effectsMap = new Map(parsed.effects) as Map<string, SampleEffects>;
      setSampleEffects(effectsMap);

      alert(`Instrument "${parsed.name}" loaded successfully!`);
    } catch (error) {
      console.error('Failed to load instrument:', error);
      alert('Failed to load instrument. Please try again.');
    }
  };

  const handleExportInstrument = async () => {
    try {
      const instrumentData = {
        name: 'ChopShop_Instrument',
        timestamp: Date.now(),
        samples: await Promise.all(samples.map(async (s) => ({
          id: s.id,
          timestamp: s.timestamp,
          blob: await s.blob.arrayBuffer().then(buf => Array.from(new Uint8Array(buf)))
        }))),
        effects: Array.from(sampleEffects.entries())
      };

      const dataStr = JSON.stringify(instrumentData);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chopshop-instrument-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      console.log('Instrument exported');
    } catch (error) {
      console.error('Failed to export instrument:', error);
      alert('Failed to export instrument. Please try again.');
    }
  };

  const handleImportInstrument = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const instrumentData = JSON.parse(text);

        // Import samples
        const importedSamples: AudioSample[] = [];
        for (const sampleData of instrumentData.samples) {
          const uint8Array = new Uint8Array(sampleData.blob);
          const blob = new Blob([uint8Array], { type: 'audio/webm' });
          const sample: AudioSample = {
            id: `imported-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            projectId: currentProjectId,
            blob,
            timestamp: Date.now()
          };
          importedSamples.push(sample);
          // Save to IndexedDB
          await saveSample(sample);
        }

        // Load effects
        const effectsMap = new Map<string, SampleEffects>(instrumentData.effects);
        setSampleEffects(effectsMap);

        // Reload samples
        await loadSamples();

        alert('Instrument imported successfully!');
      } catch (error) {
        console.error('Failed to import instrument:', error);
        alert('Failed to import instrument. Please make sure the file is valid.');
      }
    };
    input.click();
  };

  const gridSize = Math.max(2, Math.ceil(Math.sqrt(samples.length)));
  const buttonSize = 80; // Fixed button size in pixels (50% of original ~160px)

  return (
    <div className="flex flex-col h-screen bg-black">
      {/* Header */}
      <div className="flex justify-between items-center p-4">
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" className="w-8 h-8">
            <rect width="200" height="200" fill="#000000" />
            <rect x="30" y="70" width="12" height="60" fill="#FF0080" rx="6"
                  style={{filter: 'drop-shadow(0 0 8px #FF0080)'}} />
            <rect x="50" y="55" width="12" height="90" fill="#FF0080" rx="6"
                  style={{filter: 'drop-shadow(0 0 8px #FF0080)'}} />
            <rect x="70" y="65" width="12" height="70" fill="#FF00FF" rx="6"
                  style={{filter: 'drop-shadow(0 0 8px #FF00FF)'}} />
            <rect x="90" y="45" width="12" height="110" fill="#8000FF" rx="6"
                  style={{filter: 'drop-shadow(0 0 8px #8000FF)'}} />
            <rect x="110" y="57.5" width="12" height="85" fill="#0080FF" rx="6"
                  style={{filter: 'drop-shadow(0 0 8px #0080FF)'}} />
            <rect x="130" y="52.5" width="12" height="95" fill="#00FFFF" rx="6"
                  style={{filter: 'drop-shadow(0 0 8px #00FFFF)'}} />
            <rect x="150" y="62.5" width="12" height="75" fill="#00FF80" rx="6"
                  style={{filter: 'drop-shadow(0 0 8px #00FF80)'}} />
            <rect x="170" y="72.5" width="12" height="55" fill="#00FF00" rx="6"
                  style={{filter: 'drop-shadow(0 0 8px #00FF00)'}} />
          </svg>
          <h1 className="text-white text-2xl font-bold">Samples</h1>
          {!isSelectMode && (
            <button
              onClick={() => setPlaybackMode(playbackMode === 'monophonic' ? 'polyphonic' : 'monophonic')}
              className="hidden px-3 py-1 rounded-lg text-xs font-bold bg-gray-800 hover:bg-gray-700 text-white"
            >
              {playbackMode === 'monophonic' ? 'MONO' : 'POLY'}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 relative">
          {/* Instrument Management Dropdown */}
          {!isSelectMode && (
            <div className="relative">
              <button
                onClick={() => setIsInstrumentMenuOpen(!isInstrumentMenuOpen)}
                className="px-3 py-1 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1"
              >
                Instrument
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Dropdown Menu */}
              {isInstrumentMenuOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-gray-800 rounded-lg shadow-lg z-50 border border-gray-700">
                  <button
                    onClick={() => {
                      handleSaveInstrument();
                      setIsInstrumentMenuOpen(false);
                      setShowLoadSubmenu(false);
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-white hover:bg-gray-700 rounded-t-lg"
                  >
                    Save as Instrument
                  </button>
                  <div className="relative">
                    <button
                      onClick={() => setShowLoadSubmenu(!showLoadSubmenu)}
                      className="w-full text-left px-4 py-2 text-sm text-white hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-between"
                      disabled={savedInstruments.length === 0}
                    >
                      <span>Load Instrument</span>
                      {savedInstruments.length > 0 && (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      )}
                    </button>
                    {showLoadSubmenu && savedInstruments.length > 0 && (
                      <div className="absolute left-full top-0 ml-1 w-56 bg-gray-700 rounded-lg shadow-lg border border-gray-600 max-h-64 overflow-y-auto">
                        {savedInstruments.map((instrumentKey) => {
                          let name = 'Unknown';
                          try {
                            const data = localStorage.getItem(instrumentKey);
                            if (data) {
                              name = JSON.parse(data).name || 'Unknown';
                            }
                          } catch (error) {
                            console.error('Failed to parse instrument name:', error);
                          }
                          return (
                            <button
                              key={instrumentKey}
                              onClick={() => {
                                handleLoadInstrument(instrumentKey);
                                setIsInstrumentMenuOpen(false);
                                setShowLoadSubmenu(false);
                              }}
                              className="w-full text-left px-4 py-2 text-sm text-white hover:bg-gray-600 first:rounded-t-lg last:rounded-b-lg"
                            >
                              {name}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      handleExportInstrument();
                      setIsInstrumentMenuOpen(false);
                      setShowLoadSubmenu(false);
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-white hover:bg-gray-700"
                  >
                    Export Instrument
                  </button>
                  <button
                    onClick={() => {
                      handleImportInstrument();
                      setIsInstrumentMenuOpen(false);
                      setShowLoadSubmenu(false);
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-white hover:bg-gray-700 rounded-b-lg"
                  >
                    Import Instrument
                  </button>
                </div>
              )}
            </div>
          )}

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

      {/* Metronome and Transport Controls */}
      <div className="px-4 py-3 bg-gray-900 border-t border-b border-gray-800">
        <div className="max-w-4xl mx-auto space-y-4">
          {/* Metronome and Transport Buttons */}
          <div className="flex items-center justify-center gap-6">
            {/* Metronome */}
            <Metronome isPlaying={isPlaying} layout="horizontal" />

            {/* Transport Buttons */}
            <div className="flex items-center gap-3">
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

          <button
            onClick={clearMasterRecording}
            disabled={!masterRecording || isSelectMode || isMasterRecording || isPlaying}
            className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            title="Clear Recording"
          >
            Clear
          </button>
            </div>
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
      </div>

      {/* MIDI Panel */}
      <div className="px-4 pb-2">
        <div className="max-w-4xl mx-auto">
          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
            {/* Header - Always visible, clickable to expand/collapse */}
            <button
              onClick={() => setIsMidiPanelExpanded(!isMidiPanelExpanded)}
              className="w-full flex items-center justify-between p-3 hover:bg-gray-800 transition-colors"
            >
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M13 7H7v6h6V7z" />
                  <path fillRule="evenodd" d="M7 2a1 1 0 012 0v1h2V2a1 1 0 112 0v1h2a2 2 0 012 2v2h1a1 1 0 110 2h-1v2h1a1 1 0 110 2h-1v2a2 2 0 01-2 2h-2v1a1 1 0 11-2 0v-1H9v1a1 1 0 11-2 0v-1H5a2 2 0 01-2-2v-2H2a1 1 0 110-2h1V9H2a1 1 0 010-2h1V5a2 2 0 012-2h2V2zM5 5h10v10H5V5z" clipRule="evenodd" />
                </svg>
                <h3 className="text-white text-sm font-bold">MIDI Controller</h3>
                {selectedMidiDevice && midiDevices.length > 0 && (
                  <span className="text-xs text-green-400">
                    ✓ {midiDevices.find(d => d.id === selectedMidiDevice)?.name}
                  </span>
                )}
              </div>
              <svg
                className={`w-5 h-5 text-gray-400 transition-transform ${isMidiPanelExpanded ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Expandable Content */}
            {isMidiPanelExpanded && (
              <div className="px-3 pb-3 border-t border-gray-800 space-y-3">
                {midiDevices.length > 0 ? (
                  <>
                    {/* Device info and assigned notes */}
                    <div className="pt-3 space-y-2">
                      <div className="text-xs text-gray-400">
                        Connected Device: <span className="text-white font-mono">
                          {selectedMidiDevice
                            ? midiDevices.find(d => d.id === selectedMidiDevice)?.name || 'None'
                            : 'None selected'}
                        </span>
                      </div>

                      {/* Show samples with assigned MIDI notes */}
                      <div className="bg-gray-800 rounded-lg p-3 max-h-48 overflow-y-auto">
                        <div className="text-xs text-gray-400 mb-2 font-bold">Assigned MIDI Notes:</div>
                        {samples.filter(s => s.midiNote !== undefined && s.midiNote !== null).length > 0 ? (
                          <div className="space-y-1">
                            {samples.map((sample, index) => {
                              if (sample.midiNote === undefined || sample.midiNote === null) return null;
                              return (
                                <div key={sample.id} className="flex justify-between items-center text-xs">
                                  <span className="text-gray-300">Sample {index + 1}</span>
                                  <span className="text-blue-400 font-mono">
                                    {MIDIHelpers.noteNumberToName(sample.midiNote)} (Note {sample.midiNote})
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="text-xs text-gray-500 text-center py-2">
                            No MIDI notes assigned to samples yet.
                          </div>
                        )}
                      </div>

                      {/* Button to go to Record page for assignment */}
                      <button
                        onClick={() => router.push('/')}
                        className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg transition-colors"
                      >
                        Go to Record Page to Assign Notes
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="text-gray-500 text-sm text-center py-4">
                    <p>No MIDI devices found.</p>
                    <p className="text-xs mt-1">Connect a MIDI controller to assign notes to samples.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sample Grid and Effects Panel */}
      <div className="flex-1 p-4 pb-24 flex gap-4">
        {/* Grid Container */}
        <div className={`flex items-center justify-center transition-all ${selectedEffectsSample ? 'flex-[2]' : 'flex-1'}`}>
          {samples.length === 0 ? (
            <div className="text-center">
              <p className="text-gray-400 text-lg">No samples yet.</p>
              <p className="text-gray-500 text-sm mt-2">Go to Record to create some!</p>
            </div>
          ) : (
            <div
              className="grid gap-2"
              style={{
                gridTemplateColumns: `repeat(${gridSize}, ${buttonSize}px)`,
                gridTemplateRows: `repeat(${gridSize}, ${buttonSize}px)`,
              }}
            >
              {samples.map((sample, index) => {
                const keyboardKey = getKeyForIndex(index);
                const isKeyActive = activeKeys.has(keyboardKey.toLowerCase());
                const isSelected = selectedSamples.has(sample.id);
                const playingInfo = playingSamples.get(sample.id);
                const progress = playingInfo && audioContextRef.current
                  ? Math.min(100, ((audioContextRef.current.currentTime - playingInfo.startTime) / playingInfo.duration) * 100)
                  : 0;

                return (
                  <div
                    key={sample.id}
                    className="relative aspect-square"
                    onMouseEnter={() => !isSelectMode && setHoveredSample(sample.id)}
                    onMouseLeave={() => setHoveredSample(null)}
                  >
                    <button
                      onClick={() => {
                        if (isSelectMode) {
                          toggleSampleSelection(sample.id);
                        } else {
                          playSample(sample.blob, sample.id);
                          // Update effects panel to show this sample's effects
                          if (selectedEffectsSample !== sample.id) {
                            setSelectedEffectsSample(sample.id);
                          }
                        }
                      }}
                      className={`w-full h-full rounded-xl text-white font-bold text-2xl transition-all shadow-lg flex flex-col items-center justify-center relative overflow-hidden ${
                        isSelectMode
                          ? isSelected
                            ? 'bg-blue-600 hover:bg-blue-700'
                            : 'bg-gray-800 hover:bg-gray-700'
                          : isKeyActive
                          ? 'bg-blue-600 scale-95'
                          : 'bg-gray-800 hover:bg-gray-700 active:bg-blue-600'
                      }`}
                    >
                      {/* Circular progress indicator */}
                      {progress > 0 && (
                        <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
                          <circle
                            cx="50"
                            cy="50"
                            r="48"
                            fill="none"
                            stroke="rgba(59, 130, 246, 0.3)"
                            strokeWidth="4"
                            strokeDasharray={`${progress * 3.01593} 301.593`}
                          />
                        </svg>
                      )}

                      {isSelectMode && (
                        <div className="absolute top-2 left-2 w-6 h-6 rounded border-2 border-white flex items-center justify-center bg-gray-900 z-10">
                          {isSelected && (
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </div>
                      )}
                      <span className="text-4xl z-10">{index + 1}</span>
                      {!isSelectMode && keyboardKey && (
                        <span className="absolute top-2 right-2 text-xs bg-gray-900 px-2 py-1 rounded opacity-60 z-10">
                          {keyboardKey}
                        </span>
                      )}
                    </button>

                    {/* Edit (pencil) icon button */}
                    {!isSelectMode && hoveredSample === sample.id && (
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          // Create a defensive copy of the blob to ensure we're editing the correct sample
                          const blobCopy = sample.blob.slice(0, sample.blob.size, sample.blob.type);
                          setEditingSample({ blob: blobCopy, id: sample.id, index, name: sample.name, midiNote: sample.midiNote });
                        }}
                        className="absolute bottom-2 left-2 w-6 h-6 bg-white rounded-full flex items-center justify-center shadow-lg z-20 hover:bg-gray-100"
                        title="Edit Sample"
                      >
                        <svg className="w-4 h-4 text-gray-800" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                        </svg>
                      </button>
                    )}

                    {/* Effects menu button */}
                    {!isSelectMode && hoveredSample === sample.id && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedEffectsSample(selectedEffectsSample === sample.id ? null : sample.id);
                          if (!sampleEffects.has(sample.id)) {
                            setSampleEffects(prev => new Map(prev).set(sample.id, { ...DEFAULT_EFFECTS }));
                          }
                        }}
                        className="absolute bottom-2 right-2 w-6 h-6 bg-white rounded-full flex items-center justify-center shadow-lg z-20 hover:bg-gray-100"
                        title="Audio Effects"
                      >
                        <svg className="w-4 h-4 text-gray-800" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </button>
                    )}
                  </div>
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

        {/* Modern Effects Control Panel */}
        {selectedEffectsSample && (
          <div className="flex-1 bg-black/40 backdrop-blur-xl rounded-2xl p-6 overflow-y-auto max-w-md border border-white/10 shadow-2xl">
            {/* Header with Glass Effect */}
            <div className="flex justify-between items-center mb-8 pb-4 border-b border-white/10">
              <div>
                <h3 className="text-white font-bold text-xl tracking-tight">Mixing and Effects</h3>
                <p className="text-gray-400 text-sm mt-1.5 font-medium">
                  Sample {samples.findIndex(s => s.id === selectedEffectsSample) + 1}
                </p>
              </div>
              <button
                onClick={() => setSelectedEffectsSample(null)}
                className="text-gray-400 hover:text-white transition-all p-2.5 rounded-xl hover:bg-white/10 active:scale-95"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-5">
              {/* MIXING Section */}
              <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-5 border border-white/10 hover:border-cyan-400/30 transition-all duration-300">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-1 h-6 bg-cyan-400 rounded-full"></div>
                  <h4 className="text-cyan-400 font-bold text-sm uppercase tracking-wider">Mixing</h4>
                </div>

                <div className="space-y-5">
                  {/* Volume Control */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-white font-semibold text-sm">Volume</label>
                      <span className="text-cyan-400 text-xs font-mono font-semibold px-2 py-0.5 bg-cyan-400/10 rounded">
                        {Math.round((sampleEffects.get(selectedEffectsSample)?.volume || 1) * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="2"
                      step="0.01"
                      value={sampleEffects.get(selectedEffectsSample)?.volume || 1}
                      onChange={(e) => {
                        const effects = sampleEffects.get(selectedEffectsSample) || DEFAULT_EFFECTS;
                        setSampleEffects(prev => new Map(prev).set(selectedEffectsSample, {
                          ...effects,
                          volume: parseFloat(e.target.value)
                        }));
                      }}
                      className="w-full h-2 bg-white/10 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-cyan-400/50 hover:[&::-webkit-slider-thumb]:scale-110 [&::-webkit-slider-thumb]:transition-transform"
                    />
                  </div>

                  {/* Pan Control */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-white font-semibold text-sm">Pan</label>
                      <span className="text-cyan-400 text-xs font-mono font-semibold px-2 py-0.5 bg-cyan-400/10 rounded">
                        {(sampleEffects.get(selectedEffectsSample)?.pan || 0) < 0
                          ? `${Math.abs(Math.round((sampleEffects.get(selectedEffectsSample)?.pan || 0) * 100))}% L`
                          : (sampleEffects.get(selectedEffectsSample)?.pan || 0) > 0
                          ? `${Math.round((sampleEffects.get(selectedEffectsSample)?.pan || 0) * 100)}% R`
                          : 'C'}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="-1"
                      max="1"
                      step="0.01"
                      value={sampleEffects.get(selectedEffectsSample)?.pan || 0}
                      onChange={(e) => {
                        const effects = sampleEffects.get(selectedEffectsSample) || DEFAULT_EFFECTS;
                        setSampleEffects(prev => new Map(prev).set(selectedEffectsSample, {
                          ...effects,
                          pan: parseFloat(e.target.value)
                        }));
                      }}
                      className="w-full h-2 bg-white/10 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-cyan-400/50 hover:[&::-webkit-slider-thumb]:scale-110 [&::-webkit-slider-thumb]:transition-transform"
                    />
                    <div className="flex justify-between text-[10px] text-gray-500 mt-1">
                      <span>L</span>
                      <span>C</span>
                      <span>R</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* DYNAMICS Section */}
              <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-5 border border-white/10 hover:border-blue-400/30 transition-all duration-300">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-1 h-6 bg-blue-400 rounded-full"></div>
                  <h4 className="text-blue-400 font-bold text-sm uppercase tracking-wider">Dynamics</h4>
                </div>

                {/* Compression */}
                <div className="space-y-4">
                  <label className="flex items-center justify-between group cursor-pointer">
                    <span className="text-white font-semibold text-sm group-hover:text-blue-400 transition-colors">Compressor</span>
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={sampleEffects.get(selectedEffectsSample)?.compression.enabled || false}
                        onChange={(e) => {
                          const effects = sampleEffects.get(selectedEffectsSample) || DEFAULT_EFFECTS;
                          setSampleEffects(prev => new Map(prev).set(selectedEffectsSample, {
                            ...effects,
                            compression: { ...effects.compression, enabled: e.target.checked }
                          }));
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
                    </div>
                  </label>
                  {sampleEffects.get(selectedEffectsSample)?.compression.enabled && (
                    <div className="grid grid-cols-2 gap-4 pt-2 pl-1">
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <label className="text-gray-400 text-xs font-medium">Threshold</label>
                          <span className="text-blue-400 text-xs font-mono font-semibold px-2 py-0.5 bg-blue-400/10 rounded">
                            {sampleEffects.get(selectedEffectsSample)?.compression.threshold || -24}dB
                          </span>
                        </div>
                        <input
                          type="range"
                          min="-60"
                          max="0"
                          step="1"
                          value={sampleEffects.get(selectedEffectsSample)?.compression.threshold || -24}
                          onChange={(e) => {
                            const effects = sampleEffects.get(selectedEffectsSample) || DEFAULT_EFFECTS;
                            setSampleEffects(prev => new Map(prev).set(selectedEffectsSample, {
                              ...effects,
                              compression: { ...effects.compression, threshold: parseFloat(e.target.value) }
                            }));
                          }}
                          className="w-full h-2 bg-white/10 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-400 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-blue-400/50 hover:[&::-webkit-slider-thumb]:scale-110 [&::-webkit-slider-thumb]:transition-transform"
                        />
                      </div>
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <label className="text-gray-400 text-xs font-medium">Ratio</label>
                          <span className="text-blue-400 text-xs font-mono font-semibold px-2 py-0.5 bg-blue-400/10 rounded">
                            {(sampleEffects.get(selectedEffectsSample)?.compression.ratio || 4).toFixed(1)}:1
                          </span>
                        </div>
                        <input
                          type="range"
                          min="1"
                          max="20"
                          step="0.1"
                          value={sampleEffects.get(selectedEffectsSample)?.compression.ratio || 4}
                          onChange={(e) => {
                            const effects = sampleEffects.get(selectedEffectsSample) || DEFAULT_EFFECTS;
                            setSampleEffects(prev => new Map(prev).set(selectedEffectsSample, {
                              ...effects,
                              compression: { ...effects.compression, ratio: parseFloat(e.target.value) }
                            }));
                          }}
                          className="w-full h-2 bg-white/10 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-400 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-blue-400/50 hover:[&::-webkit-slider-thumb]:scale-110 [&::-webkit-slider-thumb]:transition-transform"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* EQ Section */}
              <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-5 border border-white/10 hover:border-green-400/30 transition-all duration-300">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-1 h-6 bg-green-400 rounded-full"></div>
                  <h4 className="text-green-400 font-bold text-sm uppercase tracking-wider">Equalization</h4>
                </div>

                <div className="space-y-4">
                  <label className="flex items-center justify-between group cursor-pointer">
                    <span className="text-white font-semibold text-sm group-hover:text-green-400 transition-colors">3-Band EQ</span>
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={sampleEffects.get(selectedEffectsSample)?.eq.enabled || false}
                        onChange={(e) => {
                          const effects = sampleEffects.get(selectedEffectsSample) || DEFAULT_EFFECTS;
                          setSampleEffects(prev => new Map(prev).set(selectedEffectsSample, {
                            ...effects,
                            eq: { ...effects.eq, enabled: e.target.checked }
                          }));
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
                    </div>
                  </label>
                  {sampleEffects.get(selectedEffectsSample)?.eq.enabled && (
                    <div className="grid grid-cols-3 gap-3 pt-2">
                      <div className="text-center">
                        <label className="text-gray-400 text-xs block mb-2">Low</label>
                        <div className="flex flex-col items-center">
                          <input
                            type="range"
                            min="-12"
                            max="12"
                            step="0.1"
                            value={sampleEffects.get(selectedEffectsSample)?.eq.low || 0}
                            onChange={(e) => {
                              const effects = sampleEffects.get(selectedEffectsSample) || DEFAULT_EFFECTS;
                              setSampleEffects(prev => new Map(prev).set(selectedEffectsSample, {
                                ...effects,
                                eq: { ...effects.eq, low: parseFloat(e.target.value) }
                              }));
                            }}
                            className="w-2 h-24 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                            style={{ WebkitAppearance: 'slider-vertical' } as React.CSSProperties}
                          />
                          <span className="text-green-400 text-xs font-mono mt-2">
                            {(sampleEffects.get(selectedEffectsSample)?.eq.low || 0) > 0 ? '+' : ''}
                            {(sampleEffects.get(selectedEffectsSample)?.eq.low || 0).toFixed(1)}dB
                          </span>
                        </div>
                      </div>
                      <div className="text-center">
                        <label className="text-gray-400 text-xs block mb-2">Mid</label>
                        <div className="flex flex-col items-center">
                          <input
                            type="range"
                            min="-12"
                            max="12"
                            step="0.1"
                            value={sampleEffects.get(selectedEffectsSample)?.eq.mid || 0}
                            onChange={(e) => {
                              const effects = sampleEffects.get(selectedEffectsSample) || DEFAULT_EFFECTS;
                              setSampleEffects(prev => new Map(prev).set(selectedEffectsSample, {
                                ...effects,
                                eq: { ...effects.eq, mid: parseFloat(e.target.value) }
                              }));
                            }}
                            className="w-2 h-24 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                            style={{ WebkitAppearance: 'slider-vertical' } as React.CSSProperties}
                          />
                          <span className="text-green-400 text-xs font-mono mt-2">
                            {(sampleEffects.get(selectedEffectsSample)?.eq.mid || 0) > 0 ? '+' : ''}
                            {(sampleEffects.get(selectedEffectsSample)?.eq.mid || 0).toFixed(1)}dB
                          </span>
                        </div>
                      </div>
                      <div className="text-center">
                        <label className="text-gray-400 text-xs block mb-2">High</label>
                        <div className="flex flex-col items-center">
                          <input
                            type="range"
                            min="-12"
                            max="12"
                            step="0.1"
                            value={sampleEffects.get(selectedEffectsSample)?.eq.high || 0}
                            onChange={(e) => {
                              const effects = sampleEffects.get(selectedEffectsSample) || DEFAULT_EFFECTS;
                              setSampleEffects(prev => new Map(prev).set(selectedEffectsSample, {
                                ...effects,
                                eq: { ...effects.eq, high: parseFloat(e.target.value) }
                              }));
                            }}
                            className="w-2 h-24 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                            style={{ WebkitAppearance: 'slider-vertical' } as React.CSSProperties}
                          />
                          <span className="text-green-400 text-xs font-mono mt-2">
                            {(sampleEffects.get(selectedEffectsSample)?.eq.high || 0) > 0 ? '+' : ''}
                            {(sampleEffects.get(selectedEffectsSample)?.eq.high || 0).toFixed(1)}dB
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* TIME-BASED Section */}
              <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-5 border border-white/10 hover:border-purple-400/30 transition-all duration-300">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-1 h-6 bg-purple-400 rounded-full"></div>
                  <h4 className="text-purple-400 font-bold text-sm uppercase tracking-wider">Time-Based FX</h4>
                </div>

                {/* Delay */}
                <div className="space-y-4 mb-6 pb-6 border-b border-white/10">
                  <label className="flex items-center justify-between group cursor-pointer">
                    <span className="text-white font-semibold text-sm group-hover:text-purple-400 transition-colors">Delay</span>
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={sampleEffects.get(selectedEffectsSample)?.delay.enabled || false}
                        onChange={(e) => {
                          const effects = sampleEffects.get(selectedEffectsSample) || DEFAULT_EFFECTS;
                          setSampleEffects(prev => new Map(prev).set(selectedEffectsSample, {
                            ...effects,
                            delay: { ...effects.delay, enabled: e.target.checked }
                          }));
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-500"></div>
                    </div>
                  </label>
                  {sampleEffects.get(selectedEffectsSample)?.delay.enabled && (
                    <div className="grid grid-cols-3 gap-3 pt-2">
                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label className="text-gray-400 text-xs">Time</label>
                          <span className="text-purple-400 text-xs font-mono">
                            {Math.round((sampleEffects.get(selectedEffectsSample)?.delay.time || 0.3) * 1000)}ms
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0.01"
                          max="2"
                          step="0.01"
                          value={sampleEffects.get(selectedEffectsSample)?.delay.time || 0.3}
                          onChange={(e) => {
                            const effects = sampleEffects.get(selectedEffectsSample) || DEFAULT_EFFECTS;
                            setSampleEffects(prev => new Map(prev).set(selectedEffectsSample, {
                              ...effects,
                              delay: { ...effects.delay, time: parseFloat(e.target.value) }
                            }));
                          }}
                          className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                        />
                      </div>
                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label className="text-gray-400 text-xs">Feedback</label>
                          <span className="text-purple-400 text-xs font-mono">
                            {Math.round((sampleEffects.get(selectedEffectsSample)?.delay.feedback || 0.3) * 100)}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="0.9"
                          step="0.01"
                          value={sampleEffects.get(selectedEffectsSample)?.delay.feedback || 0.3}
                          onChange={(e) => {
                            const effects = sampleEffects.get(selectedEffectsSample) || DEFAULT_EFFECTS;
                            setSampleEffects(prev => new Map(prev).set(selectedEffectsSample, {
                              ...effects,
                              delay: { ...effects.delay, feedback: parseFloat(e.target.value) }
                            }));
                          }}
                          className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                        />
                      </div>
                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label className="text-gray-400 text-xs">Mix</label>
                          <span className="text-purple-400 text-xs font-mono">
                            {Math.round((sampleEffects.get(selectedEffectsSample)?.delay.wet || 0.5) * 100)}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.01"
                          value={sampleEffects.get(selectedEffectsSample)?.delay.wet || 0.5}
                          onChange={(e) => {
                            const effects = sampleEffects.get(selectedEffectsSample) || DEFAULT_EFFECTS;
                            setSampleEffects(prev => new Map(prev).set(selectedEffectsSample, {
                              ...effects,
                              delay: { ...effects.delay, wet: parseFloat(e.target.value) }
                            }));
                          }}
                          className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Reverb */}
                <div className="space-y-4">
                  <label className="flex items-center justify-between group cursor-pointer">
                    <span className="text-white font-semibold text-sm group-hover:text-purple-400 transition-colors">Reverb</span>
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={sampleEffects.get(selectedEffectsSample)?.reverb.enabled || false}
                        onChange={(e) => {
                          const effects = sampleEffects.get(selectedEffectsSample) || DEFAULT_EFFECTS;
                          setSampleEffects(prev => new Map(prev).set(selectedEffectsSample, {
                            ...effects,
                            reverb: { ...effects.reverb, enabled: e.target.checked }
                          }));
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-500"></div>
                    </div>
                  </label>
                  {sampleEffects.get(selectedEffectsSample)?.reverb.enabled && (
                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label className="text-gray-400 text-xs">Decay</label>
                          <span className="text-purple-400 text-xs font-mono">
                            {(sampleEffects.get(selectedEffectsSample)?.reverb.decay || 2).toFixed(1)}s
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0.1"
                          max="5"
                          step="0.1"
                          value={sampleEffects.get(selectedEffectsSample)?.reverb.decay || 2}
                          onChange={(e) => {
                            const effects = sampleEffects.get(selectedEffectsSample) || DEFAULT_EFFECTS;
                            setSampleEffects(prev => new Map(prev).set(selectedEffectsSample, {
                              ...effects,
                              reverb: { ...effects.reverb, decay: parseFloat(e.target.value) }
                            }));
                          }}
                          className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                        />
                      </div>
                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label className="text-gray-400 text-xs">Mix</label>
                          <span className="text-purple-400 text-xs font-mono">
                            {Math.round((sampleEffects.get(selectedEffectsSample)?.reverb.wet || 0.3) * 100)}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.01"
                          value={sampleEffects.get(selectedEffectsSample)?.reverb.wet || 0.3}
                          onChange={(e) => {
                            const effects = sampleEffects.get(selectedEffectsSample) || DEFAULT_EFFECTS;
                            setSampleEffects(prev => new Map(prev).set(selectedEffectsSample, {
                              ...effects,
                              reverb: { ...effects.reverb, wet: parseFloat(e.target.value) }
                            }));
                          }}
                          className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <BottomNav />

      {/* Project Menu */}
      <ProjectMenu
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        onOpenHowToUse={() => setIsHowToUseOpen(true)}
      />

      {/* How to Use Overlay */}
      <HowToUseOverlay isOpen={isHowToUseOpen} onClose={() => setIsHowToUseOpen(false)} />

      {/* Help Button */}
      <HelpButton onClick={() => setIsHowToUseOpen(true)} />

      {/* Audio Editor */}
      {editingSample && (
        <AudioEditor
          isOpen={true}
          onClose={() => setEditingSample(null)}
          sampleBlob={editingSample.blob}
          sampleId={editingSample.id}
          sampleIndex={editingSample.index}
          sampleName={editingSample.name}
          keyboardKey={getKeyForIndex(editingSample.index)}
          midiNote={editingSample.midiNote}
          onSave={handleSaveEditedSample}
          onNameChange={handleSampleNameChange}
        />
      )}
    </div>
  );
}
