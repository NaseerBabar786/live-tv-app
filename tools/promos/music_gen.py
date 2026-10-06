# Original energetic track + sound effects for the Cable TV video ads (config-driven).
# usage: python3 music_gen.py out.wav config.json
# Everything is synthesised here from scratch (no samples), so it is ours to use.
import numpy as np, wave, sys

SR = 44100
import json as _j
_C=_j.load(open(sys.argv[2]))
BPM=_C.get('bpm',128)
NBARS=_C['nbars']
DUR=_C['dur']
BEAT = 60 / BPM
BAR = 4 * BEAT
N = int(DUR * SR) + SR
rng = np.random.default_rng(_C.get('seed',7))
L = np.zeros(N); R = np.zeros(N)

def s(t): return int(round(t * SR))

def add(sig, t, gain=1.0, pan=0.0):
    i = s(t)
    if i >= N: return
    sig = sig[: N - i]
    if sig.ndim == 2:
        L[i:i+len(sig)] += sig[:, 0] * gain; R[i:i+len(sig)] += sig[:, 1] * gain
    else:
        L[i:i+len(sig)] += sig * gain * (1 - max(pan, 0))
        R[i:i+len(sig)] += sig * gain * (1 + min(pan, 0))

def lp_kernel(fc, taps=255):
    n = np.arange(taps) - (taps - 1) / 2
    h = np.sinc(2 * fc / SR * n) * np.hamming(taps)
    return h / h.sum()

def lowpass(x, fc, taps=255): return np.convolve(x, lp_kernel(fc, taps), 'same')
def highpass(x, fc, taps=255): return x - lowpass(x, fc, taps)

def env(n, a=0.002, d=0.2, sus=0.0, rel=None):
    t = np.arange(n) / SR
    e = np.minimum(t / a, 1.0) if a > 0 else np.ones(n)
    return e * (sus + (1 - sus) * np.exp(-t / d))

def note_hz(m): return 440.0 * 2 ** ((m - 69) / 12)

def saw(f, n, phase=0.0):
    t = np.arange(n) / SR
    return 2 * ((t * f + phase) % 1.0) - 1

# ---------- instruments ----------
def kick():
    n = s(0.45); t = np.arange(n) / SR
    f = 45 + 110 * np.exp(-t / 0.035)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t / 0.22)
    click = rng.standard_normal(n) * np.exp(-t / 0.004) * 0.35
    return np.tanh(1.6 * (body + click))

def clap():
    n = s(0.35); t = np.arange(n) / SR
    nz = highpass(rng.standard_normal(n), 900, 101)
    e = np.zeros(n)
    for k, o in enumerate([0, 0.011, 0.022]):
        i = s(o); e[i:] += np.exp(-(t[: n - i]) / (0.012 if k < 2 else 0.12))
    return lowpass(nz * e, 7000, 61) * 0.8

def hat(open_=False):
    n = s(0.25 if open_ else 0.06); t = np.arange(n) / SR
    nz = highpass(rng.standard_normal(n), 7000, 61)
    return nz * np.exp(-t / (0.08 if open_ else 0.015)) * 0.5

def snare_hit():
    n = s(0.2); t = np.arange(n) / SR
    tone = np.sin(2 * np.pi * 190 * t) * np.exp(-t / 0.05)
    nz = highpass(rng.standard_normal(n), 1500, 61) * np.exp(-t / 0.07)
    return 0.5 * tone + 0.7 * nz

def supersaw(m, n, voices=7, detune=0.18):
    out = np.zeros(n)
    for v in range(voices):
        cents = (v - (voices - 1) / 2) / ((voices - 1) / 2) * detune * 100
        out += saw(note_hz(m) * 2 ** (cents / 1200), n, rng.random())
    return out / voices

def stereo_supersaw(m, n):
    a = supersaw(m, n); b = supersaw(m, n)
    return np.stack([a, b], 1)

def impact():
    n = s(2.5); t = np.arange(n) / SR
    f = 30 + 70 * np.exp(-t / 0.15)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.7)
    nz = lowpass(rng.standard_normal(n), 3000, 101) * np.exp(-t / 0.5) * 0.45
    crash = highpass(rng.standard_normal(n), 5000, 61) * np.exp(-t / 0.9) * 0.25
    return np.tanh(1.3 * (boom + nz + crash))

