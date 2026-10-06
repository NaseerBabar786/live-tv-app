set -eu
python3 gen.py
gh release upload ad5-work -R "$GITHUB_REPOSITORY" --clobber out/*
