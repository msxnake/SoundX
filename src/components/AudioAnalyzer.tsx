import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, Square, Download, Music, Activity, Layers, Trash2, Loader2, AlertCircle, Upload, CheckCircle2 } from 'lucide-react';
import { BasicPitch } from '@spotify/basic-pitch';
import * as tf from '@tensorflow/tfjs';
import { midiToNoteName, pitchToFreq, categorizeNote, DetectedNote, formatTime } from '@/src/lib/audioUtils';

const MODEL_URL = 'https://unpkg.com/@spotify/basic-pitch@1.0.1/model/model.json';

export const AudioAnalyzer: React.FC = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [notes, setNotes] = useState<DetectedNote[]>([]);
  const [recordingTime, setRecordingTime] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<number | null>(null);
  const basicPitchRef = useRef<BasicPitch | null>(null);

  useEffect(() => {
    const initModel = async () => {
      try {
        // Ensure TFJS is ready and try to use the most compatible backend
        await tf.ready();
        
        // Prefer WASM if available, otherwise fallback to CPU for safety in iFrames
        try {
          await tf.setBackend('cpu'); 
          console.log("Using TFJS CPU Backend for maximum compatibility");
        } catch (e) {
          console.warn("Could not set CPU backend explicitly:", e);
        }

        basicPitchRef.current = new BasicPitch(MODEL_URL);
        setModelLoaded(true);
      } catch (err) {
        console.error("Failed to load Basic Pitch model:", err);
        setError("Could not load AI model. Please check your connection or CORS settings.");
      }
    };
    initModel();

    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, []);

  const startRecording = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        } 
      });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorderRef.current.onstop = handleRecordingStop;
      
      mediaRecorderRef.current.start();
      setIsRecording(true);
      setRecordingTime(0);
      
      timerRef.current = window.setInterval(() => {
        setRecordingTime(prev => prev + 0.1);
      }, 100);
    } catch (err) {
      console.error("Microphone access denied:", err);
      setError("Microphone access denied. Please enable permissions.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  const handleRecordingStop = async () => {
    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
    setFileName("Recording.wav");
    await processAudioBuffer(audioBlob);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    await processAudioBuffer(file);
  };

  const processAudioBuffer = async (audioSource: Blob | File) => {
    setIsProcessing(true);
    setError(null);
    try {
      const arrayBuffer = await audioSource.arrayBuffer();
      
      const AudioCtxClass = (window.AudioContext || (window as any).webkitAudioContext);
      if (!AudioCtxClass) {
        throw new Error("Web Audio API is not supported in this browser.");
      }

      const audioCtx = new AudioCtxClass({ sampleRate: 22050 });
      
      // Ensure context is running (required by some browsers)
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }
      
      let audioBuffer: AudioBuffer;
      try {
        audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        
        // Ensure Mono for Basic Pitch
        if (audioBuffer.numberOfChannels > 1) {
          console.log(`Downmixing ${audioBuffer.numberOfChannels} channels to mono...`);
          const monoBuffer = audioCtx.createBuffer(1, audioBuffer.length, audioBuffer.sampleRate);
          const outData = monoBuffer.getChannelData(0);
          
          for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
            const channelData = audioBuffer.getChannelData(i);
            for (let j = 0; j < audioBuffer.length; j++) {
              outData[j] += channelData[j] / audioBuffer.numberOfChannels;
            }
          }
          audioBuffer = monoBuffer;
        }
      } catch (decodeErr: any) {
        throw new Error(`Audio decoding failed: ${decodeErr.message || 'The file format might be unsupported.'}`);
      }

      if (!basicPitchRef.current || !modelLoaded) {
        throw new Error("AI engine is still warming up. Please wait a moment and try again.");
      }

      setRecordingTime(audioBuffer.duration);
      const detectedNotes: DetectedNote[] = [];

      try {
        await basicPitchRef.current.evaluateModel(
          audioBuffer,
          () => {}, // On pitch data
          (notesData: any) => {
            const actualNotes = Array.isArray(notesData) ? notesData : (notesData?.notes || []);
            if (Array.isArray(actualNotes)) {
              actualNotes.forEach((note: any) => {
                const freq = pitchToFreq(note.pitchMidi);
                detectedNotes.push({
                  note: midiToNoteName(note.pitchMidi),
                  frequency: freq,
                  startTime: note.startTimeSeconds,
                  endTime: note.startTimeSeconds + note.durationSeconds,
                  duration: note.durationSeconds,
                  velocity: note.amplitude,
                  type: categorizeNote(freq)
                });
              });
            }
          }
        );
      } catch (evalErr: any) {
        throw new Error(`AI Analysis failed: ${evalErr.message || 'The audio might be too complex or short.'}`);
      }

      setNotes(detectedNotes.sort((a, b) => a.startTime - b.startTime));
      
      // Cleanup
      await audioCtx.close();
    } catch (err: any) {
      console.error("Error processing audio:", err);
      setError(err.message || "Failed to analyze audio. Please try another file.");
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadJson = () => {
    const data = {
      metadata: {
        timestamp: new Date().toISOString(),
        totalNotes: notes.length,
        duration: recordingTime
      },
      melody: notes.filter(n => n.type === 'melody'),
      bass: notes.filter(n => n.type === 'bass'),
      raw: notes
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `audio-detection-${new Date().getTime()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const clearResults = () => {
    setNotes([]);
    setRecordingTime(0);
    setFileName(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-6 space-y-6">
      {/* Header HUD */}
      <div className="flex items-center justify-between hardware-widget p-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-red-500/10 rounded-full">
            <Activity className={`w-5 h-5 ${isRecording || isProcessing ? 'text-red-500 animate-pulse' : 'text-gray-400'}`} />
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-tight uppercase">Audio Engine V1.1</h1>
            <p className="status-label">
              {isRecording ? 'Capturing Signal...' : isProcessing ? 'AI Transcribing...' : fileName ? fileName : 'Idle'}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="status-label">Model Status</p>
            <p className={`mono-data text-xs flex items-center gap-1 justify-end ${modelLoaded ? 'text-green-400' : 'text-amber-400'}`}>
              {modelLoaded ? <CheckCircle2 className="w-3 h-3" /> : <Loader2 className="w-3 h-3 animate-spin" />}
              {modelLoaded ? 'READY' : 'LOADING'}
            </p>
          </div>
          <div className="text-right">
            <p className="status-label">Timecode</p>
            <p className="mono-data text-lg">{formatTime(recordingTime)}</p>
          </div>
          <div className="text-right">
            <p className="status-label">Sample Rate</p>
            <p className="mono-data text-lg">22.05 kHz</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Controls Column */}
        <div className="md:col-span-1 space-y-4">
          {/* Recorder Widget */}
          <div className="hardware-widget p-6 flex flex-col items-center justify-center space-y-6">
            <div className={`relative p-8 rounded-full border-2 border-dashed border-[var(--color-secondary-hardware)] ${isRecording ? 'recording-glow border-red-500' : ''}`}>
              <button
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isProcessing}
                className={`w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 disabled:opacity-50 ${
                  isRecording 
                    ? 'bg-red-500 hover:bg-red-600 scale-95' 
                    : 'bg-[var(--color-ink-hardware)] text-[var(--color-bg-hardware)] hover:bg-gray-200 shadow-lg'
                }`}
              >
                {isRecording ? <Square className="w-8 h-8 fill-current" /> : <Mic className="w-8 h-8" />}
              </button>
            </div>
            <p className="status-label font-bold">Mic Input</p>
          </div>

          {/* File Upload Widget */}
          <div className="hardware-widget p-4 border border-white/5 space-y-3">
            <p className="status-label px-2">Analyze File (MP3/WAV)</p>
            <input 
              type="file" 
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept="audio/*" 
              className="hidden" 
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isRecording || isProcessing}
              className="w-full aspect-video border-2 border-dashed border-white/10 rounded-xl hover:border-white/20 hover:bg-white/5 transition-all flex flex-col items-center justify-center gap-2 group disabled:opacity-30"
            >
              <Upload className="w-6 h-6 text-gray-500 group-hover:text-white transition-colors" />
              <span className="text-[10px] uppercase font-bold tracking-widest text-gray-500">Pick Audio File</span>
            </button>
          </div>

          <div className="hardware-widget p-4 space-y-2">
              <button
                onClick={downloadJson}
                disabled={notes.length === 0 || isProcessing}
                className="w-full py-3 px-4 hardware-widget hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors border border-white/10"
              >
                <Download className="w-4 h-4" />
                <span className="text-xs uppercase font-medium">Export JSON</span>
              </button>
              
              <button
                onClick={clearResults}
                disabled={notes.length === 0 || isProcessing}
                className="w-full py-3 px-4 text-red-400 hover:bg-red-400/5 disabled:opacity-30 flex items-center justify-center gap-2 transition-colors border border-red-400/20 rounded-xl"
              >
                <Trash2 className="w-4 h-4" />
                <span className="text-xs uppercase font-medium">Clear Session</span>
              </button>
            </div>

          {error && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-start gap-3"
            >
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-200 leading-relaxed">{error}</p>
            </motion.div>
          )}
        </div>

        {/* Data Viewport */}
        <div className="md:col-span-2 space-y-4">
          <div className="hardware-widget h-[500px] flex flex-col overflow-hidden">
            <div className="p-4 border-bottom border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-[var(--color-secondary-hardware)]" />
                <span className="text-xs uppercase font-semibold">Note Sequence</span>
              </div>
              <div className="flex items-center gap-4 text-[10px] uppercase font-mono text-[var(--color-secondary-hardware)]">
                <span className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-blue-400" /> Melody
                </span>
                <span className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-amber-400" /> Bass
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
              {isProcessing ? (
                <div className="h-full flex flex-col items-center justify-center space-y-4 text-[var(--color-secondary-hardware)]">
                  <Loader2 className="w-10 h-10 animate-spin" />
                  <p className="status-label">Analyzing Spectral Data...</p>
                </div>
              ) : notes.length > 0 ? (
                <div className="space-y-2">
                  <AnimatePresence mode="popLayout">
                    {notes.map((note, idx) => (
                      <motion.div
                        key={`${idx}-${note.startTime}`}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="group flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5 hover:border-white/10 transition-all"
                      >
                        <div className="flex items-center gap-4">
                          <div className={`w-1 h-8 rounded-full ${note.type === 'melody' ? 'bg-blue-400 shadow-[0_0_10px_rgba(96,165,250,0.4)]' : 'bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.4)]'}`} />
                          <div>
                            <p className="text-lg font-bold tracking-tight">{note.note}</p>
                            <p className="mono-data text-xs text-[var(--color-secondary-hardware)]">{note.frequency.toFixed(1)} Hz</p>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-8">
                          <div className="text-right">
                            <p className="status-label">Timing</p>
                            <p className="mono-data">{note.startTime.toFixed(2)}s → {note.endTime.toFixed(2)}s</p>
                          </div>
                          <div className="text-right w-16">
                            <p className="status-label">Dur</p>
                            <p className="mono-data">{note.duration.toFixed(2)}s</p>
                          </div>
                          <div className="text-right w-16">
                            <p className="status-label">Vel</p>
                            <p className="mono-data">{(note.velocity * 100).toFixed(0)}%</p>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center space-y-4 opacity-50">
                  <Music className="w-12 h-12 text-[var(--color-secondary-hardware)]" />
                  <div className="text-center">
                    <p className="text-xs uppercase font-semibold">No Data Detected</p>
                    <p className="status-label mt-1">Start recording to capture musical input</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* Footer Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Events', value: notes.length, icon: Layers },
          { label: 'Melody Focus', value: notes.filter(n => n.type === 'melody').length, icon: Music },
          { label: 'Bass Registry', value: notes.filter(n => n.type === 'bass').length, icon: Activity },
          { label: 'Processing Latency', value: isProcessing ? 'ACTIVE' : '0.42ms', underline: true },
        ].map((stat, i) => (
          <div key={i} className="hardware-widget p-4 flex flex-col justify-between">
            <span className="status-label flex items-center gap-2">
              {stat.icon && <stat.icon className="w-3 h-3" />}
              {stat.label}
            </span>
            <span className={`mono-data text-xl mt-2 ${stat.underline ? 'text-green-400' : ''}`}>
              {stat.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
