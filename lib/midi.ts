/**
 * MIDI Service Layer for Chop Shop
 * Handles Web MIDI API integration for note-based sample triggering
 */

export interface MIDIDeviceInfo {
  id: string;
  name: string;
  manufacturer: string;
  state: string;
}

export interface MIDISampleMapping {
  sampleId: string;
  midiNote: number;
}

export type MIDINoteCallback = (note: number, velocity: number, noteOn: boolean) => void;

class MIDIService {
  private midiAccess: MIDIAccess | null = null;
  private activeInputId: string | null = null;
  private noteCallbacks: Set<MIDINoteCallback> = new Set();
  private isLearningMode: boolean = false;
  private learnCallback: ((note: number) => void) | null = null;

  /**
   * Initialize Web MIDI API and request access to MIDI devices
   */
  async initialize(): Promise<boolean> {
    try {
      if (navigator.requestMIDIAccess) {
        this.midiAccess = await navigator.requestMIDIAccess();
        console.log('MIDI Access granted');
        return true;
      } else {
        console.warn('Web MIDI API not supported in this browser');
        return false;
      }
    } catch (error) {
      console.error('Failed to initialize MIDI:', error);
      return false;
    }
  }

  /**
   * Get list of available MIDI input devices
   */
  getInputDevices(): MIDIDeviceInfo[] {
    if (!this.midiAccess) return [];

    const devices: MIDIDeviceInfo[] = [];
    const inputs = this.midiAccess.inputs.values();

    for (const input of inputs) {
      devices.push({
        id: input.id,
        name: input.name || 'Unknown Device',
        manufacturer: input.manufacturer || 'Unknown',
        state: input.state
      });
    }

    return devices;
  }

  /**
   * Set the active MIDI input device
   */
  setActiveInput(deviceId: string): boolean {
    if (!this.midiAccess) return false;

    // Disconnect from previous input
    if (this.activeInputId) {
      const prevInput = this.midiAccess.inputs.get(this.activeInputId);
      if (prevInput) {
        prevInput.onmidimessage = null;
      }
    }

    // Connect to new input
    const input = this.midiAccess.inputs.get(deviceId);
    if (!input) {
      console.error('MIDI input device not found:', deviceId);
      return false;
    }

    input.onmidimessage = (event) => this.handleMIDIMessage(event);
    this.activeInputId = deviceId;
    console.log('Active MIDI input set to:', input.name);
    return true;
  }

  /**
   * Handle incoming MIDI messages
   */
  private handleMIDIMessage(event: MIDIMessageEvent): void {
    if (!event.data || event.data.length < 3) return;

    const [status, note, velocity] = event.data;

    // Status byte: 0x90 = note on, 0x80 = note off
    const command = status & 0xf0;
    const isNoteOn = command === 0x90 && velocity > 0;
    const isNoteOff = command === 0x80 || (command === 0x90 && velocity === 0);

    if (!isNoteOn && !isNoteOff) return;

    // Handle learning mode
    if (this.isLearningMode && isNoteOn && this.learnCallback) {
      this.learnCallback(note);
      this.isLearningMode = false;
      this.learnCallback = null;
      return;
    }

    // Notify all registered callbacks (ignore velocity, always use full volume)
    this.noteCallbacks.forEach(callback => {
      callback(note, 127, isNoteOn); // Always send max velocity (127)
    });
  }

  /**
   * Register a callback for MIDI note events
   */
  onNoteEvent(callback: MIDINoteCallback): () => void {
    this.noteCallbacks.add(callback);

    // Return unsubscribe function
    return () => {
      this.noteCallbacks.delete(callback);
    };
  }

  /**
   * Enter note learning mode - next note pressed will be captured
   */
  async listenForNote(): Promise<number> {
    return new Promise((resolve) => {
      this.isLearningMode = true;
      this.learnCallback = (note: number) => {
        resolve(note);
      };
    });
  }

  /**
   * Cancel note learning mode
   */
  cancelLearnMode(): void {
    this.isLearningMode = false;
    this.learnCallback = null;
  }

  /**
   * Check if currently in learning mode
   */
  isLearning(): boolean {
    return this.isLearningMode;
  }

  /**
   * Get the active input device ID
   */
  getActiveInputId(): string | null {
    return this.activeInputId;
  }

  /**
   * Disconnect from all MIDI devices
   */
  disconnect(): void {
    if (this.activeInputId && this.midiAccess) {
      const input = this.midiAccess.inputs.get(this.activeInputId);
      if (input) {
        input.onmidimessage = null;
      }
    }
    this.activeInputId = null;
    this.noteCallbacks.clear();
    this.isLearningMode = false;
    this.learnCallback = null;
  }
}

// Singleton instance
const midiService = new MIDIService();

export default midiService;

/**
 * MIDI Mapping Storage Utilities (localStorage)
 */
export const MIDIStorage = {
  /**
   * Save MIDI mappings for a project
   */
  saveMappings(projectId: string, mappings: MIDISampleMapping[]): void {
    const key = `midi_${projectId}`;
    localStorage.setItem(key, JSON.stringify(mappings));
  },

  /**
   * Load MIDI mappings for a project
   */
  loadMappings(projectId: string): MIDISampleMapping[] {
    const key = `midi_${projectId}`;
    const data = localStorage.getItem(key);

    if (!data) return [];

    try {
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error('Failed to parse MIDI mappings:', error);
      return [];
    }
  },

  /**
   * Add or update a MIDI mapping
   */
  addMapping(projectId: string, sampleId: string, midiNote: number): void {
    const mappings = this.loadMappings(projectId);

    // Remove existing mapping for this note
    const filtered = mappings.filter(m => m.midiNote !== midiNote);

    // Add new mapping
    filtered.push({ sampleId, midiNote });
    this.saveMappings(projectId, filtered);
  },

  /**
   * Remove a MIDI mapping for a sample
   */
  removeMapping(projectId: string, sampleId: string): void {
    const mappings = this.loadMappings(projectId);
    const filtered = mappings.filter(m => m.sampleId !== sampleId);
    this.saveMappings(projectId, filtered);
  },

  /**
   * Get sample ID for a MIDI note
   */
  getSampleForNote(projectId: string, midiNote: number): string | null {
    const mappings = this.loadMappings(projectId);
    const mapping = mappings.find(m => m.midiNote === midiNote);
    return mapping?.sampleId || null;
  },

  /**
   * Get MIDI note for a sample
   */
  getNoteForSample(projectId: string, sampleId: string): number | null {
    const mappings = this.loadMappings(projectId);
    const mapping = mappings.find(m => m.sampleId === sampleId);
    return mapping?.midiNote || null;
  },

  /**
   * Clear all mappings for a project
   */
  clearMappings(projectId: string): void {
    const key = `midi_${projectId}`;
    localStorage.removeItem(key);
  }
};

/**
 * MIDI Note Helper Functions
 */
export const MIDIHelpers = {
  /**
   * Convert MIDI note number to note name (e.g., 60 -> "C4")
   */
  noteNumberToName(note: number): string {
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const octave = Math.floor(note / 12) - 1;
    const noteName = noteNames[note % 12];
    return `${noteName}${octave}`;
  },

  /**
   * Validate MIDI note number
   */
  isValidNote(note: number): boolean {
    return note >= 0 && note <= 127;
  }
};
