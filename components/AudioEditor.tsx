'use client';

import { useState, useEffect, useRef } from 'react';

interface AudioEditorProps {
  isOpen: boolean;
  onClose: () => void;
  sampleBlob: Blob;
  sampleId: string;
  sampleIndex: number;
  sampleName?: string;
  keyboardKey?: string;
  midiNote?: number;
  onSave: (editedBlob: Blob) => void;
  onNameChange?: (newName: string) => void;
}

export default function AudioEditor({ isOpen, onClose, sampleBlob, sampleId, sampleIndex, sampleName, keyboardKey, midiNote, onSave, onNameChange }: AudioEditorProps) {
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackPosition, setPlaybackPosition] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [editedName, setEditedName] = useState(sampleName || `Sample ${sampleIndex + 1}`);

  // Edit parameters
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(0);
  const [volume, setVolume] = useState(1);
  const [pitchSemitones, setPitchSemitones] = useState(0);
  const [pitchCents, setPitchCents] = useState(0);
  const [fadeInDuration, setFadeInDuration] = useState(0);
  const [fadeOutDuration, setFadeOutDuration] = useState(0);
  const [timeStretch, setTimeStretch] = useState(1);

  // Original values for revert functionality
  const [originalValues, setOriginalValues] = useState<{
    startTime: number;
    endTime: number;
    volume: number;
    pitchSemitones: number;
    pitchCents: number;
    fadeInDuration: number;
    fadeOutDuration: number;
    timeStretch: number;
  } | null>(null);

  // Selection and clipboard for Cut/Copy/Paste
  const [selectionStart, setSelectionStart] = useState<number | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<number | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [clipboard, setClipboard] = useState<AudioBuffer | null>(null);
  const [draggingMarker, setDraggingMarker] = useState<'start' | 'end' | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Update edited name when sample changes
  useEffect(() => {
    setEditedName(sampleName || `Sample ${sampleIndex + 1}`);
  }, [sampleName, sampleIndex]);

  // Handle name change
  const handleNameChange = (newName: string) => {
    setEditedName(newName);
    if (onNameChange) {
      onNameChange(newName);
    }
  };

  useEffect(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    return () => {
      if (sourceRef.current) {
        sourceRef.current.stop();
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, []);

  // Auto-save when parameters change (debounced)
  useEffect(() => {
    if (!audioBuffer) return;

    // Clear existing timeout
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    // Set new timeout for auto-save
    autoSaveTimeoutRef.current = setTimeout(() => {
      handleAutoSave();
    }, 1000); // Save after 1 second of no changes

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [startTime, endTime, volume, pitchSemitones, pitchCents, fadeInDuration, fadeOutDuration, timeStretch]);

  // Load audio buffer when sample changes
  useEffect(() => {
    if (sampleBlob && audioContextRef.current) {
      loadAudioBuffer();
    }
  }, [sampleBlob]);

  const loadAudioBuffer = async () => {
    if (!audioContextRef.current) return;

    try {
      const arrayBuffer = await sampleBlob.arrayBuffer();
      const buffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
      setAudioBuffer(buffer);
      setStartTime(0);
      setEndTime(buffer.duration);

      // Store original values for revert functionality
      const originals = {
        startTime: 0,
        endTime: buffer.duration,
        volume: 1,
        pitchSemitones: 0,
        pitchCents: 0,
        fadeInDuration: 0,
        fadeOutDuration: 0,
        timeStretch: 1
      };
      setOriginalValues(originals);

      drawWaveform(buffer);
    } catch (error) {
      console.error('Failed to load audio:', error);
    }
  };

  const drawWaveform = (buffer: AudioBuffer) => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const data = buffer.getChannelData(0);
    const step = Math.ceil(data.length / width);
    const amp = height / 2;

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = '#00FF00';
    ctx.lineWidth = 1;
    ctx.beginPath();

    for (let i = 0; i < width; i++) {
      let min = 1.0;
      let max = -1.0;

      for (let j = 0; j < step; j++) {
        const datum = data[(i * step) + j];
        if (datum < min) min = datum;
        if (datum > max) max = datum;
      }

      const yMin = (1 + min) * amp;
      const yMax = (1 + max) * amp;

      if (i === 0) {
        ctx.moveTo(i, yMin);
      }

      ctx.lineTo(i, yMax);
      ctx.lineTo(i, yMin);
    }

    ctx.stroke();

    // Draw start/end markers
    const startX = (startTime / buffer.duration) * width;
    const endX = (endTime / buffer.duration) * width;

    ctx.strokeStyle = '#FF0080';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(startX, 0);
    ctx.lineTo(startX, height);
    ctx.stroke();

    ctx.strokeStyle = '#FF0080';
    ctx.beginPath();
    ctx.moveTo(endX, 0);
    ctx.lineTo(endX, height);
    ctx.stroke();

    // Highlight trimmed region
    ctx.fillStyle = 'rgba(0, 128, 255, 0.2)';
    ctx.fillRect(startX, 0, endX - startX, height);

    // Draw selection overlay if exists
    if (selectionStart !== null && selectionEnd !== null) {
      const selStart = Math.min(selectionStart, selectionEnd);
      const selEnd = Math.max(selectionStart, selectionEnd);
      const selStartX = (selStart / buffer.duration) * width;
      const selEndX = (selEnd / buffer.duration) * width;

      ctx.fillStyle = 'rgba(255, 255, 0, 0.3)';
      ctx.fillRect(selStartX, 0, selEndX - selStartX, height);

      // Draw selection borders
      ctx.strokeStyle = '#FFFF00';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(selStartX, 0);
      ctx.lineTo(selStartX, height);
      ctx.moveTo(selEndX, 0);
      ctx.lineTo(selEndX, height);
      ctx.stroke();
    }
  };

  useEffect(() => {
    if (audioBuffer) {
      drawWaveform(audioBuffer);
    }
  }, [audioBuffer, startTime, endTime, selectionStart, selectionEnd]);

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !audioBuffer) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const clickTime = (x / rect.width) * audioBuffer.duration;

    // Check if clicking near trim markers (within 10 pixels)
    const startX = (startTime / audioBuffer.duration) * rect.width;
    const endX = (endTime / audioBuffer.duration) * rect.width;
    const tolerance = 10; // pixels

    if (Math.abs(x - startX) < tolerance) {
      // Clicking near start marker - drag it
      setDraggingMarker('start');
    } else if (Math.abs(x - endX) < tolerance) {
      // Clicking near end marker - drag it
      setDraggingMarker('end');
    } else {
      // Start a new selection
      setIsSelecting(true);
      setSelectionStart(clickTime);
      setSelectionEnd(clickTime);
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !audioBuffer) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const moveTime = (x / rect.width) * audioBuffer.duration;

    if (draggingMarker === 'start') {
      // Dragging start marker
      setStartTime(Math.max(0, Math.min(moveTime, endTime - 0.01)));
    } else if (draggingMarker === 'end') {
      // Dragging end marker
      setEndTime(Math.max(startTime + 0.01, Math.min(moveTime, audioBuffer.duration)));
    } else if (isSelecting) {
      // Creating a selection
      setSelectionEnd(Math.max(0, Math.min(moveTime, audioBuffer.duration)));
    }
  };

  const handleCanvasMouseUp = () => {
    if (draggingMarker) {
      setDraggingMarker(null);
    }
    if (isSelecting) {
      setIsSelecting(false);
      // If selection is too small (less than 0.01s), clear it
      if (selectionStart !== null && selectionEnd !== null && Math.abs(selectionEnd - selectionStart) < 0.01) {
        setSelectionStart(null);
        setSelectionEnd(null);
      }
    }
  };

  // Stop playback when parameters change
  useEffect(() => {
    if (!audioBuffer || !audioContextRef.current) return;

    // Stop current playback when parameters change
    if (sourceRef.current && isPlaying) {
      try {
        sourceRef.current.stop();
        setIsPlaying(false);
      } catch (e) {
        // Ignore if already stopped
      }
    }
  }, [startTime, endTime, volume, pitchSemitones, pitchCents, fadeInDuration, fadeOutDuration, timeStretch]);

  const playPreviewLoop = () => {
    if (!audioBuffer || !audioContextRef.current) return;

    const source = audioContextRef.current.createBufferSource();
    source.buffer = audioBuffer;

    // Apply pitch shift
    const totalPitchShift = pitchSemitones + (pitchCents / 100);
    const playbackRate = Math.pow(2, totalPitchShift / 12) * timeStretch;
    source.playbackRate.value = playbackRate;

    // Apply volume with fades
    const gainNode = audioContextRef.current.createGain();

    // Calculate actual duration with time stretch
    const duration = (endTime - startTime) / timeStretch;

    // Apply fade in
    if (fadeInDuration > 0) {
      gainNode.gain.setValueAtTime(0, audioContextRef.current.currentTime);
      gainNode.gain.linearRampToValueAtTime(volume, audioContextRef.current.currentTime + fadeInDuration);
    } else {
      gainNode.gain.value = volume;
    }

    // Apply fade out
    if (fadeOutDuration > 0) {
      const fadeOutStart = audioContextRef.current.currentTime + duration - fadeOutDuration;
      gainNode.gain.setValueAtTime(volume, fadeOutStart);
      gainNode.gain.linearRampToValueAtTime(0, audioContextRef.current.currentTime + duration);
    }

    source.connect(gainNode);
    gainNode.connect(audioContextRef.current.destination);

    sourceRef.current = source;
    source.onended = () => {
      // Stop playing when finished (no loop)
      setIsPlaying(false);
      sourceRef.current = null;
    };

    source.start(0, startTime, endTime - startTime);
    setIsPlaying(true);
  };

  const togglePlayback = () => {
    if (isPlaying) {
      // Stop playback
      if (sourceRef.current) {
        try {
          sourceRef.current.stop();
          sourceRef.current = null;
        } catch (e) {
          // Ignore if already stopped
        }
      }
      setIsPlaying(false);
    } else {
      // Start playback
      playPreviewLoop();
    }
  };

  const stopPreview = () => {
    if (sourceRef.current) {
      try {
        sourceRef.current.stop();
      } catch (e) {
        // Ignore
      }
      sourceRef.current = null;
    }
    setIsPlaying(false);
    setPlaybackPosition(0);
  };

  const handleCut = async () => {
    if (!audioBuffer || !audioContextRef.current || selectionStart === null || selectionEnd === null) {
      alert('Please select a region first by dragging on the waveform');
      return;
    }

    const selStart = Math.min(selectionStart, selectionEnd);
    const selEnd = Math.max(selectionStart, selectionEnd);

    // Copy selected region to clipboard
    const duration = selEnd - selStart;
    const sampleRate = audioBuffer.sampleRate;
    const clipboardBuffer = audioContextRef.current.createBuffer(
      audioBuffer.numberOfChannels,
      duration * sampleRate,
      sampleRate
    );

    for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
      const sourceData = audioBuffer.getChannelData(channel);
      const targetData = clipboardBuffer.getChannelData(channel);
      const startSample = Math.floor(selStart * sampleRate);
      const endSample = Math.floor(selEnd * sampleRate);

      for (let i = 0; i < targetData.length; i++) {
        targetData[i] = sourceData[startSample + i] || 0;
      }
    }

    setClipboard(clipboardBuffer);

    // Create new buffer without the cut region
    const newDuration = audioBuffer.duration - duration;
    const newBuffer = audioContextRef.current.createBuffer(
      audioBuffer.numberOfChannels,
      newDuration * sampleRate,
      sampleRate
    );

    for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
      const sourceData = audioBuffer.getChannelData(channel);
      const targetData = newBuffer.getChannelData(channel);
      const startSample = Math.floor(selStart * sampleRate);
      const endSample = Math.floor(selEnd * sampleRate);

      // Copy before cut region
      for (let i = 0; i < startSample; i++) {
        targetData[i] = sourceData[i];
      }

      // Copy after cut region
      for (let i = endSample; i < sourceData.length; i++) {
        targetData[i - (endSample - startSample)] = sourceData[i];
      }
    }

    setAudioBuffer(newBuffer);
    setSelectionStart(null);
    setSelectionEnd(null);
    setEndTime(newBuffer.duration);
    alert(`Cut ${duration.toFixed(2)}s to clipboard`);
  };

  const handleCopy = async () => {
    if (!audioBuffer || !audioContextRef.current || selectionStart === null || selectionEnd === null) {
      alert('Please select a region first by dragging on the waveform');
      return;
    }

    const selStart = Math.min(selectionStart, selectionEnd);
    const selEnd = Math.max(selectionStart, selectionEnd);

    // Copy selected region to clipboard
    const duration = selEnd - selStart;
    const sampleRate = audioBuffer.sampleRate;
    const clipboardBuffer = audioContextRef.current.createBuffer(
      audioBuffer.numberOfChannels,
      duration * sampleRate,
      sampleRate
    );

    for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
      const sourceData = audioBuffer.getChannelData(channel);
      const targetData = clipboardBuffer.getChannelData(channel);
      const startSample = Math.floor(selStart * sampleRate);

      for (let i = 0; i < targetData.length; i++) {
        targetData[i] = sourceData[startSample + i] || 0;
      }
    }

    setClipboard(clipboardBuffer);
    alert(`Copied ${duration.toFixed(2)}s to clipboard`);
  };

  const handlePaste = async () => {
    if (!clipboard || !audioBuffer || !audioContextRef.current) {
      alert('Clipboard is empty - please copy or cut a region first');
      return;
    }

    const pastePosition = selectionStart !== null ? Math.min(selectionStart, selectionEnd || selectionStart) : endTime;
    const sampleRate = audioBuffer.sampleRate;
    const newDuration = audioBuffer.duration + clipboard.duration;
    const newBuffer = audioContextRef.current.createBuffer(
      audioBuffer.numberOfChannels,
      newDuration * sampleRate,
      sampleRate
    );

    const pasteSample = Math.floor(pastePosition * sampleRate);

    for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
      const sourceData = audioBuffer.getChannelData(channel);
      const clipboardData = clipboard.getChannelData(channel);
      const targetData = newBuffer.getChannelData(channel);

      // Copy before paste position
      for (let i = 0; i < pasteSample; i++) {
        targetData[i] = sourceData[i];
      }

      // Copy clipboard data
      for (let i = 0; i < clipboardData.length; i++) {
        targetData[pasteSample + i] = clipboardData[i];
      }

      // Copy after paste position
      for (let i = pasteSample; i < sourceData.length; i++) {
        targetData[i + clipboardData.length] = sourceData[i];
      }
    }

    setAudioBuffer(newBuffer);
    setEndTime(newBuffer.duration);
    setSelectionStart(null);
    setSelectionEnd(null);
    alert(`Pasted ${clipboard.duration.toFixed(2)}s at ${pastePosition.toFixed(2)}s`);
  };

  const handleTrim = () => {
    if (!audioBuffer || !audioContextRef.current) return;

    alert(`Trimming to ${startTime.toFixed(2)}s - ${endTime.toFixed(2)}s. This will be applied on save.`);
  };

  const handleNormalize = async () => {
    if (!audioBuffer) return;

    const data = audioBuffer.getChannelData(0);
    let max = 0;
    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i]);
      if (abs > max) max = abs;
    }

    if (max > 0) {
      setVolume(1 / max);
      alert(`Normalized: peak at ${(max * 100).toFixed(1)}%, adjusting volume to ${(1 / max).toFixed(2)}x`);
    }
  };

  const handleRevert = () => {
    if (!originalValues) return;

    // Reset all edit parameters to their original values
    setStartTime(originalValues.startTime);
    setEndTime(originalValues.endTime);
    setVolume(originalValues.volume);
    setPitchSemitones(originalValues.pitchSemitones);
    setPitchCents(originalValues.pitchCents);
    setFadeInDuration(originalValues.fadeInDuration);
    setFadeOutDuration(originalValues.fadeOutDuration);
    setTimeStretch(originalValues.timeStretch);

    // Redraw waveform with original markers
    if (audioBuffer) {
      drawWaveform(audioBuffer);
    }

    console.log('Reverted all changes to original values');
  };

  const handleAutoSave = async () => {
    if (!audioBuffer || !audioContextRef.current || isSaving) return;

    setIsSaving(true);
    try {
      // Create offline context for rendering
      const duration = endTime - startTime;
      const sampleRate = audioBuffer.sampleRate;
      const offlineCtx = new OfflineAudioContext(
        audioBuffer.numberOfChannels,
        duration * sampleRate,
        sampleRate
      );

      // Create buffer source
      const source = offlineCtx.createBufferSource();
      source.buffer = audioBuffer;

      // Apply pitch shift
      const totalPitchShift = pitchSemitones + (pitchCents / 100);
      const playbackRate = Math.pow(2, totalPitchShift / 12) * timeStretch;
      source.playbackRate.value = playbackRate;

      // Apply volume with fades
      const gainNode = offlineCtx.createGain();
      gainNode.gain.value = volume;

      // Fade in
      if (fadeInDuration > 0) {
        gainNode.gain.setValueAtTime(0, 0);
        gainNode.gain.linearRampToValueAtTime(volume, fadeInDuration);
      }

      // Fade out
      if (fadeOutDuration > 0) {
        const fadeOutStart = duration - fadeOutDuration;
        gainNode.gain.setValueAtTime(volume, fadeOutStart);
        gainNode.gain.linearRampToValueAtTime(0, duration);
      }

      source.connect(gainNode);
      gainNode.connect(offlineCtx.destination);

      source.start(0, startTime, duration);

      const renderedBuffer = await offlineCtx.startRendering();

      // Convert to WAV blob
      const wavBlob = audioBufferToWav(renderedBuffer);
      onSave(wavBlob);
      console.log('Auto-saved edited sample');
    } catch (error) {
      console.error('Failed to auto-save audio:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const audioBufferToWav = (buffer: AudioBuffer): Blob => {
    const numberOfChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;

    const bytesPerSample = bitDepth / 8;
    const blockAlign = numberOfChannels * bytesPerSample;

    const data = [];
    for (let i = 0; i < buffer.length; i++) {
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const sample = buffer.getChannelData(channel)[i];
        const int16 = Math.max(-1, Math.min(1, sample)) * 0x7FFF;
        data.push(int16 < 0 ? int16 | 0x8000 : int16);
      }
    }

    const dataLength = data.length * bytesPerSample;
    const buffer_size = 44 + dataLength;
    const view = new DataView(new ArrayBuffer(buffer_size));

    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(36, 'data');
    view.setUint32(40, dataLength, true);

    let offset = 44;
    for (let i = 0; i < data.length; i++) {
      view.setInt16(offset, data[i], true);
      offset += 2;
    }

    return new Blob([view], { type: 'audio/wav' });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-xl w-full max-w-5xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <div className="flex-1 flex items-center gap-3">
            {/* Editable Sample Name */}
            <input
              type="text"
              value={editedName}
              onChange={(e) => handleNameChange(e.target.value)}
              className="bg-gray-800 text-white text-xl font-bold px-3 py-1 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500 min-w-0 flex-shrink"
              style={{ width: `${Math.max(editedName.length * 12, 120)}px` }}
            />

            {/* Keyboard Key Assignment (non-editable) */}
            {keyboardKey && (
              <div className="flex items-center gap-2 bg-gray-800 px-3 py-1 rounded-lg">
                <span className="text-gray-400 text-sm">Key:</span>
                <span className="text-white font-mono font-bold">{keyboardKey.toUpperCase()}</span>
              </div>
            )}

            {/* MIDI Note Assignment (conditional, non-editable) */}
            {midiNote !== undefined && (
              <div className="flex items-center gap-2 bg-gray-800 px-3 py-1 rounded-lg">
                <span className="text-gray-400 text-sm">MIDI:</span>
                <span className="text-white font-mono font-bold">{midiNote}</span>
              </div>
            )}
          </div>

          <button onClick={onClose} className="text-gray-400 hover:text-white ml-4">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Playback Controls */}
        <div className="flex justify-center items-center p-4 border-b border-gray-800">
          <button
            onClick={togglePlayback}
            className={`px-8 py-3 rounded-lg font-bold text-white transition-all ${
              isPlaying
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {isPlaying ? (
              <span className="flex items-center gap-2">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                Stop Preview
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                </svg>
                Play Preview
              </span>
            )}
          </button>
        </div>

        {/* Waveform */}
        <div className="p-4">
          <canvas
            ref={canvasRef}
            width={1200}
            height={200}
            className="w-full bg-black rounded-lg cursor-crosshair"
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onMouseLeave={handleCanvasMouseUp}
          />
          <div className="text-gray-400 text-xs mt-2 text-center">
            Click pink markers to adjust trim | Drag anywhere else to select for Cut/Copy/Paste | Trim: {startTime.toFixed(2)}s - {endTime.toFixed(2)}s
          </div>
        </div>

        {/* Controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
          {/* Trim Controls */}
          <div className="space-y-3 bg-gray-800 p-4 rounded-lg">
            <h3 className="text-white font-bold mb-2">Trim</h3>
            <div>
              <label className="text-gray-400 text-sm">Start Time (s)</label>
              <input
                type="number"
                min="0"
                max={endTime - 0.01}
                step="0.01"
                value={startTime.toFixed(2)}
                onChange={(e) => setStartTime(Math.max(0, Math.min(parseFloat(e.target.value) || 0, endTime - 0.01)))}
                className="w-full bg-gray-700 text-white px-3 py-2 rounded mt-1"
              />
            </div>
            <div>
              <label className="text-gray-400 text-sm">End Time (s)</label>
              <input
                type="number"
                min={startTime + 0.01}
                max={audioBuffer?.duration || 10}
                step="0.01"
                value={endTime.toFixed(2)}
                onChange={(e) => setEndTime(Math.max(startTime + 0.01, Math.min(parseFloat(e.target.value) || 0, audioBuffer?.duration || 10)))}
                className="w-full bg-gray-700 text-white px-3 py-2 rounded mt-1"
              />
            </div>
          </div>

          {/* Volume */}
          <div className="space-y-3 bg-gray-800 p-4 rounded-lg">
            <h3 className="text-white font-bold mb-2">Volume</h3>
            <div>
              <label className="text-gray-400 text-sm">Amplitude: {(volume * 100).toFixed(0)}%</label>
              <input
                type="range"
                min="0"
                max="2"
                step="0.01"
                value={volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="w-full mt-1"
              />
            </div>
            <button
              onClick={handleNormalize}
              className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold text-sm"
            >
              Normalize
            </button>
          </div>

          {/* Tuning */}
          <div className="space-y-3 bg-gray-800 p-4 rounded-lg">
            <h3 className="text-white font-bold mb-2">Tuning</h3>
            <div>
              <label className="text-gray-400 text-sm">Semitones: {pitchSemitones > 0 ? '+' : ''}{pitchSemitones}</label>
              <input
                type="range"
                min="-12"
                max="12"
                step="1"
                value={pitchSemitones}
                onChange={(e) => setPitchSemitones(parseInt(e.target.value))}
                className="w-full mt-1"
              />
            </div>
            <div>
              <label className="text-gray-400 text-sm">Cents: {pitchCents > 0 ? '+' : ''}{pitchCents}</label>
              <input
                type="range"
                min="-100"
                max="100"
                step="1"
                value={pitchCents}
                onChange={(e) => setPitchCents(parseInt(e.target.value))}
                className="w-full mt-1"
              />
            </div>
          </div>

          {/* Fades */}
          <div className="space-y-3 bg-gray-800 p-4 rounded-lg">
            <h3 className="text-white font-bold mb-2">Fades</h3>
            <div>
              <label className="text-gray-400 text-sm">Fade In: {fadeInDuration.toFixed(2)}s</label>
              <input
                type="range"
                min="0"
                max={(endTime - startTime) / 2}
                step="0.01"
                value={fadeInDuration}
                onChange={(e) => setFadeInDuration(parseFloat(e.target.value))}
                className="w-full mt-1"
              />
            </div>
            <div>
              <label className="text-gray-400 text-sm">Fade Out: {fadeOutDuration.toFixed(2)}s</label>
              <input
                type="range"
                min="0"
                max={(endTime - startTime) / 2}
                step="0.01"
                value={fadeOutDuration}
                onChange={(e) => setFadeOutDuration(parseFloat(e.target.value))}
                className="w-full mt-1"
              />
            </div>
          </div>

          {/* Time Stretch */}
          <div className="space-y-3 bg-gray-800 p-4 rounded-lg">
            <h3 className="text-white font-bold mb-2">Time & Pitch</h3>
            <div>
              <label className="text-gray-400 text-sm">Time Stretch: {timeStretch.toFixed(2)}x</label>
              <input
                type="range"
                min="0.5"
                max="2"
                step="0.01"
                value={timeStretch}
                onChange={(e) => setTimeStretch(parseFloat(e.target.value))}
                className="w-full mt-1"
              />
            </div>
            <div className="text-gray-500 text-xs">
              Note: Time stretch affects pitch. Use tuning to compensate.
            </div>
          </div>

          {/* Edit Tools */}
          <div className="space-y-3 bg-gray-800 p-4 rounded-lg">
            <h3 className="text-white font-bold mb-2">Edit Tools</h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleCut}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded font-bold text-sm"
              >
                Cut
              </button>
              <button
                onClick={handleCopy}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded font-bold text-sm"
              >
                Copy
              </button>
              <button
                onClick={handlePaste}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded font-bold text-sm"
                disabled={!clipboard}
              >
                Paste
              </button>
              <button
                onClick={handleTrim}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded font-bold text-sm"
              >
                Trim
              </button>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between p-4 border-t border-gray-800">
          <div className="flex items-center gap-2 text-gray-400 text-sm">
            {isSaving && (
              <>
                <svg className="animate-spin h-4 w-4 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Saving...</span>
              </>
            )}
            {!isSaving && (
              <span className="text-green-500">✓ Changes saved automatically</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleRevert}
              disabled={!originalValues}
              className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-bold disabled:opacity-50 disabled:cursor-not-allowed"
              title="Revert all changes to original values"
            >
              Revert Changes
            </button>

            <button
              onClick={onClose}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold"
            >
              Close Editor
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