def sweep_noise(n, f0, f1, block=1024):
    """noise whose band moves from f0 to f1 (block FFT filter)"""
    x = rng.standard_normal(n + block)
    out = np.zeros(n + block)
    win = np.hanning(2 * block)
    for i in range(0, n, block):
        seg = x[i:i + 2 * block]
        if len(seg) < 2 * block: break
        frac = i / n
        fc = f0 * (f1 / f0) ** frac
        F = np.fft.rfft(seg * win)
        fr = np.fft.rfftfreq(2 * block, 1 / SR)
        F *= np.exp(-((np.log2(fr + 1) - np.log2(fc)) ** 2) / 0.6)
        out[i:i + 2 * block] += np.fft.irfft(F)
    return out[:n] / (np.abs(out[:n]).max() + 1e-9)

def riser(length):
    n = s(length); t = np.arange(n) / SR
    nz = sweep_noise(n, 300, 9000) * (t / length) ** 2
    f = 200 * (8 ** (t / length))
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * (t / length) ** 3 * 0.25
    return nz * 0.6 + tone

def whoosh(length=0.6, up=True):
    n = s(length); t = np.arange(n) / SR
    nz = sweep_noise(n, 400 if up else 6000, 6000 if up else 400)
    e = np.sin(np.pi * t / length) ** 2
    return nz * e

def stamp():
    """short punchy hit for text slams"""
    n = s(0.5); t = np.arange(n) / SR
    f = 60 + 160 * np.exp(-t / 0.02)
    b = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.12)
    nz = highpass(rng.standard_normal(n), 2000, 61) * np.exp(-t / 0.04) * 0.5
    return np.tanh(2 * (b + nz)) * 0.8

def blip(m=84):
    n = s(0.12); t = np.arange(n) / SR
    return np.sign(np.sin(2 * np.pi * note_hz(m) * t)) * np.exp(-t / 0.03) * 0.25

def rev_cymbal(length=1.0):
    c = highpass(rng.standard_normal(s(length)), 4000, 61) * np.exp(-np.arange(s(length)) / SR / 0.35)
    return c[::-1] * 0.35

# ---------- arrangement (from config) ----------
import json
CFG = json.load(open(sys.argv[2]))
def bars(x): return set(x) if isinstance(x, list) and (not x or isinstance(x[0], int)) else set().union(*[set(range(p, q)) for p, q in x])
prog = [tuple(p) for p in CFG['prog']]
FULL = bars(CFG['full']); FILL = set(CFG['fill']); INTRO = set(range(0, CFG['intro']))
DROPS = CFG['drops']; ARP = bars(CFG['arp']); FINAL = CFG['final']; INTRO_KICK = CFG['intro_kick']
PAT = CFG.get('pat', [0, 1, 2, 3, 2, 1, 0, 2, 0, 1, 2, 3, 2, 3, 1, 2])
K = kick(); C = clap(); H = hat(); HO = hat(True); SN = snare_hit()
drums = np.zeros((N, 2)); bassbus = np.zeros((N, 2)); synth = np.zeros((N, 2))
duck = np.ones(N)

def put(buf, sig, t, g=1.0, pan=0.0):
    i = s(t)
    if i >= N: return
    sig = sig[: N - i]
    if sig.ndim == 2:
        buf[i:i+len(sig)] += sig * g
    else:
        buf[i:i+len(sig), 0] += sig * g * (1 - max(pan, 0))
        buf[i:i+len(sig), 1] += sig * g * (1 + min(pan, 0))

