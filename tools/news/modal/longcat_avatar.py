"""Realistic talking newsreader test on Modal (owner asked 2026-10-09 for more lifelike news presenters).

LongCat-Video-Avatar 1.5 (Meituan, MIT licence) turns one reader picture + our own Urdu voice
into a video where the head, shoulders and lips move with the speech. GitHub runners have no GPU,
so this runs on Modal (owner's account, $1 free credit; keys are the MODAL_TOKEN_ID/SECRET secrets).

  modal run tools/news/modal/longcat_avatar.py --image in.jpg --audio in.mp3 --prompt "..." --out out.mp4

Weights are downloaded once into the Modal volume "longcat-weights" on a cheap CPU machine;
only the generation itself uses a GPU.
"""
import math
import os
import subprocess
import time

import modal

app = modal.App("spark-presenter-test")
weights = modal.Volume.from_name("longcat-weights", create_if_missing=True)
W = "/w"
GPU = os.environ.get("PRESENTER_GPU", "L40S")
GPU_PER_HOUR = {"L40S": 1.95, "A100-80GB": 2.50, "H100": 3.95}

image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("git", "ffmpeg", "libsndfile1")
    .pip_install("torch==2.6.0", "torchvision==0.21.0", "torchaudio==2.6.0",
                 index_url="https://download.pytorch.org/whl/cu124")
    .pip_install("https://github.com/Dao-AILab/flash-attention/releases/download/v2.7.4.post1/"
                 "flash_attn-2.7.4.post1+cu12torch2.6cxx11abiFALSE-cp310-cp310-linux_x86_64.whl")
    .run_commands(
        "git clone --depth 1 https://github.com/meituan-longcat/LongCat-Video /repo",
        "grep -v -E '^(torch|flash-attn|streamlit)==' /repo/requirements.txt > /tmp/req.txt",
        "pip install -r /tmp/req.txt -r /repo/requirements_avatar.txt 'huggingface_hub[cli]' hf_transfer",
    )
    .env({"HF_HUB_ENABLE_HF_TRANSFER": "1"})
)


@app.function(image=image, volumes={W: weights}, cpu=4, timeout=3600)
def fetch_weights():
    """Download only the parts the 1.5 avatar needs (skips the big bf16 models)."""
    from huggingface_hub import snapshot_download
    marker = f"{W}/ready-1.5"
    if os.path.exists(marker):
        return "weights already there"
    t = time.time()
    snapshot_download("meituan-longcat/LongCat-Video", local_dir=f"{W}/LongCat-Video",
                      allow_patterns=["tokenizer/*", "text_encoder/*", "vae/*"])
    snapshot_download("meituan-longcat/LongCat-Video-Avatar-1.5", local_dir=f"{W}/LongCat-Video-Avatar-1.5",
                      allow_patterns=["base_model_int8/*", "lora/*", "whisper-large-v3/*",
                                      "vocal_separator/*", "scheduler/*"])
    open(marker, "w").write("ok")
    weights.commit()
    size = subprocess.run(["du", "-sh", W], capture_output=True, text=True).stdout.strip()
    return f"weights downloaded in {time.time() - t:.0f} s ({size})"


@app.function(image=image, volumes={W: weights}, gpu=GPU, timeout=2400)
def make_clip(picture: bytes, voice: bytes, prompt: str, resolution: str = "480p") -> dict:
    import json
    t0 = time.time()
    os.makedirs("/job", exist_ok=True)
    open("/job/reader.jpg", "wb").write(picture)
    open("/job/voice.mp3", "wb").write(voice)
    dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0",
                                "/job/voice.mp3"], capture_output=True, text=True).stdout.strip())
    # 25 fps: first part 93 frames (3.72 s), each further part adds 80 frames (3.2 s).
    segments = max(1, math.ceil((dur - 3.72) / 3.2) + 1)
    json.dump({"prompt": prompt, "cond_image": "/job/reader.jpg", "cond_audio": {"person1": "/job/voice.mp3"}},
              open("/job/input.json", "w"), ensure_ascii=False)
    cmd = ["torchrun", "--nproc_per_node=1", "run_demo_avatar_single_audio_to_video.py",
           f"--checkpoint_dir={W}/LongCat-Video-Avatar-1.5", "--stage_1=ai2v", "--input_json=/job/input.json",
           f"--num_segments={segments}", "--ref_img_index=10", "--mask_frame_range=3", f"--resolution={resolution}",
           "--use_distill", "--model_type", "avatar-v1.5", "--use_int8", "--output_dir=/job/out"]
    run = subprocess.run(cmd, cwd="/repo", capture_output=True, text=True)
    log = (run.stdout + run.stderr)[-6000:]
    videos = sorted((f for f in os.listdir("/job/out") if f.endswith(".mp4") and "-temp" not in f and "-crop" not in f),
                    key=lambda f: os.path.getmtime(f"/job/out/{f}")) if os.path.isdir("/job/out") else []
    secs = time.time() - t0
    result = {"ok": run.returncode == 0 and bool(videos), "gpu": GPU, "speech_seconds": round(dur, 1),
              "segments": segments, "gpu_seconds": round(secs), "est_cost_usd": round(secs / 3600 * GPU_PER_HOUR.get(GPU, 4), 3),
              "log_tail": log}
    if videos:
        result["video"] = open(f"/job/out/{videos[-1]}", "rb").read()
    return result


@app.local_entrypoint()
def main(image: str, audio: str, prompt: str, out: str, resolution: str = "480p"):
    import json
    print(fetch_weights.remote())
    r = make_clip.remote(open(image, "rb").read(), open(audio, "rb").read(), prompt, resolution)
    video = r.pop("video", None)
    if video:
        open(out, "wb").write(video)
    print(r.pop("log_tail"))
    print(json.dumps(r, indent=1))
    json.dump(r, open(out + ".json", "w"), indent=1)
    if not video:
        raise SystemExit("no video came back")
