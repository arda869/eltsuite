# ELT Suite's own quiz show music, composed in code so it is ours to use anywhere.
# Run:  python3 scripts/quiz-music/compose.py  (needs numpy, scipy and ffmpeg)
# Writes public/quiz-music/{lobby,question,hurry,leaderboard,podium}.mp3. Loops are cut on the bar so
# they repeat without a gap. A super admin can replace any of them in Super Admin → Sounds for everyone.
import os, subprocess, tempfile
import numpy as np
from scipy.signal import butter, lfilter

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'quiz-music')
rng = np.random.default_rng(7)


def hz(note):
    """MIDI note number to frequency."""
    return 440.0 * 2 ** ((note - 69) / 12)


def env(n, a=0.005, d=0.1, s=0.6, r=0.05, length=None):
    """ADSR envelope, n samples long; length is the held part in seconds before release."""
    a_n, d_n, r_n = int(a * SR), int(d * SR), int(r * SR)
    hold = n - r_n if length is None else min(n - r_n, int(length * SR))
    e = np.zeros(n)
    i = 0
    for k in range(min(a_n, n)):
        e[k] = k / max(1, a_n)
    i = a_n
    for k in range(i, min(i + d_n, n)):
        e[k] = 1 - (1 - s) * (k - i) / max(1, d_n)
    e[min(i + d_n, n):max(hold, 0)] = s
    if hold < n:
        start = e[hold - 1] if hold > 0 else s
        e[hold:] = start * np.linspace(1, 0, n - hold)
    return e


def lp(x, cutoff, order=2):
    b, a = butter(order, min(cutoff, SR / 2 - 100) / (SR / 2), 'low')
    return lfilter(b, a, x)


def hp(x, cutoff, order=2):
    b, a = butter(order, cutoff / (SR / 2), 'high')
    return lfilter(b, a, x)


def saw(f, n, detune=0.0):
    t = np.arange(n) / SR
    out = np.zeros(n)
    for d in (-detune, 0, detune) if detune else (0,):
        ph = (t * f * (1 + d)) % 1.0
        out += 2 * ph - 1
    return out / (3 if detune else 1)


def square(f, n, width=0.5):
    t = np.arange(n) / SR
    return np.where((t * f) % 1.0 < width, 1.0, -1.0)


def sine(f, n):
    return np.sin(2 * np.pi * f * np.arange(n) / SR)


# ---- instruments -------------------------------------------------------------------------------
def kick(n=int(0.35 * SR)):
    t = np.arange(n) / SR
    f = 50 + 110 * np.exp(-t * 30)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-t * 9) * 1.0 + rng.normal(0, 1, n) * np.exp(-t * 300) * 0.06


def snare(n=int(0.25 * SR)):
    t = np.arange(n) / SR
    noise = hp(rng.normal(0, 1, n), 1500) * np.exp(-t * 18)
    tone = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 25)
    return noise * 0.55 + tone * 0.45


def clap(n=int(0.22 * SR)):
    t = np.arange(n) / SR
    burst = np.zeros(n)
    for off in (0, 0.011, 0.022):
        k = int(off * SR)
        burst[k:] += np.exp(-np.arange(n - k) / SR * 60)
    tail = np.exp(-t * 14) * 0.6
    return hp(lp(rng.normal(0, 1, n), 5000), 900) * (burst * 0.5 + tail) * 0.6


def hat(n=int(0.06 * SR), open_=False):
    if open_:
        n = int(0.22 * SR)
    t = np.arange(n) / SR
    return hp(rng.normal(0, 1, n), 8000, 4) * np.exp(-t * (16 if open_ else 80)) * 0.22


def shaker(n=int(0.08 * SR)):
    t = np.arange(n) / SR
    e = np.minimum(t / 0.015, 1) * np.exp(-t * 40)
    return hp(rng.normal(0, 1, n), 6000) * e * 0.12


def bass(note, dur, bright=900):
    n = int(dur * SR)
    f = hz(note)
    x = saw(f, n) * 0.6 + square(f / 2, n) * 0.25 + sine(f, n) * 0.5
    return lp(x, bright) * env(n, 0.004, 0.12, 0.7, 0.03)


def pluck(note, dur, bright=3500):
    n = int(dur * SR)
    f = hz(note)
    t = np.arange(n) / SR
    x = saw(f, n, 0.004) * 0.7 + square(f * 2, n, 0.3) * 0.15
    cut = lp(x, bright) * np.exp(-t * 7)
    return cut * env(n, 0.002, 0.05, 0.9, 0.02)


