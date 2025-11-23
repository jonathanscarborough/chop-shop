'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import BottomNav from '@/components/BottomNav';
import ProjectMenu from '@/components/ProjectMenu';
import HowToUseOverlay from '@/components/HowToUseOverlay';
import HelpButton from '@/components/HelpButton';
import { initDB, saveSample, saveProject, getProject } from '@/lib/db';
import midiService, { MIDIDeviceInfo, MIDIHelpers } from '@/lib/midi';

export default function RecordPage() {
  const router = useRouter();
  const [isRecording, setIsRecording] = useState(false);
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const [hasAudioStream, setHasAudioStream] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isHowToUseOpen, setIsHowToUseOpen] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [currentProjectId, setCurrentProjectId] = useState<string>('');
  const [sampleCount, setSampleCount] = useState(0);
  const [isMobileDevice, setIsMobileDevice] = useState(false);
  const [midiDevices, setMidiDevices] = useState<MIDIDeviceInfo[]>([]);
  const [selectedMidiDevice, setSelectedMidiDevice] = useState<string>('');
  const [isLearningMidiNote, setIsLearningMidiNote] = useState(false);
  const [learnedMidiNote, setLearnedMidiNote] = useState<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Detect mobile device
  useEffect(() => {
    const checkMobile = () => {
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      const hasGetDisplayMedia = !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
      setIsMobileDevice(isMobile || !hasGetDisplayMedia);
    };
    checkMobile();
  }, []);

  // Monitor audio levels
  const monitorAudioLevel = useCallback(() => {
    if (!analyserRef.current) return;

    const analyser = analyserRef.current;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const updateLevel = () => {
      analyser.getByteFrequencyData(dataArray);

      // Calculate average volume
      const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
      const normalizedLevel = Math.min(100, (average / 255) * 100);

      setAudioLevel(normalizedLevel);
      animationFrameRef.current = requestAnimationFrame(updateLevel);
    };

    updateLevel();
  }, []);

  // Initialize database and load current project
  useEffect(() => {
    const initializeProject = async () => {
      try {
        await initDB();

        // Load current project ID from localStorage or use default
        const storedProjectId = localStorage.getItem('currentProjectId') || 'default-project';
        setCurrentProjectId(storedProjectId);

        // Check if project exists
        const project = await getProject(storedProjectId);
        if (!project) {
          // Create project if it doesn't exist
          await saveProject({
            id: storedProjectId,
            name: storedProjectId === 'default-project' ? 'My First Project' : 'New Project',
            createdAt: Date.now(),
            lastModified: Date.now()
          });
          console.log('Created project:', storedProjectId);
        }

        // Load sample count
        const { getSamplesByProject } = await import('@/lib/db');
        const samples = await getSamplesByProject(storedProjectId);
        setSampleCount(samples.length);
      } catch (error) {
        console.error('Failed to initialize project:', error);
      }
    };

    initializeProject();

    // Initialize MIDI
    midiService.initialize().then(success => {
      if (success) {
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
  }, []);

  // Check if we should show the "How to Use" overlay on first visit
  useEffect(() => {
    const hideHowToUse = localStorage.getItem('hideHowToUse');
    if (!hideHowToUse) {
      setIsHowToUseOpen(true);
    }
  }, []);

  // Update localStorage when project changes
  useEffect(() => {
    if (currentProjectId) {
      localStorage.setItem('currentProjectId', currentProjectId);
    }
  }, [currentProjectId]);

  // ========== Recording Functions (defined before use Effect to avoid hoisting issues) ==========

  const saveRecording = useCallback(async (blob: Blob) => {
    try {
      const sampleId = `sample-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      await saveSample({
        id: sampleId,
        projectId: currentProjectId,
        blob,
        timestamp: Date.now(),
        midiNote: learnedMidiNote !== null ? learnedMidiNote : undefined
      });

      console.log('Sample saved to IndexedDB:', sampleId, blob.size, 'bytes',
        learnedMidiNote !== null ? `MIDI note: ${MIDIHelpers.noteNumberToName(learnedMidiNote)}` : '');
      setSampleCount(prev => prev + 1);

      // Reset MIDI note learning for next recording
      setLearnedMidiNote(null);
    } catch (error) {
      console.error('Failed to save sample:', error);
      alert('Failed to save recording. Please try again.');
    }
  }, [currentProjectId, learnedMidiNote]);

  const requestAudioPermission = useCallback(async () => {
    if (isRequestingPermission || hasAudioStream) return;

    setIsRequestingPermission(true);
    console.log('Requesting audio capture permission...');

    try {
      let stream: MediaStream;

      // Always try getDisplayMedia first for tab audio
      try {
        console.log('Attempting to use getDisplayMedia for tab/screen audio capture');
        stream = await navigator.mediaDevices.getDisplayMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false
          } as MediaTrackConstraints,
          video: {
            displaySurface: 'browser'
          } as MediaTrackConstraints
        });
        setIsMobileDevice(false); // Successfully using desktop method
      } catch (displayError) {
        // If getDisplayMedia fails, fall back to microphone
        console.log('getDisplayMedia not supported, falling back to microphone');
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
        setIsMobileDevice(true); // Using mobile/fallback method
      }

      console.log('Capture permission granted');
      console.log('Audio tracks:', stream.getAudioTracks().length);
      console.log('Video tracks:', stream.getVideoTracks().length);

      // Check if audio tracks are present
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        stream.getTracks().forEach(track => track.stop());
        setIsRequestingPermission(false);
        alert(isMobileDevice
          ? 'No microphone detected. Please allow microphone access and try again.'
          : 'No audio track detected. Please:\n\n1. Select a BROWSER TAB (not window or screen)\n2. Make sure to check "Share audio" in the dialog\n3. Choose a tab that is currently playing audio');
        return;
      }

      console.log('Audio track found:', audioTracks[0].label);
      streamRef.current = stream;

      // Set up audio analysis for the meter
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }

      const audioContext = audioContextRef.current;
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      analyserRef.current = analyser;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      // Handle stream ending (e.g., user stops sharing)
      const allTracks = stream.getTracks();
      allTracks.forEach(track => {
        track.addEventListener('ended', () => {
          console.log('Track ended:', track.kind);
          setHasAudioStream(false);
          // Inline stop recording logic to avoid dependency issues
          if (mediaRecorderRef.current) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            mediaRecorderRef.current = null;
          }
        });
      });

      setHasAudioStream(true);
      setIsRequestingPermission(false);
      console.log('Audio stream ready');
    } catch (error) {
      console.error('Error accessing audio:', error);
      setIsRequestingPermission(false);

      if (error instanceof Error) {
        if (error.name === 'NotAllowedError') {
          alert(isMobileDevice
            ? 'Microphone permission denied. Please allow microphone access in your browser settings and try again.'
            : 'Permission denied. To capture audio:\n\n1. Click "Hold to Record" again\n2. Select a BROWSER TAB (not window)\n3. Check "Share audio" in the dialog\n4. Choose a tab playing audio');
        } else if (error.name === 'NotSupportedError') {
          alert(isMobileDevice
            ? 'Microphone access is not supported in this browser.'
            : 'Screen/tab audio capture is not supported in this browser. Try Chrome, Edge, or Firefox.');
        } else {
          alert(`Error: ${error.message}`);
        }
      }
    }
  }, [isRequestingPermission, hasAudioStream, isMobileDevice]);

  const startRecording = useCallback(async () => {
    // If we don't have audio stream, request permission first
    if (!hasAudioStream) {
      await requestAudioPermission();
      // Don't start recording yet - user needs to press again after granting permission
      return;
    }

    if (isRecording || !streamRef.current) return;

    console.log('Starting recording...');

    try {
      const audioTracks = streamRef.current.getAudioTracks();
      const audioOnlyStream = new MediaStream(audioTracks);

      const mediaRecorder = new MediaRecorder(audioOnlyStream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
          console.log('Audio chunk recorded:', e.data.size, 'bytes');
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        console.log('Recording stopped, total size:', blob.size, 'bytes');
        saveRecording(blob);
      };

      mediaRecorder.start(100); // Record in 100ms chunks
      setIsRecording(true);
      console.log('Recording started');
    } catch (error) {
      console.error('Error starting recording:', error);
      alert('Error starting recording. Please try again.');
    }
  }, [hasAudioStream, isRecording, requestAudioPermission, saveRecording]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      console.log('Stopping recording...');
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      mediaRecorderRef.current = null;
      // Don't stop the stream - keep it alive for future recordings
    }
  }, [isRecording]);

  // ========== End Recording Functions ==========

  // Spacebar keyboard shortcut for recording and ? for Help
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input field
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // ? key to open How to Use
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        setIsHowToUseOpen(true);
        return;
      }

      // Spacebar to start recording
      if (e.code === 'Space') {
        e.preventDefault(); // Prevent page scroll
        if (!isRecording && !isRequestingPermission) {
          startRecording();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      // Ignore if typing in an input field
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Spacebar release to stop recording
      if (e.code === 'Space') {
        e.preventDefault();
        if (isRecording) {
          stopRecording();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isRecording, isRequestingPermission, startRecording, stopRecording]);

  // Start monitoring audio levels as soon as we have a stream
  useEffect(() => {
    if (hasAudioStream && streamRef.current && !animationFrameRef.current) {
      console.log('Starting audio level monitoring');
      monitorAudioLevel();
    }
  }, [hasAudioStream, monitorAudioLevel]);

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  const handleMidiDeviceChange = (deviceId: string) => {
    setSelectedMidiDevice(deviceId);
    if (deviceId) {
      midiService.setActiveInput(deviceId);
      localStorage.setItem('midiDeviceId', deviceId);
    }
  };

  const handleLearnMidiNote = async () => {
    if (isLearningMidiNote) {
      midiService.cancelLearnMode();
      setIsLearningMidiNote(false);
      return;
    }

    setIsLearningMidiNote(true);
    try {
      const note = await midiService.listenForNote();
      setLearnedMidiNote(note);
      setIsLearningMidiNote(false);
      console.log('Learned MIDI note:', note, MIDIHelpers.noteNumberToName(note));
    } catch (error) {
      console.error('Error learning MIDI note:', error);
      setIsLearningMidiNote(false);
    }
  };

  const handleStop = () => {
    if (isRecording) {
      stopRecording();
    }
    router.push('/samples');
  };

  return (
    <div className="flex flex-col h-screen bg-black">
      {/* Header */}
      <div className="flex justify-between items-center p-4">
        <div className="flex items-center gap-3">
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
          <h1 className="text-white text-2xl font-bold">Chop Shop</h1>
        </div>
        <button
          onClick={() => setIsMenuOpen(true)}
          className="text-white p-2"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>

      {/* Main Content with Audio Meter */}
      <div className="flex-1 flex flex-row gap-4 p-6 pb-24">
        {/* Left Side - Record Controls */}
        <div className="flex-1 flex flex-col gap-4">
          {/* Record Button - takes up most of the space */}
          <button
            onTouchStart={startRecording}
            onTouchEnd={stopRecording}
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onMouseLeave={stopRecording} // Stop if mouse leaves while pressed
            disabled={isRequestingPermission}
            className={`w-full flex-1 min-h-[300px] rounded-2xl font-bold text-2xl transition-all relative ${
              isRequestingPermission
                ? 'bg-yellow-600 shadow-lg shadow-yellow-600/50 cursor-wait'
                : isRecording
                ? 'bg-red-600 shadow-lg shadow-red-600/50 scale-[0.98]'
                : hasAudioStream
                ? 'bg-green-800 hover:bg-green-700 shadow-lg shadow-green-800/30'
                : 'bg-gray-800 hover:bg-gray-700'
            } text-white disabled:cursor-wait`}
          >
            {isRequestingPermission
              ? 'REQUESTING PERMISSION...'
              : isRecording
              ? 'RECORDING...'
              : hasAudioStream
              ? 'HOLD TO RECORD'
              : 'GRANT AUDIO ACCESS'}
            {hasAudioStream && (
              <span className="absolute bottom-4 left-1/2 -translate-x-1/2 text-sm bg-gray-900 px-3 py-1 rounded opacity-60">
                SPACEBAR
              </span>
            )}
          </button>

          {/* Info Text */}
          <div className="text-center text-gray-400 text-sm py-2">
            {hasAudioStream ? (
              <>
                <p className="text-green-400">✓ {isMobileDevice ? 'Microphone' : 'Audio source'} connected</p>
                <p className="mt-2">Hold the button to start recording</p>
                <p className="mt-1 text-xs">Release to stop and save the sample</p>
                {sampleCount > 0 && (
                  <p className="mt-2 text-blue-400">{sampleCount} sample{sampleCount !== 1 ? 's' : ''} recorded</p>
                )}
              </>
            ) : (
              <>
                <p>Press the button{!isMobileDevice ? ' or spacebar' : ''} to grant audio access and record samples</p>
                {isMobileDevice ? (
                  <>
                    <p className="mt-2 text-xs">This will request microphone access</p>
                    <p className="mt-1 text-xs">Allow permission to start recording</p>
                  </>
                ) : (
                  <>
                    <p className="mt-2">
                      <strong className="text-gray-300">Important:</strong> Select a <strong className="text-gray-300">BROWSER TAB</strong>
                    </p>
                    <p className="mt-1 text-xs">Check "Share audio" and choose a tab playing audio</p>
                  </>
                )}
              </>
            )}
          </div>

          {/* MIDI Controls */}
          <div className="bg-gray-900 rounded-xl p-4 space-y-3 border border-gray-800">
            <h3 className="text-white text-sm font-bold">MIDI Controller</h3>

            {midiDevices.length > 0 ? (
              <>
                {/* MIDI Device Selector */}
                <div className="space-y-2">
                  <label className="text-gray-400 text-xs">Input Device</label>
                  <select
                    value={selectedMidiDevice}
                    onChange={(e) => handleMidiDeviceChange(e.target.value)}
                    className="w-full bg-gray-800 text-white text-sm rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">None</option>
                    {midiDevices.map(device => (
                      <option key={device.id} value={device.id}>
                        {device.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* MIDI Note Learning */}
                {selectedMidiDevice && (
                  <div className="space-y-2">
                    <label className="text-gray-400 text-xs">Assign MIDI Note</label>
                    <div className="flex gap-2">
                      <button
                        onClick={handleLearnMidiNote}
                        disabled={isRecording}
                        className={`flex-1 px-4 py-2 rounded font-bold text-sm transition-all ${
                          isLearningMidiNote
                            ? 'bg-yellow-600 hover:bg-yellow-700 animate-pulse'
                            : 'bg-blue-600 hover:bg-blue-700'
                        } text-white disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        {isLearningMidiNote ? 'Press a MIDI key...' : 'Learn Note'}
                      </button>
                      {learnedMidiNote !== null && (
                        <button
                          onClick={() => setLearnedMidiNote(null)}
                          className="px-4 py-2 rounded bg-red-600 hover:bg-red-700 text-white font-bold text-sm"
                          title="Clear learned note"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    {learnedMidiNote !== null && (
                      <p className="text-green-400 text-xs text-center">
                        ✓ Assigned: {MIDIHelpers.noteNumberToName(learnedMidiNote)} (Note {learnedMidiNote})
                      </p>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="text-gray-500 text-sm text-center py-3">
                <p>No MIDI devices found.</p>
                <p className="text-xs mt-1">Connect a MIDI controller to assign notes to samples.</p>
              </div>
            )}
          </div>

          {/* Stop Button */}
          <button
            onClick={handleStop}
            className="w-full h-16 rounded-2xl bg-gray-800 hover:bg-gray-700 text-white font-bold text-lg"
          >
            STOP
          </button>
        </div>

        {/* Right Side - Audio Meter */}
        <div className="w-12 flex flex-col items-center gap-2">
          <div className="text-gray-400 text-xs font-mono">{Math.round(audioLevel)}</div>
          <div className="flex-1 w-8 bg-gray-900 rounded-full overflow-hidden relative">
            {/* Audio level indicator */}
            <div
              className={`absolute bottom-0 left-0 right-0 transition-all duration-75 ${
                audioLevel > 80
                  ? 'bg-red-500'
                  : audioLevel > 50
                  ? 'bg-yellow-500'
                  : 'bg-green-500'
              }`}
              style={{ height: `${audioLevel}%` }}
            />
            {/* Tick marks */}
            <div className="absolute inset-0 flex flex-col justify-around pointer-events-none">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
                <div key={i} className="w-full h-px bg-gray-700" />
              ))}
            </div>
          </div>
          <div className="text-gray-400 text-xs">dB</div>
        </div>
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
    </div>
  );
}
