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

export type TrackChannel = 'Channel A (Melody)' | 'Channel B (Harmony)' | 'Channel C (Bass)';

export interface DetectedNote {
  note: string;
  frequency: number;
  startTime: number;
  endTime: number;
  duration: number;
  velocity: number;
  type: TrackChannel;
  midi: number;
}

export const categorizeNote = (frequency: number, midi: number): TrackChannel => {
  if (midi > 60) return 'Channel A (Melody)'; // Above C4
  if (midi > 45) return 'Channel B (Harmony)'; // Between A2 and C4
  return 'Channel C (Bass)'; // Below A2
};

export interface TrackerRow {
  rowIdx: number;
  channelA: DetectedNote | null;
  channelB: DetectedNote | null;
  channelC: DetectedNote | null;
}

export interface TrackerPattern {
  id: number;
  rows: TrackerRow[];
}

export const generateTrackerData = (notes: DetectedNote[], ticksPerRow = 0.12): TrackerPattern[] => {
  if (notes.length === 0) return [];
  
  const lastNote = notes[notes.length - 1];
  const totalRows = Math.ceil((lastNote.startTime + lastNote.duration) / ticksPerRow) + 1;
  const numPatterns = Math.ceil(totalRows / 64);
  
  const patterns: TrackerPattern[] = Array.from({ length: numPatterns }, (_, i) => ({
    id: i,
    rows: Array.from({ length: 64 }, (_, j) => ({
      rowIdx: j,
      channelA: null,
      channelB: null,
      channelC: null,
    }))
  }));

  // Quantize notes
  notes.forEach(note => {
    const startRow = Math.round(note.startTime / ticksPerRow);
    const patternIdx = Math.floor(startRow / 64);
    const localRowIdx = startRow % 64;
    
    if (patternIdx < patterns.length) {
      const row = patterns[patternIdx].rows[localRowIdx];
      if (note.type === 'Channel A (Melody)' && !row.channelA) row.channelA = note;
      else if (note.type === 'Channel B (Harmony)' && !row.channelB) row.channelB = note;
      else if (note.type === 'Channel C (Bass)' && !row.channelC) row.channelC = note;
    }
  });

  return patterns;
};
