/**
 * Generate simple royalty-free audio samples as WAV buffers.
 * Pure Node.js — no external dependencies.
 */

const SAMPLE_RATE = 44100;

function createWavBuffer(samples, sampleRate = SAMPLE_RATE) {
  const numSamples = samples.length;
  const bytesPerSample = 2; // 16-bit
  const dataSize = numSamples * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  // WAV header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);      // chunk size
  buffer.writeUInt16LE(1, 20);       // PCM
  buffer.writeUInt16LE(1, 22);       // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * bytesPerSample, 28);
  buffer.writeUInt16LE(bytesPerSample, 32);
  buffer.writeUInt16LE(16, 34);      // bits per sample
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    const val = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(val * 32767), 44 + i * 2);
  }

  return buffer;
}

function sine(freq, t) {
  return Math.sin(2 * Math.PI * freq * t);
}

function envelope(t, attack, decay, sustain, release, duration) {
  if (t < attack) return t / attack;
  if (t < attack + decay) return 1 - (1 - sustain) * (t - attack) / decay;
  if (t < duration - release) return sustain;
  return sustain * (duration - t) / release;
}

function kick(t) {
  if (t < 0 || t > 0.3) return 0;
  const freq = 150 * Math.exp(-t * 20) + 40;
  return sine(freq, t) * Math.exp(-t * 8) * 0.9;
}

function hihat(t) {
  if (t < 0 || t > 0.08) return 0;
  return (Math.random() * 2 - 1) * Math.exp(-t * 60) * 0.3;
}

function snare(t) {
  if (t < 0 || t > 0.15) return 0;
  return (sine(200, t) * 0.3 + (Math.random() * 2 - 1) * 0.5) * Math.exp(-t * 15) * 0.6;
}

function bassNote(freq, t, dur) {
  if (t < 0 || t > dur) return 0;
  return sine(freq, t) * envelope(t, 0.01, 0.1, 0.6, 0.1, dur) * 0.4;
}

function pad(freq, t, dur) {
  if (t < 0 || t > dur) return 0;
  const env = envelope(t, 0.3, 0.2, 0.5, 0.5, dur);
  return (sine(freq, t) * 0.3 + sine(freq * 2, t) * 0.15 + sine(freq * 0.5, t) * 0.2) * env * 0.35;
}

// Generate 15 seconds of audio for each track
const DURATION = 15;

