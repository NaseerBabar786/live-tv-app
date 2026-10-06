# Original cinematic trailer music for the Bazaar TV show promos: pulsing low strings, deep hits on
# the cuts, a riser into the end card and a final boom. Synthesised here from scratch (no samples),
# so it is ours to use.
# usage: python3 cinematic.py out.wav seconds hits.json   (hits.json = [seconds of each cut], optional)
import json, sys, wave
import numpy as np

SR = 44100
out, DUR = sys.argv[1], float(sys.argv[2])
HITS = json.load(open(sys.argv[3])) if len(sys.argv) > 3 else []
BPM = 120
BEAT = 60 / BPM
N = int(DUR * SR) + SR
rng = np.random.default_rng(11)
mix = np.zeros((N, 2))
s = lambda t: int(round(t * SR))


def put(sig, t, g=1.0, pan=0.0):
    i = s(t)
    if i >= N:
        return
    sig = sig[: N - i]
    if sig.ndim == 1:
        sig = np.stack([sig * (1 - max(pan, 0)), sig * (1 + min(pan, 0))], 1)
    mix[i:i + len(sig)] += sig * g


def lowpass(x, fc, taps=201):
    n = np.arange(taps) - (taps - 1) / 2
    h = np.sinc(2 * fc / SR * n) * np.hamming(taps)
    return np.convolve(x, h / h.sum(), "same")


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def saw(f, n, ph=0.0):
    t = np.arange(n) / SR
    return 2 * ((t * f + ph) % 1.0) - 1


def strings(m, n, bright=1800):
    x = sum(saw(hz(m) * 2 ** (c / 1200), n, rng.random()) for c in (-9, -3, 4, 10)) / 4
    return lowpass(x, bright)


def boom(length=2.4, f0=38):
    n = s(length); t = np.arange(n) / SR
    f = f0 + 80 * np.exp(-t / 0.12)
    b = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.8)
    nz = lowpass(rng.standard_normal(n), 1800) * np.exp(-t / 0.35) * 0.5
    return np.tanh(1.4 * (b + nz))


def hit():
    n = s(1.2); t = np.arange(n) / SR
    f = 55 + 120 * np.exp(-t / 0.03)
    b = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.3)
    metal = lowpass(rng.standard_normal(n), 6000) * np.exp(-t / 0.15) * 0.25
    return np.tanh(1.8 * (b + metal)) * 0.8


def riser(length):
    n = s(length); t = np.arange(n) / SR
    f = 120 * 10 ** (t / length)
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * (t / length) ** 2.5 * 0.35
    nz = (rng.standard_normal(n) - lowpass(rng.standard_normal(n), 2000)) * (t / length) ** 3 * 0.35
    return tone + nz


def tick():
    n = s(0.08); t = np.arange(n) / SR
    return (rng.standard_normal(n) - lowpass(rng.standard_normal(n), 3000)) * np.exp(-t / 0.012) * 0.4


# A minor key: Am, F, C, G, one chord every 2 bars.
PROG = [(45, [57, 60, 64]), (41, [57, 60, 65]), (48, [55, 60, 64]), (43, [55, 59, 62])]
END = DUR - 6.0  # the end card
t = 0.0
k = 0
while t < END:
    root, chord = PROG[(k // 2) % 4]
    n = s(4 * BEAT)
    # Pulsing low strings in 8ths, louder as it goes.
    for e in range(8):
        m = s(BEAT / 2 * 0.92)
        x = strings(root, m, 700 + 900 * t / END) * np.exp(-np.arange(m) / SR / 0.18)
        put(x, t + e * BEAT / 2, 0.28 + 0.2 * t / END)
    pad = sum(strings(c, n, 2500) for c in chord) / 3
    pad *= np.minimum(np.arange(n) / s(0.3), 1)
    put(pad, t, 0.16, 0.0)
    for b in range(4):
        put(tick(), t + b * BEAT + BEAT / 2, 0.25, 0.4 if b % 2 else -0.4)
    t += 4 * BEAT
    k += 1
for h in HITS:
    if 0.3 < h < END:
        put(hit(), h, 0.55)
put(riser(2.5), END - 2.5, 0.7)
put(boom(), 0.0, 0.6)
put(boom(3.5, 32), END, 1.0)
# End card: a long held chord that fades.
n = s(6.0)
held = sum(strings(c, n, 3000) for c in (57, 64, 69, 72)) / 4 * np.exp(-np.arange(n) / SR / 2.5)
put(held, END, 0.4)
put(strings(33, n, 300) * np.exp(-np.arange(n) / SR / 2.0), END, 0.5)

mix = mix[: s(DUR)]
f = s(0.8)
mix[-f:] *= np.linspace(1, 0, f)[:, None]
mix = np.tanh(mix / (np.abs(mix).max() * 0.8)) * 0.9
mix /= np.abs(mix).max() / 0.95
with wave.open(out, "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((mix * 32767).astype("<i2").tobytes())
print("ok", len(mix) / SR)
