set -eu
python3 gen.py
gh release view ad5-work -R "$GITHUB_REPOSITORY" >/dev/null 2>&1 || \
  gh release create ad5-work -R "$GITHUB_REPOSITORY" --prerelease --title "Ad 5 work files (not for users)" --notes "Raw parts for Cable TV Video Ad 5." --target "$GITHUB_SHA"
gh release upload ad5-work -R "$GITHUB_REPOSITORY" --clobber out/*
