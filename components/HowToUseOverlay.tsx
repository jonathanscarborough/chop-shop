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
            <h3 className="text-white text-lg font-bold mb-3 flex items-center gap-2">
              <span className="bg-pink-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold">1</span>
              Record Page - Capture Audio
            </h3>
            <ul className="space-y-2 ml-8 text-sm">
              <li className="flex items-start gap-2">
                <span className="text-pink-400 mt-1">•</span>
                <span>Click "Grant Audio Access" or press <kbd className="bg-gray-800 px-2 py-1 rounded text-xs">SPACEBAR</kbd></span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-pink-400 mt-1">•</span>
                <span>Select a <strong className="text-white">Browser Tab</strong> (not window or screen)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-pink-400 mt-1">•</span>
                <span>Make sure to check "Share audio" in the permission dialog</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-pink-400 mt-1">•</span>
                <span>Choose a tab playing audio (YouTube, Spotify, etc.)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-pink-400 mt-1">•</span>
                <span>Hold the button or <kbd className="bg-gray-800 px-2 py-1 rounded text-xs">SPACEBAR</kbd> to record</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-pink-400 mt-1">•</span>
                <span>Release to stop and save the sample</span>
              </li>
            </ul>
          </section>

          <section>
            <h3 className="text-white text-lg font-bold mb-3 flex items-center gap-2">
              <span className="bg-purple-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold">2</span>
              Samples Page - Create Music
            </h3>
            <ul className="space-y-2 ml-8 text-sm">
              <li className="flex items-start gap-2">
                <span className="text-purple-400 mt-1">•</span>
                <span>Your recorded samples appear as colorful grid buttons</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-400 mt-1">•</span>
                <span>Click any button to play a sample, or use keyboard shortcuts:</span>
              </li>
              <li className="flex items-start gap-2 ml-4">
                <span className="text-purple-300 mt-1">-</span>
                <span><kbd className="bg-gray-800 px-2 py-1 rounded text-xs">1-0</kbd> for first row</span>
              </li>
              <li className="flex items-start gap-2 ml-4">
                <span className="text-purple-300 mt-1">-</span>
                <span><kbd className="bg-gray-800 px-2 py-1 rounded text-xs">Q-P</kbd> for second row</span>
              </li>
              <li className="flex items-start gap-2 ml-4">
                <span className="text-purple-300 mt-1">-</span>
                <span><kbd className="bg-gray-800 px-2 py-1 rounded text-xs">A-;</kbd> for third row, etc.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-400 mt-1">•</span>
                <span>Right-click a sample for options (add effects, delete, rename)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-400 mt-1">•</span>
                <span>Use the transport controls to record your live performance</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-400 mt-1">•</span>
                <span>Toggle between Mono and Poly playback modes</span>
              </li>
            </ul>
          </section>

          <section>
            <h3 className="text-white text-lg font-bold mb-3 flex items-center gap-2">
              <span className="bg-blue-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold">3</span>
              Audio Effects
            </h3>
            <ul className="space-y-2 ml-8 text-sm">
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1">•</span>
                <span>Right-click any sample and select "Add Effects"</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1">•</span>
                <span>Effects panel appears on the right side of the screen</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1">•</span>
                <span>Enable/disable effects with checkboxes</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1">•</span>
                <span>Available effects: Compression, EQ, Delay, Reverb, Phaser, Flanger, Chorus</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1">•</span>
                <span>Adjust sliders to fine-tune each effect</span>
              </li>
            </ul>
          </section>

          <section>
            <h3 className="text-white text-lg font-bold mb-3 flex items-center gap-2">
              <span className="bg-cyan-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold">4</span>
              Share Page - Export Your Music
            </h3>
            <ul className="space-y-2 ml-8 text-sm">
              <li className="flex items-start gap-2">
                <span className="text-cyan-400 mt-1">•</span>
                <span>Export your master recording as a WAV file</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-cyan-400 mt-1">•</span>
                <span>Connect to SoundCloud to share your creations online</span>
              </li>
            </ul>
          </section>

          <section>
            <h3 className="text-white text-lg font-bold mb-3 flex items-center gap-2">
              <span className="bg-green-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold">5</span>
              Projects
            </h3>
            <ul className="space-y-2 ml-8 text-sm">
              <li className="flex items-start gap-2">
                <span className="text-green-400 mt-1">•</span>
                <span>Access the hamburger menu (☰) to manage projects</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400 mt-1">•</span>
                <span>Create multiple projects to organize your samples</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400 mt-1">•</span>
                <span>Switch between projects to work on different tracks</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400 mt-1">•</span>
                <span>Each project has its own samples and recordings</span>
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
