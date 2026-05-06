/**
 * Utility functions for audio and MIDI conversion.
 */

export const midiToNoteName = (midi: number): string => {
  const notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  return notes[midi % 12] + (Math.floor(midi / 12) - 1);
};

export const pitchToFreq = (pitch: number): number => {
  return Math.pow(2, (pitch - 69) / 12) * 440;
};

export const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
};

export interface DetectedNote {
  note: string;
  frequency: number;
  startTime: number;
  endTime: number;
  duration: number;
  velocity: number;
  type: 'bass' | 'melody';
}

export const categorizeNote = (frequency: number): 'bass' | 'melody' => {
  // Common threshold for bass/melody separation (around 200Hz is G3/Ab3 area)
  return frequency <= 200 ? 'bass' : 'melody';
};
