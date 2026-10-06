set -eu
mkdir -p out
if [ "$ONLY" = "s1" ]; then
  python3 probe.py fffiloni/LatentSync ByteDance/LatentSync-1.5 ByteDance/LatentSync fffiloni/Wav2Lip-HD pragnakalp/Wav2lip-ZeroGPU Kedreamix/Wav2Lip-HD KwaiVGI/LivePortrait jhj0517/LatentSync-1.5 skytnt/Wav2Lip
  exit 0
fi
if [ "$ONLY" = "s2" ]; then
  pip install -q torch --index-url https://download.pytorch.org/whl/cpu
  pip install -q git+https://github.com/huggingface/parler-tts.git soundfile
  python3 probe_tts.py
  gh release upload ad5-work -R "$GITHUB_REPOSITORY" --clobber out/*
  exit 0
fi
