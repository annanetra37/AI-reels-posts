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

  'tropical-house': {
    name: 'Tropical House',
    artist: 'Built-in',
    genre: 'electronic',
    mood: 'upbeat',
    generate() {
      const bpm = 120;
      const beatLen = 60 / bpm;
      const samples = new Float32Array(SAMPLE_RATE * DURATION);
      for (let i = 0; i < samples.length; i++) {
        const t = i / SAMPLE_RATE;
        const beat = t / beatLen;
        const beatPos = t % beatLen;
        const bar = Math.floor(beat / 4);

        let s = 0;
        // Soft kick
        s += kick(beatPos) * 0.5;
        // Offbeat hihat (tropical signature)
        s += hihat(beatPos - beatLen * 0.5) * 0.4;
        // Snare on 2 and 4
        if (Math.floor(beat) % 2 === 1) s += snare(beatPos) * 0.35;
        // Plucky lead (marimba-like)
        const pluckNotes = [523, 587, 659, 784, 659, 587, 523, 440];
        const pluckFreq = pluckNotes[Math.floor(beat * 2) % pluckNotes.length];
        const pluckT = (t * 2) % beatLen;
        s += sine(pluckFreq, t) * Math.exp(-pluckT * 12) * 0.2;
        s += sine(pluckFreq * 2, t) * Math.exp(-pluckT * 18) * 0.08;
        // Warm bass
        const bassFreqs = [131, 131, 175, 165];
        s += bassNote(bassFreqs[bar % 4], beatPos, beatLen * 1.8) * 0.5;
        // Steel drum-like ping
        if (Math.floor(beat * 4) % 8 === 3) {
          const pingT = (t * 4) % beatLen;
          s += sine(1047, t) * Math.exp(-pingT * 20) * 0.1;
        }
        // Pad
        s += pad(262, t % (beatLen * 8), beatLen * 8) * 0.15;
        s += pad(392, t % (beatLen * 8), beatLen * 8) * 0.1;

        samples[i] = s * 0.65;
      }
      return createWavBuffer(samples);
    },
  },

  'dark-trap': {
    name: 'Dark Trap',
    artist: 'Built-in',
    genre: 'hiphop',
    mood: 'dramatic',
    generate() {
      const bpm = 140;
      const beatLen = 60 / bpm;
      const samples = new Float32Array(SAMPLE_RATE * DURATION);
      for (let i = 0; i < samples.length; i++) {
        const t = i / SAMPLE_RATE;
        const beat = t / beatLen;
        const beatPos = t % beatLen;
        const bar = Math.floor(beat / 4);

        let s = 0;
        // 808 kick (long sub boom)
        const kickPattern = [1, 0, 0, 0.5, 0, 0, 1, 0, 0, 0, 0.5, 0, 1, 0, 0, 0];
        const kIdx = Math.floor(beat * 4) % 16;
        if (kickPattern[kIdx] > 0) {
          const kT = (t * 4) % beatLen;
          const kFreq = 55 * Math.exp(-kT * 5) + 35;
          s += sine(kFreq, t) * Math.exp(-kT * 3) * 0.8 * kickPattern[kIdx];
        }
        // Rapid hi-hats (trap signature)
        const hhPattern = [1, 0.3, 0.5, 0.3, 1, 0.5, 0.3, 1, 0.5, 0.3, 1, 0.3, 0.5, 1, 0.3, 0.5];
        const hhIdx = Math.floor(beat * 4) % 16;
        const hhT = (t * 4) % beatLen;
        s += (Math.random() * 2 - 1) * Math.exp(-hhT * 80) * 0.2 * hhPattern[hhIdx];
        // Clap on 2 and 4
        if (Math.floor(beat) % 2 === 1) s += snare(beatPos) * 0.4;
        // Dark bell melody
        const bellNotes = [311, 370, 293, 311, 277, 311, 370, 415];
        const bellFreq = bellNotes[Math.floor(beat) % bellNotes.length];
        s += sine(bellFreq, t) * Math.exp(-(beatPos) * 6) * 0.15;
        s += sine(bellFreq * 2.01, t) * Math.exp(-(beatPos) * 10) * 0.06;
        // Dark pad
        s += pad(147, t % (beatLen * 8), beatLen * 8) * 0.2;
        s += pad(175, t % (beatLen * 8), beatLen * 8) * 0.12;

        samples[i] = s * 0.7;
      }
      return createWavBuffer(samples);
    },
  },

  'jazz-cafe': {
    name: 'Jazz Café',
    artist: 'Built-in',
    genre: 'jazz',
    mood: 'chill',
    generate() {
      const bpm = 105;
      const beatLen = 60 / bpm;
      const samples = new Float32Array(SAMPLE_RATE * DURATION);
      for (let i = 0; i < samples.length; i++) {
        const t = i / SAMPLE_RATE;
        const beat = t / beatLen;
        const beatPos = t % beatLen;
        const bar = Math.floor(beat / 4);

        let s = 0;
        // Brushed ride cymbal (continuous shimmer)
        s += (Math.random() * 2 - 1) * 0.04;
        // Ride accent on beats
        if (beatPos < 0.01) s += (Math.random() * 2 - 1) * 0.15;
        // Walking bass
        const walkBass = [
          [131, 147, 165, 156], // Cmaj walk
          [110, 131, 147, 139], // Am walk
          [147, 165, 175, 165], // Dm walk
          [131, 156, 165, 147], // G walk
        ];
        const bassLine = walkBass[bar % 4];
        const bassIdx = Math.floor(beat) % 4;
        s += bassNote(bassLine[bassIdx], beatPos, beatLen * 0.85) * 0.45;
        // Piano voicings (jazz chords)
        const chordSets = [
          [262, 330, 392, 466], // Cmaj7
          [220, 277, 330, 415], // Am7
          [293, 349, 440, 523], // Dm7
          [247, 311, 392, 466], // G7
        ];
        const chord = chordSets[bar % 4];
        const chordT = t % (beatLen * 4);
        for (let ci = 0; ci < chord.length; ci++) {
          // Rhodes-like: fundamental + slight detuned overtone
          s += sine(chord[ci], t) * 0.05 * (1 + sine(4.5, t) * 0.15) * envelope(chordT, 0.02, 0.3, 0.25, 0.5, beatLen * 3.5);
          s += sine(chord[ci] * 2.01, t) * 0.015 * Math.exp(-(chordT) * 1.5);
        }
        // Kick on 1 and 3 (soft)
        if (Math.floor(beat) % 2 === 0) s += kick(beatPos) * 0.3;

        samples[i] = s * 0.7;
      }
      return createWavBuffer(samples);
    },
  },

  'epic-motivational': {
    name: 'Epic Motivational',
    artist: 'Built-in',
    genre: 'other',
    mood: 'inspiring',
    generate() {
      const bpm = 75;
      const beatLen = 60 / bpm;
      const samples = new Float32Array(SAMPLE_RATE * DURATION);
      for (let i = 0; i < samples.length; i++) {
        const t = i / SAMPLE_RATE;
        const beat = t / beatLen;
        const beatPos = t % beatLen;
        const progress = t / DURATION;

        let s = 0;
        // Building layers based on progress
        // Piano arp
        const pianoNotes = [262, 330, 392, 523, 392, 330];
        const pianoFreq = pianoNotes[Math.floor(beat * 2) % pianoNotes.length];
        const pianoT = (t * 2) % beatLen;
        s += sine(pianoFreq, t) * Math.exp(-pianoT * 5) * 0.18 * (0.6 + progress * 0.4);
        s += sine(pianoFreq * 2, t) * Math.exp(-pianoT * 8) * 0.05;
        // String pad (builds over time)
        s += pad(196, t, DURATION) * 0.25 * progress;
        s += pad(262, t, DURATION) * 0.2 * progress;
        s += pad(330, t, DURATION) * 0.15 * progress;
        // Drums enter at 30%
        if (progress > 0.3) {
          const drumVol = Math.min(1, (progress - 0.3) / 0.2);
          s += kick(beatPos) * 0.6 * drumVol;
          if (Math.floor(beat) % 2 === 1) s += snare(beatPos) * 0.4 * drumVol;
          s += hihat(beatPos) * 0.25 * drumVol;
        }
        // Bass enters at 40%
        if (progress > 0.4) {
          const bassVol = Math.min(1, (progress - 0.4) / 0.2);
          const bassNotes2 = [98, 98, 131, 110];
          s += bassNote(bassNotes2[Math.floor(beat / 2) % 4], beatPos, beatLen * 1.5) * 0.5 * bassVol;
        }
        // Cymbal swell at transitions
        if (progress > 0.55 && progress < 0.6) {
          s += (Math.random() * 2 - 1) * (progress - 0.55) * 4 * 0.15;
        }

        samples[i] = s * 0.65;
      }
      return createWavBuffer(samples);
    },
  },

  'funky-disco': {
    name: 'Funky Disco',
    artist: 'Built-in',
    genre: 'pop',
    mood: 'energetic',
    generate() {
      const bpm = 118;
      const beatLen = 60 / bpm;
      const samples = new Float32Array(SAMPLE_RATE * DURATION);
      for (let i = 0; i < samples.length; i++) {
        const t = i / SAMPLE_RATE;
        const beat = t / beatLen;
        const beatPos = t % beatLen;
        const bar = Math.floor(beat / 4);

        let s = 0;
        // Four-on-the-floor
        s += kick(beatPos) * 0.65;
        // Open hihat on offbeat (disco signature)
        const ohT = beatPos - beatLen * 0.5;
        if (ohT > 0 && ohT < 0.15) s += (Math.random() * 2 - 1) * Math.exp(-ohT * 15) * 0.2;
        // Closed hihat on 16ths
        s += hihat(beatPos) * 0.15;
        s += hihat(beatPos - beatLen * 0.25) * 0.1;
        // Clap on 2 and 4
        if (Math.floor(beat) % 2 === 1) s += snare(beatPos) * 0.35;
        // Funky bass (octave jumps)
        const funkyBassPattern = [131, 0, 262, 0, 131, 131, 0, 262, 0, 131, 175, 0, 262, 0, 175, 0];
        const fbIdx = Math.floor(beat * 4) % 16;
        const fbFreq = funkyBassPattern[fbIdx];
        if (fbFreq > 0) {
          const fbT = (t * 4) % beatLen;
          s += sine(fbFreq, t) * envelope(fbT, 0.005, 0.05, 0.5, 0.05, beatLen * 0.2) * 0.35;
        }
        // Wah guitar stabs
        const wahFreq = 330 + Math.sin(t * 4) * 200;
        if (Math.floor(beat * 2) % 4 === 1) {
          const wahT = (t * 2) % beatLen;
          s += sine(wahFreq, t) * envelope(wahT, 0.01, 0.08, 0.3, 0.1, beatLen * 0.3) * 0.12;
          s += sine(wahFreq * 1.5, t) * envelope(wahT, 0.01, 0.08, 0.2, 0.1, beatLen * 0.3) * 0.06;
        }
        // String stabs
        if (Math.floor(beat) % 4 === 0) {
          const strT = beatPos;
          s += pad(392, strT, beatLen * 0.5) * 0.15;
          s += pad(494, strT, beatLen * 0.5) * 0.1;
          s += pad(587, strT, beatLen * 0.5) * 0.08;
        }

        samples[i] = s * 0.6;
      }
      return createWavBuffer(samples);
    },
  },

  'ambient-dream': {
    name: 'Ambient Dream',
    artist: 'Built-in',
    genre: 'ambient',
    mood: 'emotional',
    generate() {
      const samples = new Float32Array(SAMPLE_RATE * DURATION);
      for (let i = 0; i < samples.length; i++) {
        const t = i / SAMPLE_RATE;
        const progress = t / DURATION;

        let s = 0;
        // Slowly evolving pad layers
        const baseFreqs = [174, 220, 261, 329];
        for (let li = 0; li < baseFreqs.length; li++) {
          const freq = baseFreqs[li];
          // Slow LFO modulation per layer
          const lfo = Math.sin(t * (0.1 + li * 0.07)) * 0.5 + 0.5;
          s += sine(freq, t) * 0.12 * lfo;
          s += sine(freq * 2.002, t) * 0.04 * lfo; // slight detune for shimmer
          s += sine(freq * 0.998, t) * 0.04 * lfo;
        }
        // Reverse-like swell every 4 seconds
        const swellT = t % 4;
        const swellEnv = Math.pow(swellT / 4, 2);
        s += sine(523, t) * 0.06 * swellEnv;
        s += sine(659, t) * 0.04 * swellEnv;
        // Gentle sparkles
        if (Math.random() < 0.001) {
          s += sine(1047 + Math.random() * 500, t) * 0.08;
        }
        // Sub bass drone
        s += sine(55, t) * 0.08 * (0.7 + Math.sin(t * 0.2) * 0.3);
        // Fade in/out
        let vol = 1;
        if (t < 2) vol = t / 2;
        if (t > DURATION - 2) vol = (DURATION - t) / 2;

        samples[i] = s * 0.6 * vol;
      }
      return createWavBuffer(samples);
    },
  },

  'latin-reggaeton': {
    name: 'Latin Reggaeton',
    artist: 'Built-in',
    genre: 'pop',
    mood: 'energetic',
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
        // Dembow rhythm (kick pattern)
        const dembowKick = [1, 0, 0, 0.8, 0, 0, 1, 0]; // classic dembow
        const dkIdx = Math.floor(beat * 2) % 8;
        if (dembowKick[dkIdx] > 0) {
          const dkT = (t * 2) % beatLen;
          s += kick(dkT) * 0.7 * dembowKick[dkIdx];
        }
        // Snare/rim on the dembow offbeat
        const dembowSnare = [0, 0, 1, 0, 0, 1, 0, 0];
        const dsIdx = Math.floor(beat * 2) % 8;
        if (dembowSnare[dsIdx] > 0) {
          const dsT = (t * 2) % beatLen;
          s += snare(dsT) * 0.35;
        }
        // Hihat
        s += hihat(beatPos) * 0.2;
        s += hihat(beatPos - beatLen * 0.5) * 0.15;
        // Punchy bass
        const bassNotes3 = [98, 98, 117, 110]; // G2, G2, Bb2, A2
        const bn3 = bassNotes3[Math.floor(beat / 2) % 4];
        s += bassNote(bn3, beatPos, beatLen * 0.7) * 0.5;
        // Synth melody
        const melNotes = [392, 440, 466, 392, 349, 392, 440, 349];
        const melFreq2 = melNotes[Math.floor(beat) % melNotes.length];
        s += sine(melFreq2, t) * envelope(beatPos, 0.01, 0.1, 0.2, 0.15, beatLen * 0.6) * 0.15;
        // Brass stab every 2 bars
        if (bar % 2 === 0 && Math.floor(beat) % 4 === 0) {
          s += sine(349, t) * envelope(beatPos, 0.01, 0.05, 0.4, 0.1, beatLen * 0.3) * 0.12;
          s += sine(440, t) * envelope(beatPos, 0.01, 0.05, 0.4, 0.1, beatLen * 0.3) * 0.08;
        }

        samples[i] = s * 0.65;
      }
      return createWavBuffer(samples);
    },
  },

  'indie-folk': {
    name: 'Indie Folk',
    artist: 'Built-in',
    genre: 'rock',
    mood: 'emotional',
    generate() {
      const bpm = 100;
      const beatLen = 60 / bpm;
      const samples = new Float32Array(SAMPLE_RATE * DURATION);
      for (let i = 0; i < samples.length; i++) {
        const t = i / SAMPLE_RATE;
        const beat = t / beatLen;
        const beatPos = t % beatLen;
        const bar = Math.floor(beat / 4);

        let s = 0;
        // Acoustic guitar strum pattern (down-down-up-down-up)
        const strumPattern = [1, 0.3, 0, 0.6, 0, 0.4, 0.8, 0, 0.3, 0, 0.5, 0, 0.7, 0, 0.3, 0];
        const stIdx = Math.floor(beat * 4) % 16;
        if (strumPattern[stIdx] > 0) {
          const stT = (t * 4) % beatLen;
          // Chord tones
          const chords2 = [
            [165, 208, 247, 330], // E minor
            [196, 247, 294, 392], // G major
            [147, 185, 220, 294], // D major
            [131, 165, 196, 262], // C major
          ];
          const chord2 = chords2[bar % 4];
          for (const freq of chord2) {
            s += sine(freq, t) * Math.exp(-stT * 8) * 0.06 * strumPattern[stIdx];
            s += sine(freq * 2.003, t) * Math.exp(-stT * 12) * 0.02 * strumPattern[stIdx];
          }
        }
        // Fingerpick melody on top
        const pickNotes = [659, 587, 523, 494, 523, 587, 659, 784];
        const pickFreq = pickNotes[Math.floor(beat) % pickNotes.length];
        s += sine(pickFreq, t) * Math.exp(-beatPos * 6) * 0.1;
        // Soft kick on 1 and 3
        if (Math.floor(beat) % 2 === 0) s += kick(beatPos) * 0.25;
        // Tambourine on 2 and 4
        if (Math.floor(beat) % 2 === 1) {
          if (beatPos < 0.04) s += (Math.random() * 2 - 1) * Math.exp(-beatPos * 50) * 0.15;
        }
        // Simple bass
        const folkBass = [165, 165, 196, 147];
        s += bassNote(folkBass[bar % 4] * 0.5, beatPos, beatLen * 1.5) * 0.3;

        samples[i] = s * 0.7;
      }
      return createWavBuffer(samples);
    },
  },

  'future-bass': {
    name: 'Future Bass',
    artist: 'Built-in',
    genre: 'electronic',
    mood: 'upbeat',
    generate() {
      const bpm = 150;
      const beatLen = 60 / bpm;
      const samples = new Float32Array(SAMPLE_RATE * DURATION);
      for (let i = 0; i < samples.length; i++) {
        const t = i / SAMPLE_RATE;
        const beat = t / beatLen;
        const beatPos = t % beatLen;
        const bar = Math.floor(beat / 4);

        let s = 0;
        // Sidechain-like pumping (volume ducks on kick)
        const pumpEnv = Math.min(1, beatPos * 6);
        // Super saw chord (detuned saws approximated)
        const fbChords = [
          [349, 440, 523, 659], // F major
          [392, 494, 587, 784], // G major
          [330, 415, 494, 659], // E minor
          [262, 330, 392, 523], // C major
        ];
        const fbChord = fbChords[bar % 4];
        for (const freq of fbChord) {
          const saw1 = ((t * freq) % 1 - 0.5) * 2;
          const saw2 = ((t * freq * 1.005) % 1 - 0.5) * 2;
          const saw3 = ((t * freq * 0.995) % 1 - 0.5) * 2;
          s += (saw1 + saw2 + saw3) * 0.03 * pumpEnv;
        }
        // Kick
        s += kick(beatPos) * 0.6;
        // Snare on 2 and 4
        if (Math.floor(beat) % 2 === 1) s += snare(beatPos) * 0.4;
        // Fast hihat
        s += hihat(beatPos) * 0.2;
        s += hihat(beatPos - beatLen * 0.5) * 0.12;
        // Sub bass (follows chord root)
        const subFreq = fbChords[bar % 4][0] * 0.5;
        s += sine(subFreq, t) * 0.2 * pumpEnv;
        // Vocal chop (short sine bursts at high pitch)
        if (Math.floor(beat * 2) % 6 === 0) {
          const vcT = (t * 2) % beatLen;
          s += sine(880, t) * Math.exp(-vcT * 15) * 0.08;
          s += sine(1100, t) * Math.exp(-vcT * 20) * 0.04;
        }

        samples[i] = s * 0.55;
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