for bar in range(NBARS):
    t0 = bar * BAR
    root, chord = prog[bar % 4]
    full = bar in FULL
    final = bar == FINAL
    # drums
    for b in range(4):
        tb = t0 + b * BEAT
        if full or (bar in INTRO and bar >= INTRO_KICK) or (bar in FILL and b < 2):
            put(drums, K, tb, 0.9)
            i = s(tb); m = s(0.28)
            if i + m < N:
                duck[i:i+m] = np.minimum(duck[i:i+m], 0.25 + 0.75 * (np.arange(m) / m) ** 0.6)
        if full and b in (1, 3): put(drums, C, tb, 0.55)
        if full or bar in INTRO:
            put(drums, HO if full else H, tb + BEAT / 2, 0.30 if full else 0.18, 0.3)
        if full:
            for k in (1, 3): put(drums, H, tb + k * BEAT / 4, 0.12, -0.3)
    if bar in FILL or bar == max(INTRO):
        # snare roll speeding up
        steps = [0, .5, 1, 1.5, 2, 2.25, 2.5, 2.75, 3, 3.125, 3.25, 3.375, 3.5, 3.625, 3.75, 3.875]
        for k, st in enumerate(steps):
            put(drums, SN, t0 + st * BEAT, 0.15 + 0.35 * k / len(steps))
    if final:
        put(drums, K, t0, 1.0); put(drums, C, t0, 0.6)
    # bass: offbeat pumping 8ths in full sections
    if full:
        for e8 in range(8):
            tb = t0 + e8 * BEAT / 2
            n = s(BEAT / 2 * 0.9)
            m = root - 12 + (12 if e8 % 2 else 0)
            x = saw(note_hz(m), n) + 0.5 * np.sin(2 * np.pi * note_hz(m - 12) * np.arange(n) / SR)
            x = lowpass(x, 900, 101) * env(n, 0.003, 0.12, 0.4)
            put(bassbus, np.tanh(1.5 * x), tb, 0.55)
    elif bar in FILL:
        n = s(BAR); x = lowpass(saw(note_hz(root - 12), n), 400, 101)
        put(bassbus, x * np.linspace(0.6, 0.0, n), t0, 0.4)
    # chords
    if final:
        n = s(4.0)
        st = sum(stereo_supersaw(m, n) for m in [57, 64, 69, 72, 76]) / 4
        e = env(n, 0.005, 1.4)
        st = np.stack([lowpass(st[:, 0], 6000, 101), lowpass(st[:, 1], 6000, 101)], 1) * e[:, None]
        put(synth, st, t0, 0.55)
    else:
        n = s(BAR)
        st = sum(stereo_supersaw(m, n) for m in chord) / 3
        cutoff = 5500 if full else (900 + 2500 * (bar / 3) if bar in INTRO else 3000)
        st = np.stack([lowpass(st[:, 0], cutoff, 101), lowpass(st[:, 1], cutoff, 101)], 1)
        if full:  # stabs on offbeats for energy
            gate = np.zeros(n)
            for e8 in range(8):
                i = s(e8 * BEAT / 2 + (BEAT / 4 if e8 % 2 == 0 else 0)); m2 = s(BEAT / 4)
                gate[i:i+m2] = env(min(m2, n - i), 0.002, 0.09, 0.2)
            st = st * (0.35 + 0.65 * gate)[:, None]
        else:
            st = st * np.minimum(np.arange(n) / s(0.05), 1)[:, None]
        put(synth, st, t0, 0.42 if full else 0.32)
    # arp lead
    if bar in ARP:
        notes = chord + [chord[0] + 12]
        pat = PAT
        for k in range(16):
            n = s(BEAT / 4 * 0.85)
            m = notes[pat[k]] + 12
            x = 0.6 * np.sign(np.sin(2 * np.pi * note_hz(m) * np.arange(n) / SR)) + 0.4 * saw(note_hz(m) * 1.004, n)
            x = lowpass(x, 5000, 61) * env(n, 0.002, 0.06, 0.3)
            put(synth, x, t0 + k * BEAT / 4, 0.12, 0.45 if k % 2 else -0.45)
    # echo of arp (simple delay)
# ---------- sfx (from config, times in bars) ----------
sfx = np.zeros((N, 2))
for d in DROPS: put(sfx, impact(), d * BAR, 0.9)
put(sfx, impact(), FINAL * BAR, 1.0)
for st_, ln in CFG['risers']: put(sfx, riser(ln * BAR), st_ * BAR, 0.5)
for d in DROPS: put(sfx, rev_cymbal(1.0), d * BAR - 1.0, 0.8)
for c in CFG['cuts']: put(sfx, whoosh(0.5), c * BAR - 0.3, 0.35)
for t_, g_ in CFG['stamps']: put(sfx, stamp(), t_ * BAR, g_)
for k, t_ in enumerate(CFG['blips']): put(sfx, blip(81 + (k % 4) * 3), t_ * BAR, 0.6)
# ---------- mix ----------
synth *= (0.35 + 0.65 * duck)[:, None]
bassbus *= (0.2 + 0.8 * duck)[:, None]
# simple stereo delay on synth
dl = s(BEAT * 0.75)
syn2 = synth.copy(); syn2[dl:, 0] += synth[:-dl, 1] * 0.25; syn2[dl:, 1] += synth[:-dl, 0] * 0.25
mix = drums * 0.9 + bassbus + syn2 + sfx
mix = mix[: s(DUR)]
# fade last 0.6 s
f = s(0.6); mix[-f:] *= np.linspace(1, 0, f)[:, None]
mix = np.tanh(mix / (np.abs(mix).max() * 0.8)) * 0.9  # soft limiter / loudness
mix /= np.abs(mix).max() / 0.95
pcm = (mix * 32767).astype('<i2')
with wave.open(sys.argv[1] if len(sys.argv) > 1 else 'music.wav', 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print('ok', len(mix) / SR)
