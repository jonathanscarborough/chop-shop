'use client';

import { useState } from 'react';

interface HowToUseOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function HowToUseOverlay({ isOpen, onClose }: HowToUseOverlayProps) {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  if (!isOpen) return null;

  const handleClose = () => {
    if (dontShowAgain) {
      localStorage.setItem('hideHowToUse', 'true');
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80" onClick={handleClose} />

      {/* Content */}
      <div className="relative bg-gray-900 rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
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
            <h2 className="text-white text-2xl font-bold">How to Use Chop Shop</h2>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Instructions */}
        <div className="space-y-6 text-gray-300">
          <section>
            <h3 className="text-white text-lg font-bold mb-3">Requirements: Google Chrome</h3>
          </section>

          <section>
            <h3 className="text-white text-lg font-bold mb-3">Record Page - Capture audio from any web page</h3>
            <ul className="space-y-2 ml-4 text-sm">
              <li className="flex items-start gap-2">
                <span className="text-gray-400 mt-1">*</span>
                <span>Click "Grant Audio Access" or press SPACEBAR</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-gray-400 mt-1">*</span>
                <span>Select a Browser Tab (not window or screen)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-gray-400 mt-1">*</span>
                <span>Check "Share audio" in the permission dialog</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-gray-400 mt-1">*</span>
                <span>Choose a tab playing audio (YouTube, Spotify, etc.)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-gray-400 mt-1">*</span>
                <span>Hold the button or SPACEBAR to record, and release to stop and save the sample</span>
              </li>
            </ul>
          </section>

          <section>
            <h3 className="text-white text-lg font-bold mb-3">MIDI Controller Support</h3>
            <ul className="space-y-2 ml-4 text-sm">
              <li className="flex items-start gap-2">
                <span className="text-gray-400 mt-1">*</span>
                <span>Connect a MIDI controller to play samples with MIDI notes</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-gray-400 mt-1">*</span>
                <span>On Record page, select your MIDI device and click "Learn Note"</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-gray-400 mt-1">*</span>
                <span>Press a key on your MIDI controller to assign it to the next sample you record</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-gray-400 mt-1">*</span>
                <span>View assigned MIDI notes in the MIDI panel on Samples page</span>
              </li>
            </ul>
          </section>

          <section>
            <h3 className="text-white text-lg font-bold mb-3">Samples Page - Create a live performance</h3>
            <ul className="space-y-2 ml-4 text-sm">
              <li className="flex items-start gap-2">
                <span className="text-gray-400 mt-1">*</span>
                <span>Your recorded samples appear as playable grid buttons</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-gray-400 mt-1">*</span>
                <span>Click any button to play a sample, or use keyboard shortcuts (1-0, Q-P, A-L, Z-M)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-gray-400 mt-1">*</span>
                <span>Click the pencil icon to edit samples with the waveform editor</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-gray-400 mt-1">*</span>
                <span>Click the effects icon (arrow) on each sample for DAW-style audio effects</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-gray-400 mt-1">*</span>
                <span>Use transport controls to record your live performance</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-gray-400 mt-1">*</span>
                <span>Save/load instrument presets with the "Instrument" menu</span>
              </li>
            </ul>
          </section>

          <section>
            <h3 className="text-white text-lg font-bold mb-3">Audio Editor</h3>
            <ul className="space-y-2 ml-4 text-sm">
              <li className="flex items-start gap-2">
                <span className="text-gray-400 mt-1">*</span>
                <span>Trim samples by dragging the start/end markers on the waveform</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-gray-400 mt-1">*</span>
                <span>Adjust volume, pitch (semitones and cents), and time stretch</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-gray-400 mt-1">*</span>
                <span>Add fade in/out with adjustable duration</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-gray-400 mt-1">*</span>
                <span>Use the Play/Pause button to preview your edits</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-gray-400 mt-1">*</span>
                <span>Changes are saved automatically when you close the editor</span>
              </li>
            </ul>
          </section>

          <section>
            <h3 className="text-white text-lg font-bold mb-3">Audio Effects</h3>
            <ul className="space-y-2 ml-4 text-sm">
              <li className="flex items-start gap-2">
                <span className="text-gray-400 mt-1">*</span>
                <span>Effects panel appears on the right side when you click a sample's effect icon</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-gray-400 mt-1">*</span>
                <span>Available effects: Compressor, 3-Band EQ, Delay, and Reverb</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-gray-400 mt-1">*</span>
                <span>Each effect can be toggled on/off with detailed parameter controls</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-gray-400 mt-1">*</span>
                <span>Effects are saved per-sample and persist across sessions</span>
              </li>
            </ul>
          </section>

          <section>
            <h3 className="text-white text-lg font-bold mb-3">Sequence Page - Create a sample-based sequence</h3>
            <ul className="space-y-2 ml-4 text-sm">
              <li className="flex items-start gap-2">
                <span className="text-gray-400 mt-1">*</span>
                <span>Create up to 8 independent sequencers with unique colors (Orange, Blue, Purple, etc.)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-gray-400 mt-1">*</span>
                <span>Each sequencer supports 1-32 variable steps - create polyrhythms!</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-gray-400 mt-1">*</span>
                <span>Click any step to open a popup menu and assign a sample</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-gray-400 mt-1">*</span>
                <span>Hover over steps to see a dropdown arrow - click to select samples</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-gray-400 mt-1">*</span>
                <span>Set BPM and beat subdivision (quarter, 8th, 16th, or 32nd notes)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-gray-400 mt-1">*</span>
                <span>Press Play to hear your sequence loop continuously</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-gray-400 mt-1">*</span>
                <span>Adjust individual volume per sequencer</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-gray-400 mt-1">*</span>
                <span>Double-click sequencer names to rename them</span>
              </li>
            </ul>
          </section>

          <section>
            <h3 className="text-white text-lg font-bold mb-3">Share Page - Export Your Music</h3>
            <ul className="space-y-2 ml-4 text-sm">
              <li className="flex items-start gap-2">
                <span className="text-gray-400 mt-1">*</span>
                <span>Export your master recording as a WAV file to your local machine, SoundCloud, or anywhere of your choosing.</span>
              </li>
            </ul>
          </section>

          <section>
            <h3 className="text-white text-lg font-bold mb-3">Projects</h3>
            <ul className="space-y-2 ml-4 text-sm">
              <li className="flex items-start gap-2">
                <span className="text-gray-400 mt-1">*</span>
                <span>Access the menu (☰) to manage projects</span>
              </li>
            </ul>
          </section>

          <section>
            <h3 className="text-white text-lg font-bold mb-3">Keyboard Shortcuts</h3>
            <ul className="space-y-2 ml-4 text-sm">
              <li className="flex items-start gap-2">
                <span className="text-gray-400 mt-1">*</span>
                <span>Press "?" on any page to open this help overlay</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-gray-400 mt-1">*</span>
                <span>Press Escape to close dropdowns and modals</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-gray-400 mt-1">*</span>
                <span>Spacebar to start/stop recording on Record page</span>
              </li>
            </ul>
          </section>
        </div>

        {/* Don't show again checkbox */}
        <div className="mt-6 pt-6 border-t border-gray-700">
          <label className="flex items-center gap-3 text-gray-400 cursor-pointer hover:text-gray-300">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-pink-600 focus:ring-2 focus:ring-pink-500"
            />
            <span className="text-sm">Don't show this again on startup</span>
          </label>
        </div>

        {/* Close button */}
        <button
          onClick={handleClose}
          className="w-full mt-4 h-12 rounded-xl bg-pink-600 hover:bg-pink-700 text-white font-bold transition-colors"
        >
          Get Started
        </button>
      </div>
    </div>
  );
}
