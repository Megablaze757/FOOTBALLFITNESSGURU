#!/usr/bin/env bash
# Is the reel as loud as everything else in the feed?
#
# "I can't hear the voice." Four reels had shipped at -21.7 and -20.4 LUFS
# against a platform norm of about -14, because lib/wav.ts normalises to -1
# dBFS PEAK and a peak is not a loudness — one transient consonant can set it
# while the speech sits ten decibels below.
#
# The mux applies loudnorm now. This checks it actually did: the filter is one
# line in a long ffmpeg invocation, it is easy to lose in an edit, and it fails
# silently by producing a quiet file that looks perfectly fine.
set -euo pipefail

TARGET=-14
TOLERANCE=2.0
fail=0

for f in "$@"; do
  measured=$(ffmpeg -hide_banner -i "$f" -af loudnorm=print_format=summary -f null - 2>&1 \
    | sed -n 's/^Input Integrated:[[:space:]]*\(-\?[0-9.]*\).*/\1/p' | head -1)
  if [ -z "$measured" ]; then
    echo "::error::could not measure the loudness of $f"; fail=1; continue
  fi
  off=$(python3 -c "print(abs($measured - ($TARGET)))")
  within=$(python3 -c "print(1 if abs($measured - ($TARGET)) <= $TOLERANCE else 0)")
  printf '%-34s %8s LUFS  (target %s, off by %s)\n' "$(basename "$f")" "$measured" "$TARGET" "$off"
  if [ "$within" != "1" ]; then
    echo "::error::$(basename "$f") is $measured LUFS — a feed normalises to about $TARGET, so this plays quiet"
    fail=1
  fi
done

exit "$fail"
