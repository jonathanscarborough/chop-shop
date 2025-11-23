'use client';

import { useState, useEffect } from 'react';
import BottomNav from '@/components/BottomNav';
import ProjectMenu from '@/components/ProjectMenu';
import HowToUseOverlay from '@/components/HowToUseOverlay';
import HelpButton from '@/components/HelpButton';
import { getMasterRecordingByProject, MasterRecording } from '@/lib/db';

export default function SharePage() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isHowToUseOpen, setIsHowToUseOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [masterRecording, setMasterRecording] = useState<MasterRecording | null>(null);
  const [currentProjectId, setCurrentProjectId] = useState<string>('');
  const [isSoundCloudConnected, setIsSoundCloudConnected] = useState(false);
  const [showRecordingTypeSelector, setShowRecordingTypeSelector] = useState(false);
  const [pendingExportAction, setPendingExportAction] = useState<'export' | 'share' | 'soundcloud' | null>(null);

  useEffect(() => {
    // Load current project ID from localStorage
    const storedProjectId = localStorage.getItem('currentProjectId') || 'default-project';
    setCurrentProjectId(storedProjectId);
  }, []);

  useEffect(() => {
    if (currentProjectId) {
      loadMasterRecording();
    }
  }, [currentProjectId]);

  // Keyboard event handler for "?" key
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
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const loadMasterRecording = async () => {
    try {
      const recording = await getMasterRecordingByProject(currentProjectId);
      setMasterRecording(recording);
      console.log('Loaded master recording:', recording);
    } catch (error) {
      console.error('Failed to load master recording:', error);
    }
  };

  const convertToWav = async (blob: Blob): Promise<Blob> => {
    const audioContext = new AudioContext();
    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    const numberOfChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const length = audioBuffer.length * numberOfChannels * 2;

    const buffer = new ArrayBuffer(44 + length);
    const view = new DataView(buffer);

    // Write WAV header
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numberOfChannels * 2, true);
    view.setUint16(32, numberOfChannels * 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, length, true);

    // Write interleaved audio data
    const channels = [];
    for (let i = 0; i < numberOfChannels; i++) {
      channels.push(audioBuffer.getChannelData(i));
    }

    let offset = 44;
    for (let i = 0; i < audioBuffer.length; i++) {
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const sample = Math.max(-1, Math.min(1, channels[channel][i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
        offset += 2;
      }
    }

    return new Blob([buffer], { type: 'audio/wav' });
  };

  const handleExportClick = () => {
    if (!masterRecording) {
      alert('No recording available to export');
      return;
    }
    setPendingExportAction('export');
    setShowRecordingTypeSelector(true);
  };

  const handleShareClick = () => {
    if (!masterRecording) {
      alert('No recording available to share');
      return;
    }
    // Check if Web Share API is supported
    if (!navigator.share) {
      alert('Web Share is not supported in your browser. Try using a mobile browser or the "Export to Device" option instead.');
      return;
    }
    setPendingExportAction('share');
    setShowRecordingTypeSelector(true);
  };

  const handleSoundCloudClick = () => {
    if (!masterRecording) {
      alert('No recording available to share');
      return;
    }
    setPendingExportAction('soundcloud');
    setShowRecordingTypeSelector(true);
  };

  const handleRecordingTypeSelected = async (recordingType: 'samples' | 'sequence') => {
    setShowRecordingTypeSelector(false);

    // For now, both use the master recording
    // In the future, you can load different recordings based on the type
    const recording = masterRecording;
    if (!recording) return;

    if (pendingExportAction === 'export') {
      await performExport(recording);
    } else if (pendingExportAction === 'share') {
      await performWebShare(recording);
    } else if (pendingExportAction === 'soundcloud') {
      await performSoundCloudShare();
    }

    setPendingExportAction(null);
  };

  const performExport = async (recording: MasterRecording) => {
    setIsExporting(true);
    try {
      const wavBlob = await convertToWav(recording.blob);
      const url = URL.createObjectURL(wavBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chop-shop-${Date.now()}.wav`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      console.log('WAV file exported');
    } catch (error) {
      console.error('Failed to export:', error);
      alert('Failed to export recording. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const performWebShare = async (recording: MasterRecording) => {
    setIsExporting(true);
    try {
      const wavBlob = await convertToWav(recording.blob);
      const file = new File([wavBlob], `chop-shop-${Date.now()}.wav`, { type: 'audio/wav' });

      // Check if sharing files is supported
      if (navigator.canShare && !navigator.canShare({ files: [file] })) {
        alert('Sharing audio files is not supported in your browser.');
        setIsExporting(false);
        return;
      }

      await navigator.share({
        title: 'My Chop Shop Recording',
        text: 'Check out my music created with Chop Shop!',
        files: [file]
      });

      console.log('Shared successfully');
    } catch (error: any) {
      // User cancelled the share or an error occurred
      if (error.name !== 'AbortError') {
        console.error('Failed to share:', error);
        alert('Failed to share recording. Please try again.');
      }
    } finally {
      setIsExporting(false);
    }
  };

  const performSoundCloudShare = async () => {
    if (!isSoundCloudConnected) {
      alert('Please connect to SoundCloud first by clicking "Connect SoundCloud Account"');
      return;
    }
    alert('SoundCloud upload feature will be available once you connect your account');
  };

  const handleConnectSoundCloud = () => {
    // SoundCloud OAuth flow requires proper setup
    alert('SoundCloud Integration Setup Required:\n\n1. Create a SoundCloud app at https://soundcloud.com/you/apps\n2. Add your Client ID to .env.local as NEXT_PUBLIC_SOUNDCLOUD_CLIENT_ID\n3. Set redirect URI in SoundCloud app settings to match your app URL\n4. Restart the development server\n\nOnce configured, you\'ll be able to upload recordings directly to SoundCloud.');
  };

  const handleShareSoundCloud = async () => {
    if (!isSoundCloudConnected) {
      alert('Please connect to SoundCloud first by clicking "Connect SoundCloud Account"');
      return;
    }

    if (!masterRecording) {
      alert('No recording available to share');
      return;
    }

    // Implementation for uploading to SoundCloud
    alert('SoundCloud upload feature will be available once you connect your account');
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
          <h1 className="text-white text-2xl font-bold">Share</h1>
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

      {/* Main Content */}
      <div className="flex-1 p-6 pb-24 space-y-4">
        <div className="bg-gray-900 rounded-2xl p-6">
          <h2 className="text-white text-lg font-bold mb-2">Your Recording</h2>
          {masterRecording ? (
            <div className="space-y-2">
              <p className="text-gray-400 text-sm">
                Duration: {Math.floor(masterRecording.duration / 60)}:{Math.floor(masterRecording.duration % 60).toString().padStart(2, '0')}
              </p>
              <p className="text-gray-400 text-sm">
                Size: {(masterRecording.blob.size / 1024 / 1024).toFixed(2)} MB
              </p>
              <p className="text-gray-400 text-sm">
                Created: {new Date(masterRecording.timestamp).toLocaleString()}
              </p>
            </div>
          ) : (
            <p className="text-gray-400 text-sm">
              No recording available yet. Create a master recording from the Samples page.
            </p>
          )}
        </div>

        {/* Share Options */}
        <div className="space-y-3">
          <button
            onClick={handleExportClick}
            disabled={!masterRecording || isExporting}
            className="w-full h-16 rounded-xl bg-gray-800 hover:bg-gray-700 text-white font-bold text-lg flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {isExporting ? 'Exporting...' : 'Export to Device (WAV)'}
          </button>

          <button
            onClick={handleShareClick}
            disabled={!masterRecording || isExporting}
            className="w-full h-16 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-lg flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            Share
          </button>

          {!isSoundCloudConnected ? (
            <button
              onClick={handleConnectSoundCloud}
              className="w-full h-16 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-lg flex items-center justify-center gap-3 transition-all"
            >
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M7 17.939h-1v-8.068c.308-.231.639-.429 1-.566v8.634zm3 0h1v-9.224c-.229.265-.443.548-.621.857l-.379-.184v8.551zm-2 0h1v-8.848c-.508-.079-.623-.05-1-.01v8.858zm-4 0h1v-7.02c-.312.458-.555.971-.692 1.535l-.308-.182v5.667zm-3-5.25c-.606.547-1 1.354-1 2.268 0 .914.394 1.721 1 2.268v-4.536zm18.879-.671c-.204-2.837-2.404-5.079-5.117-5.079-1.022 0-1.964.328-2.762.877v10.123h9.089c1.607 0 2.911-1.393 2.911-3.106 0-1.714-1.304-3.106-2.911-3.106-.384 0-.752.074-1.092.213l-.118.078zm-7.879 5.921v-9.925c.267-.086.555-.125.844-.125.029 0 .057.003.086.004-.513-.154-1.053-.237-1.607-.237-.015 0-.029.001-.044.001l.721 10.282z"/>
              </svg>
              Connect SoundCloud Account
            </button>
          ) : (
            <button
              onClick={handleSoundCloudClick}
              disabled={!masterRecording}
              className="w-full h-16 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-lg flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M7 17.939h-1v-8.068c.308-.231.639-.429 1-.566v8.634zm3 0h1v-9.224c-.229.265-.443.548-.621.857l-.379-.184v8.551zm-2 0h1v-8.848c-.508-.079-.623-.05-1-.01v8.858zm-4 0h1v-7.02c-.312.458-.555.971-.692 1.535l-.308-.182v5.667zm-3-5.25c-.606.547-1 1.354-1 2.268 0 .914.394 1.721 1 2.268v-4.536zm18.879-.671c-.204-2.837-2.404-5.079-5.117-5.079-1.022 0-1.964.328-2.762.877v10.123h9.089c1.607 0 2.911-1.393 2.911-3.106 0-1.714-1.304-3.106-2.911-3.106-.384 0-.752.074-1.092.213l-.118.078zm-7.879 5.921v-9.925c.267-.086.555-.125.844-.125.029 0 .057.003.086.004-.513-.154-1.053-.237-1.607-.237-.015 0-.029.001-.044.001l.721 10.282z"/>
              </svg>
              Upload to SoundCloud
            </button>
          )}
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

      {/* Recording Type Selector Popup */}
      {showRecordingTypeSelector && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/80"
            onClick={() => setShowRecordingTypeSelector(false)}
          />

          {/* Content */}
          <div className="relative bg-gray-900 rounded-2xl p-6 max-w-md w-full">
            <h3 className="text-white text-xl font-bold mb-4">Select Recording Type</h3>
            <div className="space-y-3">
              <button
                onClick={() => handleRecordingTypeSelected('samples')}
                className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition-colors"
              >
                Samples Recording
              </button>
              <button
                onClick={() => handleRecordingTypeSelected('sequence')}
                className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold transition-colors"
              >
                Sequence Recording
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