const TRACKS = {
  'upbeat-energy': {
    name: 'Upbeat Energy',
    artist: 'Built-in',
    genre: 'electronic',
    mood: 'energetic',
    generate() {
      const bpm = 128;
      const beatLen = 60 / bpm;
      const samples = new Float32Array(SAMPLE_RATE * DURATION);
      for (let i = 0; i < samples.length; i++) {
        const t = i / SAMPLE_RATE;
        const beat = t / beatLen;
        const beatPos = t % beatLen;
        const bar = Math.floor(beat / 4);

        let s = 0;
        // Kick on 1,2,3,4
        s += kick(beatPos);
        // Hihat on offbeats
        s += hihat(beatPos - beatLen * 0.5);
        s += hihat(beatPos);
        // Snare on 2 and 4
        if (Math.floor(beat) % 2 === 1) s += snare(beatPos);
        // Bass line
        const bassNotes = [65, 65, 82, 73]; // C2, C2, E2, D2
        const bassFreq = bassNotes[Math.floor(beat) % 4];
        s += bassNote(bassFreq, beatPos, beatLen * 0.8);
        // Pad chord
        if (bar % 2 === 0) {
          s += pad(262, t % (beatLen * 4), beatLen * 4);
          s += pad(330, t % (beatLen * 4), beatLen * 4);
        } else {
          s += pad(220, t % (beatLen * 4), beatLen * 4);
          s += pad(277, t % (beatLen * 4), beatLen * 4);
        }
        samples[i] = s * 0.7;
      }
      return createWavBuffer(samples);
    },
  },

  'chill-lofi': {
    name: 'Chill Lo-Fi',
    artist: 'Built-in',
    genre: 'ambient',
    mood: 'chill',
    generate() {
      const bpm = 85;
      const beatLen = 60 / bpm;
      const samples = new Float32Array(SAMPLE_RATE * DURATION);
      for (let i = 0; i < samples.length; i++) {
        const t = i / SAMPLE_RATE;
        const beat = t / beatLen;
        const beatPos = t % beatLen;

        let s = 0;
        // Soft kick on 1 and 3
        if (Math.floor(beat) % 2 === 0) s += kick(beatPos) * 0.5;
        // Gentle hihat
        s += hihat(beatPos) * 0.4;
        // Warm pad
        const chords = [[261, 329, 392], [220, 277, 349], [246, 311, 370], [261, 329, 392]];
        const chord = chords[Math.floor(beat / 4) % chords.length];
        for (const freq of chord) {
          s += pad(freq, t % (beatLen * 4), beatLen * 4) * 0.4;
        }
        // Vinyl crackle
        if (Math.random() < 0.003) s += (Math.random() - 0.5) * 0.1;
        samples[i] = s * 0.6;
      }
      return createWavBuffer(samples);
    },
  },

  'trendy-pop': {
    name: 'Trendy Pop',
    artist: 'Built-in',
    genre: 'pop',
    mood: 'upbeat',
    generate() {
      const bpm = 110;
      const beatLen = 60 / bpm;
      const samples = new Float32Array(SAMPLE_RATE * DURATION);
      for (let i = 0; i < samples.length; i++) {
        const t = i / SAMPLE_RATE;
        const beat = t / beatLen;
        const beatPos = t % beatLen;

        let s = 0;
        // Four-on-the-floor kick
        s += kick(beatPos) * 0.7;
        // Clap on 2 and 4
        if (Math.floor(beat) % 2 === 1) s += snare(beatPos) * 0.5;
        // Synth arp
        const arpNotes = [523, 659, 784, 659]; // C5, E5, G5, E5
        const noteIdx = Math.floor(beat * 2) % arpNotes.length;
        const noteT = (t * 2) % (beatLen);
        s += sine(arpNotes[noteIdx], t) * envelope(noteT, 0.01, 0.05, 0.3, 0.1, beatLen * 0.4) * 0.2;
        // Bass
        const bassNotes = [131, 131, 164, 146];
        const bn = bassNotes[Math.floor(beat / 2) % bassNotes.length];
        s += bassNote(bn, beatPos, beatLen * 1.5) * 0.7;
        // Hihat pattern
        s += hihat(beatPos) * 0.5;
        s += hihat(beatPos - beatLen * 0.25) * 0.3;
        s += hihat(beatPos - beatLen * 0.75) * 0.3;

        samples[i] = s * 0.6;
      }
      return createWavBuffer(samples);
    },
  },

  'dramatic-cinematic': {
    name: 'Dramatic Cinematic',
    artist: 'Built-in',
    genre: 'other',
    mood: 'dramatic',
    generate() {
      const samples = new Float32Array(SAMPLE_RATE * DURATION);
      for (let i = 0; i < samples.length; i++) {
        const t = i / SAMPLE_RATE;
        const progress = t / DURATION;

        let s = 0;
        // Rising pad
        const baseFreq = 110 + progress * 55;
        s += pad(baseFreq, t, DURATION) * (0.3 + progress * 0.5);
        s += pad(baseFreq * 1.5, t, DURATION) * (0.2 + progress * 0.3);
        s += pad(baseFreq * 2, t, DURATION) * (0.1 + progress * 0.2);
        // Sub bass
        s += sine(baseFreq * 0.5, t) * 0.15 * (0.5 + progress);
        // Timpani hits
        if (t > 5) {
          const bpm = 60;
          const beatLen = 60 / bpm;
          const beatPos = (t - 5) % beatLen;
          if (Math.floor((t - 5) / beatLen) % 4 === 0) {
            s += kick(beatPos) * 0.8 * progress;
          }
        }
        // String-like texture
        s += sine(baseFreq * 3, t) * 0.05 * Math.sin(t * 3) * progress;

        samples[i] = s * 0.7;
      }
      return createWavBuffer(samples);
    },
  },

  'smooth-groove': {
    name: 'Smooth Groove',
    artist: 'Built-in',
    genre: 'rnb',
    mood: 'chill',
    generate() {
      const bpm = 95;
      const beatLen = 60 / bpm;
      const samples = new Float32Array(SAMPLE_RATE * DURATION);
      for (let i = 0; i < samples.length; i++) {
        const t = i / SAMPLE_RATE;
        const beat = t / beatLen;
        const beatPos = t % beatLen;
        const bar = Math.floor(beat / 4);

        let s = 0;
        // Laid-back kick
        s += kick(beatPos) * 0.6;
        if (Math.floor(beat) % 4 === 2) s += kick(beatPos - beatLen * 0.7) * 0.3;
        // Rim on 2 and 4
        if (Math.floor(beat) % 2 === 1) {
          const rimT = beatPos;
          if (rimT < 0.02) s += sine(800, rimT) * Math.exp(-rimT * 200) * 0.3;
        }
        // Smooth bass
        const bassNotes = [87, 87, 110, 98]; // F2, F2, A2, G2
        s += bassNote(bassNotes[Math.floor(beat) % 4], beatPos, beatLen * 0.9) * 0.6;
        // Rhodes-like keys
        const keyFreq = [349, 440, 523][bar % 3];
        s += sine(keyFreq, t) * 0.08 * (1 + sine(5, t) * 0.3);
        s += sine(keyFreq * 2, t) * 0.03 * Math.exp(-((t % (beatLen * 2)) * 2));
        // Gentle hihat
        s += hihat(beatPos) * 0.2;

        samples[i] = s * 0.65;
      }
      return createWavBuffer(samples);
    },
  },

  'arabic-vibes': {
    name: 'Arabic Vibes',
    artist: 'Built-in',
    genre: 'arabic',
    mood: 'inspiring',
    generate() {
      const bpm = 100;
      const beatLen = 60 / bpm;
      const samples = new Float32Array(SAMPLE_RATE * DURATION);
      for (let i = 0; i < samples.length; i++) {
        const t = i / SAMPLE_RATE;
        const beat = t / beatLen;
        const beatPos = t % beatLen;

        let s = 0;
        // Darbuka-like pattern
        const pattern = [1, 0, 0.5, 0, 1, 0, 0.3, 0.5]; // dum-tek pattern
        const patIdx = Math.floor(beat * 2) % pattern.length;
        const patT = (t * 2) % beatLen;
        if (pattern[patIdx] > 0.7) s += kick(patT) * 0.7;
        else if (pattern[patIdx] > 0) {
          if (patT < 0.03) s += sine(600, patT) * Math.exp(-patT * 100) * pattern[patIdx] * 0.5;
        }
        // Oud-like melody (Hijaz scale: C Db E F G Ab B)
        const scale = [262, 277, 330, 349, 392, 415, 494];
        const melodyPattern = [0, 2, 3, 4, 3, 2, 1, 0];
        const noteIdx = melodyPattern[Math.floor(beat) % melodyPattern.length];
        const melFreq = scale[noteIdx];
        const melT = beatPos;
        s += sine(melFreq, t) * envelope(melT, 0.02, 0.15, 0.3, 0.2, beatLen * 0.8) * 0.25;
        // Vibrato
        s += sine(melFreq * (1 + sine(6, t) * 0.01), t) * 0.08;
        // Drone
        s += sine(131, t) * 0.1;
        s += sine(196, t) * 0.06;

        samples[i] = s * 0.7;
      }
      return createWavBuffer(samples);
    },
  },
};

function getTrackIds() {
  return Object.keys(TRACKS);
}

function getTrackMeta(id) {
  const t = TRACKS[id];
  if (!t) return null;
  return { id, name: t.name, artist: t.artist, genre: t.genre, mood: t.mood, duration_seconds: DURATION };
}

function generateTrackBuffer(id) {
  const t = TRACKS[id];
  if (!t) return null;
  return t.generate();
}

module.exports = { getTrackIds, getTrackMeta, generateTrackBuffer, TRACKS };
