set -eu
mkdir -p out
REL="https://github.com/$GITHUB_REPOSITORY/releases/download/ad5-work"
if [ "${MODE:-}" = "lips" ]; then
  sudo apt-get install -y -qq ffmpeg >/dev/null
  curl -fsSL -o out/$ONLY.mp4 "$REL/$ONLY.mp4"
  curl -fsSL -o out/$ONLY-voice.audio "$REL/$ONLY${VOICE_SUFFIX:-}.${VOICE_EXT:-mp3}"
  D=$(ffprobe -v error -show_entries format=duration -of csv=p=0 out/$ONLY.mp4)
  ffmpeg -v error -y -i out/$ONLY-voice.audio -af "silenceremove=start_periods=1:start_threshold=-45dB,adelay=250|250,apad" -t "$D" -ac 1 -ar 16000 out/$ONLY-line.wav
  if [ "${CPU_LIPS:-}" = "1" ]; then bash lips_cpu.sh; else python3 lipsync.py $ONLY; fi
  rm -f out/$ONLY.mp4 out/$ONLY-voice.audio
  gh release upload ad5-work -R "$GITHUB_REPOSITORY" --clobber out/*
  exit 0
fi
if [ "${MODE:-}" = "tts" ]; then
  pip install -q git+https://github.com/huggingface/parler-tts.git soundfile
  pip install -q --force-reinstall torch==2.5.1 torchaudio==2.5.1 --index-url https://download.pytorch.org/whl/cpu
  python3 probe_tts.py
  gh release upload ad5-work -R "$GITHUB_REPOSITORY" --clobber out/*
  exit 0
fi
python3 gen.py
gh release upload ad5-work -R "$GITHUB_REPOSITORY" --clobber out/*
