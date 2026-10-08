# LatentSync 1.5 (open model) on the CPU runner, stage2 (inference) config, for one scene: out/$ONLY.mp4 + out/$ONLY-line.wav -> out/$ONLY-lips.mp4
set -eux
git clone -q --depth 1 https://github.com/bytedance/LatentSync.git /tmp/ls
cd /tmp/ls
cat requirements.txt
grep -v -i -E "^torch|^torchvision|^torchaudio|^--|onnxruntime-gpu|decord" requirements.txt > req.txt || true
pip install -q torch==2.5.1 torchvision==0.20.1 torchaudio==2.5.1 --index-url https://download.pytorch.org/whl/cpu
pip install -q -r req.txt onnxruntime decord huggingface_hub || pip install -q -r req.txt onnxruntime huggingface_hub
python3 - <<'PY'
from huggingface_hub import hf_hub_download
for f in ["latentsync_unet.pt", "whisper/tiny.pt"]:
    print(hf_hub_download("ByteDance/LatentSync-1.5", f, local_dir="checkpoints"))
PY
# make it run on CPU in float32
grep -rl --include=*.py -E "cuda|float16" . | xargs sed -i -E 's/"cuda"/"cpu"/g; s/\.cuda\(\)/.to("cpu")/g; s/torch\.float16/torch.float32/g; s/device="cuda"/device="cpu"/g'
python3 - <<'PY'
import re
p = "latentsync/utils/image_processor.py"; s = open(p).read()
s = s.replace('if device == "cpu":\n            self.face_detector = None\n        else:\n            self.face_detector = FaceDetector(device=device)', 'self.face_detector = FaceDetector(device=device)')
open(p, "w").write(s)
p = "latentsync/utils/face_detector.py"; s = open(p).read()
s = s.replace('providers=["CUDAExecutionProvider"]', 'providers=["CPUExecutionProvider"]').replace("ctx_id=cuda_to_int(device)", "ctx_id=-1")
open(p, "w").write(s)
print(open("latentsync/utils/face_detector.py").read()[:900])
PY
grep -rn --include=*.py -E "cuda" . | head -20 || true
cfg=configs/unet/stage2.yaml; [ -f "$cfg" ] || cfg=$(ls configs/unet/stage2*.yaml | head -1); ls configs/unet/; echo "config $cfg"; cat "$cfg" | head -60
cd -
time python3 /tmp/ls/scripts/inference.py --unet_config_path "/tmp/ls/$cfg" --inference_ckpt_path /tmp/ls/checkpoints/latentsync_unet.pt \
  --inference_steps ${STEPS:-20} --guidance_scale 1.5 --video_path out/$ONLY.mp4 --audio_path out/$ONLY-line.wav --video_out_path out/$ONLY-lips.mp4 \
  || (cd /tmp/ls && time python3 -m scripts.inference --unet_config_path "$cfg" --inference_ckpt_path checkpoints/latentsync_unet.pt \
  --inference_steps ${STEPS:-20} --guidance_scale 1.5 --video_path "$OLDPWD/out/$ONLY.mp4" --audio_path "$OLDPWD/out/$ONLY-line.wav" --video_out_path "$OLDPWD/out/$ONLY-lips.mp4")
