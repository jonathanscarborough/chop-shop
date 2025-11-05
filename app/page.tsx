'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import BottomNav from '@/components/BottomNav';
import ProjectMenu from '@/components/ProjectMenu';
import HowToUseOverlay from '@/components/HowToUseOverlay';
import { initDB, saveSample, saveProject, getProject } from '@/lib/db';

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
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

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
  }, [isRecording, isRequestingPermission]);

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

  const requestAudioPermission = async () => {
    if (isRequestingPermission || hasAudioStream) return;

    setIsRequestingPermission(true);
    console.log('Requesting audio capture permission...');

    try {
      // Request tab/system audio capture instead of microphone
      const stream = await navigator.mediaDevices.getDisplayMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        } as MediaTrackConstraints,
        video: {
          displaySurface: 'browser'
        } as MediaTrackConstraints
      });

      console.log('Capture permission granted');
      console.log('Audio tracks:', stream.getAudioTracks().length);
      console.log('Video tracks:', stream.getVideoTracks().length);

      // Check if audio tracks are present
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        stream.getTracks().forEach(track => track.stop());
        setIsRequestingPermission(false);
        alert('No audio track detected. Please:\n\n1. Select a BROWSER TAB (not window or screen)\n2. Make sure to check "Share audio" in the dialog\n3. Choose a tab that is currently playing audio');
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
          if (isRecording) {
            stopRecording();
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
          alert('Permission denied. To capture audio:\n\n1. Click "Hold to Record" again\n2. Select a BROWSER TAB (not window)\n3. Check "Share audio" in the dialog\n4. Choose a tab playing audio');
        } else if (error.name === 'NotSupportedError') {
          alert('Audio capture is not supported in this browser. Try Chrome, Edge, or Firefox.');
        } else {
          alert(`Error: ${error.message}`);
        }
      }
    }
  };

  const startRecording = async () => {
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
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      console.log('Stopping recording...');
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      mediaRecorderRef.current = null;
      // Don't stop the stream - keep it alive for future recordings
    }
  };

  const saveRecording = async (blob: Blob) => {
    try {
      const sampleId = `sample-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      await saveSample({
        id: sampleId,
        projectId: currentProjectId,
        blob,
        timestamp: Date.now()
      });

      console.log('Sample saved to IndexedDB:', sampleId, blob.size, 'bytes');
      setSampleCount(prev => prev + 1);
    } catch (error) {
      console.error('Failed to save sample:', error);
      alert('Failed to save recording. Please try again.');
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
                <p className="text-green-400">✓ Audio source connected</p>
                <p className="mt-2">Hold the button to start recording</p>
                <p className="mt-1 text-xs">Release to stop and save the sample</p>
                {sampleCount > 0 && (
                  <p className="mt-2 text-blue-400">{sampleCount} sample{sampleCount !== 1 ? 's' : ''} recorded</p>
                )}
              </>
            ) : (
              <>
                <p>Press the button or spacebar to grant audio access and record audio samples</p>
                <p className="mt-2">
                  <strong className="text-gray-300">Important:</strong> Select a <strong className="text-gray-300">BROWSER TAB</strong>
                </p>
                <p className="mt-1 text-xs">Check "Share audio" and choose a tab playing audio</p>
              </>
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
    </div>
  );
}
