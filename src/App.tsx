import { AudioAnalyzer } from './components/AudioAnalyzer';

export default function App() {
  return (
    <main className="min-h-screen py-12 px-4 md:px-8">
      <div className="max-w-4xl mx-auto mb-12 text-center">
        <h2 className="text-4xl font-extrabold tracking-tight text-gray-900 mb-2">Sonic AI Transcriber</h2>
        <p className="text-gray-500 max-w-lg mx-auto font-medium">
          Professional-grade audio analysis using Spotify's Basic Pitch AI. Capture performances and download high-precision MIDI-ready note data.
        </p>
      </div>
      
      <AudioAnalyzer />

      <footer className="mt-16 text-center">
        <p className="text-[10px] uppercase tracking-widest text-gray-400 font-mono">
          Powered by TensorFlow.js • Spectral Analysis V1.0 • Low Latency Pipeline
        </p>
      </footer>
    </main>
  );
}