def keys(note, dur):
    """Electric piano: FM-ish bell plus a sine body."""
    n = int(dur * SR)
    f = hz(note)
    t = np.arange(n) / SR
    mod = np.sin(2 * np.pi * f * 14 * t) * 1.6 * np.exp(-t * 9)
    x = np.sin(2 * np.pi * f * t + mod) * 0.6 + np.sin(2 * np.pi * f * 2 * t) * 0.12 * np.exp(-t * 3)
    return x * env(n, 0.003, 0.4, 0.45, 0.12)


def pad(note, dur):
    n = int(dur * SR)
    x = saw(hz(note), n, 0.007)
    return lp(x, 1800) * env(n, 0.25, 0.4, 0.8, 0.4) * 0.5


def lead(note, dur):
    n = int(dur * SR)
    f = hz(note)
    t = np.arange(n) / SR
    vib = 1 + 0.004 * np.sin(2 * np.pi * 5.5 * t) * np.minimum(t / 0.25, 1)
    ph = 2 * np.pi * np.cumsum(f * vib) / SR
    x = np.sign(np.sin(ph)) * 0.35 + np.sin(ph) * 0.5 + np.sin(2 * ph) * 0.15
    return lp(x, 4200) * env(n, 0.01, 0.1, 0.75, 0.06)


def brass(note, dur):
    n = int(dur * SR)
    f = hz(note)
    t = np.arange(n) / SR
    x = saw(f, n, 0.003)
    sweep = 900 + 3200 * np.minimum(t / 0.08, 1)
    # Brass "blat": a filter opening at the attack, done in blocks.
    out = np.zeros(n)
    block = 512
    for i in range(0, n, block):
        out[i:i + block] = lp(x[i:i + block], float(sweep[min(i, n - 1)]))
    return out * env(n, 0.02, 0.15, 0.8, 0.12)


def glock(note, dur):
    n = int(dur * SR)
    f = hz(note)
    t = np.arange(n) / SR
    return (np.sin(2 * np.pi * f * t) + 0.4 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t * 6)) * np.exp(-t * 4) * 0.5


# ---- arrangement helpers ------------------------------------------------------------------------
class Track:
    def __init__(self, bpm, bars, beats=4):
        self.bpm, self.beat = bpm, 60.0 / bpm
        self.n = int(round(bars * beats * self.beat * SR))
        self.bus = {k: np.zeros(self.n + SR * 3) for k in ('drums', 'bass', 'music', 'lead')}
        self.kicks = []

    def at(self, beat):
        return int(round(beat * self.beat * SR))

    def put(self, bus, beat, sound, gain=1.0):
        i = self.at(beat)
        if i >= self.n:
            return
        end = min(i + len(sound), len(self.bus[bus]))
        self.bus[bus][i:end] += sound[:end - i] * gain

    def kick(self, beat, gain=1.0):
        self.put('drums', beat, kick(), gain)
        self.kicks.append(self.at(beat))

    def mix(self, levels, duck=0.35, loop=True, verb=0.18):
        total = np.zeros_like(self.bus['drums'])
        # Sidechain: the music dips a little on every kick, for that pumping feel.
        side = np.ones_like(total)
        for k in self.kicks:
            length = int(0.18 * SR)
            side[k:k + length] = np.minimum(side[k:k + length], 1 - duck * np.exp(-np.arange(min(length, len(side) - k)) / SR * 14))
        for name, x in self.bus.items():
            g = levels.get(name, 1.0)
            total += x * g * (side if name in ('music', 'lead', 'bass') else 1)
        total += reverb(self.bus['music'] * levels.get('music', 1) + self.bus['lead'] * levels.get('lead', 1)) * verb
        if loop:
            # Fold what rings past the end back to the start, so the loop is seamless.
            body, tail = total[:self.n].copy(), total[self.n:]
            body[:len(tail)] += tail[:self.n]
            return body
        return total


_IR = None


def reverb(x):
    """A small room: convolution with 1.1 s of decaying, darkened noise."""
    global _IR
    from scipy.signal import fftconvolve
    if _IR is None:
        n = int(1.1 * SR)
        t = np.arange(n) / SR
        _IR = lp(rng.normal(0, 1, n), 5000) * np.exp(-t * 5.5)
        _IR[:int(0.012 * SR)] = 0  # pre-delay
        _IR /= np.sqrt(np.sum(_IR ** 2))
    return hp(fftconvolve(x, _IR)[:len(x)], 250) * 0.6


def master(x, peak=0.89):
    x = hp(x, 30)
    x = np.tanh(x / np.max(np.abs(x)) * 1.15) / np.tanh(1.15)
    return x / np.max(np.abs(x)) * peak


def stereo(mono, width=0.0):
    return np.stack([mono, mono], axis=1)


