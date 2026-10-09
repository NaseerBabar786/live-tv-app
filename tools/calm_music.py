"""
Calm background music for Spark TV's short clips (idents, our ads), made here from scratch, so it is ours:
a soft pad with a slow harp-like arpeggio over a gentle chord turn, and a little room echo. The owner found
the old buzzing three-note tone "really horrible" (2026-10-07) and asked for calm music instead.

calm(seconds, path, key=0) writes a 44.1 kHz stereo WAV. Needs numpy.
"""
import wave

import numpy as np

RATE = 44100
# Cmaj9 - Am7 - Fmaj7 - G6sus, as MIDI notes (pad voicing); the arpeggio walks the same notes an octave up.
CHORDS = [(48, 55, 64, 71, 74), (45, 52, 60, 67, 72), (41, 48, 57, 64, 67), (43, 50, 59, 62, 64)]


def hz(note):
    return 440.0 * 2 ** ((note - 69) / 12)


def pad(n, f, t):
    # A few soft harmonics with a slow swell and a hint of chorus, no sharp edges.
    out = np.zeros(n)
    for k, amp in ((1, 1.0), (2, 0.25), (3, 0.08)):
        for detune in (-0.0015, 0.0015):
            out += amp * np.sin(2 * np.pi * f * k * (1 + detune) * t + 0.3 * np.sin(2 * np.pi * 0.2 * t))
    return out / 6


def pluck(n, f, t):
    env = np.exp(-t * 2.2) * np.minimum(1, t / 0.008)
    return env * (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * 2 * f * t) + 0.08 * np.sin(2 * np.pi * 3 * f * t))


def calm(seconds, path, key=0):
    n = int(seconds * RATE)
    left, right = np.zeros(n), np.zeros(n)
    bar = 2.4  # seconds per chord (a slow 100 bpm, four beats)
    for b in range(int(np.ceil(seconds / bar))):
        chord = [c + key for c in CHORDS[b % len(CHORDS)]]
        s = int(b * bar * RATE)
        length = min(n - s, int((bar + 1.2) * RATE))
        if length <= 0:
            break
        t = np.arange(length) / RATE
        swell = np.minimum(1, t / 0.9) * np.clip((bar + 1.2 - t) / 1.2, 0, 1)
        voice = sum(pad(length, hz(c), t) for c in chord) * swell * 0.18
        left[s:s + length] += voice
        right[s:s + length] += voice
        # Arpeggio: eighth notes, up and back, panned gently left and right.
        notes = [c + 12 for c in chord[1:]]
        notes = notes + notes[-2:0:-1]
        for i in range(8):
            ns = s + int(i * bar / 8 * RATE)
            nl = min(n - ns, int(1.8 * RATE))
            if nl <= 0:
                continue
            tt = np.arange(nl) / RATE
            p = pluck(nl, hz(notes[i % len(notes)]), tt) * 0.16
            pan = 0.5 + 0.25 * np.sin(i)
            left[ns:ns + nl] += p * (1 - pan) * 2 * 0.7
            right[ns:ns + nl] += p * pan * 2 * 0.7
    # A small room: a few soft echoes, slightly different on each side.
    for delay, gain in ((0.113, 0.28), (0.197, 0.2), (0.293, 0.14), (0.41, 0.09)):
        d = int(delay * RATE)
        left[d:] += gain * right[:-d]
        right[d:] += gain * left[:-d]
    # A soft high cut (one-pole) to keep it warm.
    for ch in (left, right):
        a = 0.35
        for i in range(1, n):
            ch[i] = ch[i - 1] + a * (ch[i] - ch[i - 1])
    stereo = np.stack([left, right], axis=1)
    fade = np.ones(n)
    fi, fo = int(0.8 * RATE), int(1.5 * RATE)
    fade[:fi] = np.linspace(0, 1, fi)
    fade[-fo:] = np.linspace(1, 0, fo) ** 1.5
    stereo *= fade[:, None]
    # Gentle level (about -23 LUFS, like the clips before): peaks near -12 dBFS.
    stereo *= 0.25 / max(1e-9, np.abs(stereo).max())
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes((stereo * 32767).astype("<i2").tobytes())


if __name__ == "__main__":
    import sys
    calm(float(sys.argv[1]) if len(sys.argv) > 1 else 10, sys.argv[2] if len(sys.argv) > 2 else "calm.wav")
