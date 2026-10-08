"""Free-licence music for everything we make (promos, ads, news, stories).

The owner asked (2026-10-07) to replace the old home-made synth sound everywhere with good music.
These are real recordings from Wikimedia Commons, licence CC BY 3.0 (credit the artist on screen or in
the credits). Copies already sit on our GitHub pre-release `sur-media` (made by tools/build_sur.py for
Sur Sukoon), so tools fetch them from there and cache the audio.

Tempo and first downbeat were measured once (tools/music/library.py --measure) so beds can be cut on
the bar and cut videos stay in time with the music.

    from library import bed, credit
    x = bed("energetic", 30.0)          # stereo float32 array at 44.1 kHz, fades in and out
    print(credit("energetic"))          # 'Music: "Upbeat Sitar" by Antti Luode, CC BY 3.0'
"""
import os, subprocess, sys
import numpy as np

SR = 44100
REL = "https://github.com/NaseerBabar786/live-tv-app/releases/download/sur-media/"
CACHE = os.environ.get("MUSIC_CACHE", os.path.join(os.path.expanduser("~"), ".cache", "cabletv-music"))

# bpm, downbeat = time of the first bar line (s), best = [start bar, end bar) of the liveliest part
TRACKS = {
    "upbeat-sitar": dict(file="sur-upbeat-sitar-antti-luode.mp4", title="Upbeat Sitar", artist="Antti Luode",
                         licence="CC BY 3.0", bpm=130.0, downbeat=1.83, best=(9, 40), best2=(64, 90)),
    "psychedelic-crater": dict(file="sur-psychedelic-crater-isrc-usuan1100445.mp4", title="Psychedelic Crater",
                               artist="Kevin MacLeod (incompetech.com)", licence="CC BY 3.0", bpm=120.0,
                               downbeat=1.985, best=(6, 13), best2=(48, 60)),
    "happy-sitar": dict(file="sur-happy-sitar-antti-luode.mp4", title="Happy sitar", artist="Antti Luode",
                        licence="CC BY 3.0", bpm=95.0, downbeat=0.61, best=(6, 19), best2=(32, 52)),
    "vadodora-chill": dict(file="sur-vadodora-chill-mix-isrc-usuan1400050.mp4", title="Vadodora Chill Mix",
                           artist="Kevin MacLeod (incompetech.com)", licence="CC BY 3.0", bpm=97.0,
                           downbeat=0.6, best=(2, 70), best2=(2, 70)),
    # Owner picked this one for the Spark TV ads (2026-10-08). CC BY 4.0.
    "inspiring-advertising": dict(file="sur-inspiring-advertising-rafael-krux.mp4", title="Inspiring Advertising",
                                  artist="Rafael Krux", licence="CC BY 4.0", bpm=120.0, downbeat=0.07,
                                  best=(20, 35), best2=(52, 82)),
}
# what each mood uses
MOODS = {"energetic": "upbeat-sitar", "promo": "psychedelic-crater", "happy": "happy-sitar", "calm": "vadodora-chill",
         "feelgood": "inspiring-advertising"}


def track(name):
    return TRACKS[MOODS.get(name, name)]


def credit(name):
    t = track(name)
    return f'Music: "{t["title"]}" by {t["artist"]}, {t["licence"]}'


def load(name):
    """Whole track as float32 stereo (n, 2), fetched once from the sur-media release."""
    t = track(name)
    os.makedirs(CACHE, exist_ok=True)
    wav = os.path.join(CACHE, t["file"].replace(".mp4", ".wav"))
    if not os.path.exists(wav):
        tmp = wav + ".part.wav"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", REL + t["file"], "-vn", "-ac", "2", "-ar", str(SR), tmp],
                       check=True, timeout=600)
        os.replace(tmp, wav)
    import wave
    with wave.open(wav) as w:
        a = np.frombuffer(w.readframes(w.getnframes()), "<i2").astype(np.float32) / 32768
    return a.reshape(-1, 2)


def stretch(x, ratio):
    """Change speed by ratio (>1 faster) with ffmpeg atempo, keeping pitch. Only for small changes."""
    if abs(ratio - 1) < 1e-4:
        return x
    p = subprocess.run(["ffmpeg", "-v", "error", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "-",
                        "-af", f"atempo={ratio:.6f}", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-"],
                       input=np.ascontiguousarray(x, np.float32).tobytes(), capture_output=True, check=True)
    return np.frombuffer(p.stdout, np.float32).reshape(-1, 2).copy()


def fade(x, fin=0.0, fout=0.0):
    x = x.copy()
    a, b = int(fin * SR), int(fout * SR)
    if a: x[:a] *= np.linspace(0, 1, a)[:, None]
    if b: x[-b:] *= np.linspace(1, 0, b)[:, None] ** 1.5
    return x


def bed(name, secs, bpm=None, start_bar=None, fade_in=0.4, fade_out=1.5, second=False):
    """[secs] of the track's liveliest part, starting on a bar line. bpm: stretch to this tempo
    (so cuts made on a 128 BPM grid stay in time). Loops the part if it is shorter than secs."""
    t = track(name)
    x = load(name)
    ratio = (bpm / t["bpm"]) if bpm else 1.0
    bar = 4 * 60 / t["bpm"]
    b0, b1 = t["best2"] if second else t["best"]
    if start_bar is not None:
        b0 = start_bar
    a, z = int((t["downbeat"] + b0 * bar) * SR), int((t["downbeat"] + b1 * bar) * SR)
    part = x[a:z]
    need = int(secs * ratio * SR) + SR
    while len(part) < need:  # loop on the bar
        part = np.concatenate([part, x[int((t["downbeat"] + t["best"][0] * bar) * SR):z]])
    part = stretch(part[:need], ratio)[: int(secs * SR)]
    return fade(part, fade_in, fade_out)


def bar_len(name, bpm=None):
    return 4 * 60 / (bpm or track(name)["bpm"])


def lowpass_sweep(x, f0, f1, block=2048):
    """Filter that opens from f0 to f1 Hz across x (a build-up)."""
    out = np.zeros_like(x)
    win = np.hanning(2 * block)[:, None]
    fr = np.fft.rfftfreq(2 * block, 1 / SR)
    n = len(x)
    for i in range(0, n, block):
        seg = x[i:i + 2 * block]
        if len(seg) < 2 * block:
            seg = np.pad(seg, ((0, 2 * block - len(seg)), (0, 0)))
        fc = f0 * (f1 / f0) ** (i / max(1, n))
        g = 1 / np.sqrt(1 + (fr / fc) ** 4)
        y = np.fft.irfft(np.fft.rfft(seg * win, axis=0) * g[:, None], axis=0)
        m = min(2 * block, n - i)
        out[i:i + m] += y[:m]
    return out


def save(path, x):
    import wave
    y = np.clip(x, -1, 1)
    with wave.open(path, "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((y * 32767).astype("<i2").tobytes())


if __name__ == "__main__":
    # python3 library.py out.wav MOOD SECONDS [BPM]
    out, mood, secs = sys.argv[1], sys.argv[2], float(sys.argv[3])
    save(out, bed(mood, secs, float(sys.argv[4]) if len(sys.argv) > 4 else None) * 0.8)
    print(credit(mood))