def save(name, x):
    os.makedirs(OUT, exist_ok=True)
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
        wav = f.name
    from scipy.io import wavfile
    wavfile.write(wav, SR, (np.clip(x, -1, 1) * 32767).astype(np.int16))
    path = os.path.join(OUT, name + '.mp3')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-ac', '1', '-codec:a', 'libmp3lame', '-b:a', '96k', path], check=True)
    os.unlink(wav)
    print(name, round(len(x) / SR, 1), 's', os.path.getsize(path) // 1024, 'KB')


def chord(root, quality):
    return [root + i for i in {'maj': (0, 4, 7), 'min': (0, 3, 7), 'maj7': (0, 4, 7, 11), 'min7': (0, 3, 7, 10), 'dom7': (0, 4, 7, 10), 'sus': (0, 5, 7)}[quality]]


# ---- 1. Lobby: bright, bouncy, waiting-room fun. F major, 118 bpm, 16 bars --------------------
def lobby():
    t = Track(118, 16)
    prog = [(65, 'maj7'), (62, 'min7'), (58, 'maj7'), (60, 'dom7')]  # Fmaj7 Dm7 Bbmaj7 C7
    for bar in range(16):
        root, q = prog[bar % 4]
        b0 = bar * 4
        for k in (0, 2):
            t.kick(b0 + k)
        if bar % 4 == 3:
            t.kick(b0 + 3.5, 0.7)
        for k in (1, 3):
            t.put('drums', b0 + k, clap(), 0.8)
        for k in range(8):
            t.put('drums', b0 + k * 0.5, hat(open_=(k % 2 == 1 and bar % 2 == 1)), 0.55 if k % 2 else 0.35)
        for k in range(16):
            t.put('drums', b0 + k * 0.25, shaker(), 0.25 + 0.15 * (k % 2))
        # Bass: root, octave bounce, a walk up to the next chord.
        nxt = prog[(bar + 1) % 4][0]
        pattern = [(0, root - 24, 0.4), (0.75, root - 12, 0.2), (1.5, root - 24, 0.4), (2, root - 24, 0.4), (2.75, root - 17, 0.2), (3.5, nxt - 25, 0.4)]
        for b, note, d in pattern:
            t.put('bass', b0 + b, bass(note, d), 0.9)
        # Keys: off-beat stabs.
        for b in (0.5, 1.5, 2.5, 3.25):
            for note in chord(root, q):
                t.put('music', b0 + b, keys(note, 0.3), 0.18)
        if bar >= 4:
            for note in chord(root - 12, q)[:3]:
                t.put('music', b0, pad(note + 12, 3.6 * t.beat), 0.16)
    # Melody: a cheerful hook, played in bars 8–15.
    hook = [(0, 72, .5), (.5, 74, .5), (1, 76, .75), (2, 72, .5), (2.5, 69, 1), (4, 74, .5), (4.5, 72, .5), (5, 69, .75), (6, 67, .5), (6.5, 65, 1),
            (8, 70, .5), (8.5, 72, .5), (9, 74, .75), (10, 77, .5), (10.5, 76, 1), (12, 76, .5), (12.5, 74, .5), (13, 72, .5), (13.5, 70, .5), (14, 67, 1.5)]
    for rep in (32, 48):
        for b, note, d in hook:
            t.put('lead', rep + b, lead(note, d * t.beat), 0.32)
            t.put('lead', rep + b, glock(note + 12, 0.6), 0.09)
    save('lobby', master(t.mix({'drums': 0.85, 'bass': 0.8, 'music': 0.9, 'lead': 0.8})))


# ---- 2. Question: tense, ticking, driving. A minor, 128 bpm, 8 bars ----------------------------
def question(name='question', hurry=False):
    bpm = 150 if hurry else 128
    bars = 4 if hurry else 8
    t = Track(bpm, bars)
    prog = [(57, 'min'), (53, 'maj'), (55, 'maj'), (52, 'maj')]  # Am F G E
    for bar in range(bars):
        root, q = prog[bar % 4]
        b0 = bar * 4
        for k in range(4):
            t.kick(b0 + k, 0.9)
        for k in (1, 3):
            t.put('drums', b0 + k, snare(), 0.5 if not hurry else 0.65)
        for k in range(16):
            t.put('drums', b0 + k * 0.25, hat(), 0.45 if k % 2 else 0.22)
        if hurry:
            for k in range(8):
                t.put('drums', b0 + 3 + k * 0.125, snare(), 0.12 + k * 0.03)
        # Pulsing eighth-note bass.
        for k in range(8):
            t.put('bass', b0 + k * 0.5, bass(root - 24 + (12 if k % 4 == 3 else 0), 0.22, 700), 0.85)
        # Ticking arpeggio, like a clock with a pulse.
        notes = chord(root, q) + [chord(root, q)[0] + 12]
        for k in range(16):
            t.put('music', b0 + k * 0.25, pluck(notes[k % 4] + 12, 0.2, 2600 + 1500 * (bar / bars)), 0.22)
        for note in chord(root - 12, q):
            t.put('music', b0, pad(note, 4 * t.beat * 0.98), 0.14)
    # A rising "stab" every two bars keeps the tension up.
    for bar in range(0, bars, 2):
        for note in (69, 72, 76):
            t.put('lead', bar * 4 + 3.5, brass(note, 0.25), 0.18)
    save(name, master(t.mix({'drums': 0.9, 'bass': 0.85, 'music': 0.85, 'lead': 0.7}, duck=0.3, verb=0.12)))


# ---- 3. Leaderboard: proud, swaggering. C major, 104 bpm, 8 bars -------------------------------
def leaderboard():
    t = Track(104, 8)
    prog = [(60, 'maj'), (67, 'maj'), (69, 'min'), (65, 'maj')]  # C G Am F
    for bar in range(8):
        root, q = prog[bar % 4]
        b0 = bar * 4
        t.kick(b0)
        t.kick(b0 + 1.5, 0.8)
        t.kick(b0 + 2)
        for k in (1, 3):
            t.put('drums', b0 + k, snare(), 0.55)
            t.put('drums', b0 + k, clap(), 0.4)
        for k in range(8):
            t.put('drums', b0 + k * 0.5, hat(), 0.4)
        for b, d in ((0, 0.6), (1.5, 0.3), (2, 0.6), (3, 0.4)):
            t.put('bass', b0 + b, bass(root - 24, d), 0.9)
        for note in chord(root, q):
            t.put('music', b0, brass(note, 0.45), 0.15)
            t.put('music', b0 + 2.5, brass(note, 0.3), 0.12)
            t.put('music', b0, pad(note - 12, 3.8 * t.beat), 0.12)
    tune = [(0, 72, 1), (1, 76, .5), (1.5, 79, 1.5), (4, 79, 1), (5, 81, .5), (5.5, 79, .5), (6, 76, 2),
            (8, 76, 1), (9, 77, .5), (9.5, 76, .5), (10, 74, 1), (11, 72, 1), (12, 72, .5), (12.5, 74, .5), (13, 72, 3)]
    for rep in (0, 16):
        for b, note, d in tune:
            t.put('lead', rep + b, lead(note, d * t.beat), 0.3)
            t.put('lead', rep + b, glock(note + 12, 0.5), 0.07)
    save('leaderboard', master(t.mix({'drums': 0.85, 'bass': 0.8, 'music': 0.9, 'lead': 0.85})))


# ---- 4. Podium: a drumroll, then a fanfare that rings out. Not a loop ---------------------------
def podium():
    roll = 4.0
    t = Track(100, 8)
    beat = t.beat
    rolls = int(roll / 0.045)
    for k in range(rolls):
        g = 0.12 + 0.55 * (k / rolls) ** 1.6
        i = int(k * 0.045 * SR)
        s = snare()
        t.bus['drums'][i:i + len(s)] += s * g
    start = roll / beat  # in beats
    t.kick(start, 1.2)
    t.put('drums', start, hat(open_=True), 0.7)
    fan = [(0, (60, 64, 67, 72), 0.6), (0.75, (60, 64, 67, 72), 0.25), (1, (62, 65, 69, 74), 0.25), (1.25, (64, 67, 72, 76), 0.25),
           (1.5, (65, 69, 72, 77), 1.0), (2.75, (67, 71, 74, 79), 0.25), (3, (72, 76, 79, 84), 4.5)]
    for b, notes, d in fan:
        for note in notes:
            t.put('lead', start + b, brass(note, d * beat), 0.16)
            t.put('music', start + b, pad(note - 12, d * beat + 0.4), 0.08)
        t.put('bass', start + b, bass(notes[0] - 24, d * beat), 0.8)
        t.kick(start + b, 0.6)
    for k, note in enumerate((84, 88, 91, 96, 91, 88, 84)):
        t.put('music', start + 3 + k * 0.125, glock(note, 0.8), 0.18)
    t.put('drums', start + 3, hat(open_=True), 0.6)
    for k in range(12):
        t.put('drums', start + 3 + k * 0.33, snare(), 0.2 * (1 - k / 12))
    mixed = t.mix({'drums': 0.9, 'bass': 0.8, 'music': 0.9, 'lead': 0.9}, duck=0.1, loop=False, verb=0.3)
    end = int((roll + 9 * beat) * SR)
    mixed = mixed[:end]
    mixed[-int(1.2 * SR):] *= np.linspace(1, 0, int(1.2 * SR))
    save('podium', master(mixed))


if __name__ == '__main__':
    lobby()
    question()
    question('hurry', hurry=True)
    leaderboard()
    podium()
