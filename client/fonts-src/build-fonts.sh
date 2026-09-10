#!/usr/bin/env bash
# Regenerate the two shipped Inter subsets from the full variable font.
#
# The full InterVariable.woff2 is 343KB and covers Cyrillic, Greek and a great
# deal more that a Nigerian business platform never renders. It was preloaded
# on every page, signed-in app included.
#
# WHY THE SPLIT, AND WHY THE EXTENDED FILE IS NOT OPTIONAL
#
# Subsetting to "characters our source contains" would be wrong: customer DATA
# carries names we never wrote. Yoruba (ẹ ọ ṣ plus tone marks), Igbo (ị ụ ṅ)
# and Hausa (ɓ ɗ ƙ ƴ) all live outside Latin-1. A missing glyph in the middle
# of somebody's name is the product telling them it was not built for them.
#
# So: a core file that covers an ordinary screen, and an extended file the
# browser fetches ONLY when a page actually contains one of those characters.
# unicode-range in global.css is what makes that decision, per page, in the
# browser. A customer whose staff list is all English never downloads the 124KB.
#
# A trap worth naming: the Hausa CAPITALS (Ɓ Ɗ Ƙ Ƴ) sit in Latin Extended-B,
# but their LOWERCASE (ɓ ɗ) sit in IPA Extensions, a different block. A range
# that stops at U+024F takes the capitals and drops the lowercase, so "Ɓaɓangida"
# renders with one letter in a fallback face. test/font_covers_names.mjs checks
# real names rather than trusting the ranges.
#
# Needs: pip install fonttools brotli
set -euo pipefail
cd "$(dirname "$0")"

CORE="U+0020-007E,U+00A0-00FF,U+2000-206F,U+20A0-20BF,U+2190-2199,U+2212,U+2260,U+2264,U+2265,U+2318,U+2500,U+25B2,U+25BC,U+25C6,U+2713,U+2717"
EXT="U+0100-017F,U+0180-024F,U+0250-02AF,U+02B0-02FF,U+0300-036F,U+1E00-1EFF"
FEATURES='kern,liga,calt,tnum,ccmp,mark,mkmk,locl'   # tnum: tabular figures, the money columns depend on it
                                                      # mark/mkmk/ccmp: Yoruba tone marks sit correctly
sub () {
  pyftsubset InterVariable.woff2 --output-file="../public/fonts/$1" --flavor=woff2 \
    --unicodes="$2" --layout-features="$FEATURES" --no-hinting --desubroutinize
  printf '  %-22s %4d KB\n' "$1" "$(( $(stat -f%z "../public/fonts/$1") / 1024 ))"
}
echo "Subsetting Inter (source: $(( $(stat -f%z InterVariable.woff2) / 1024 )) KB)"
sub Inter-latin.woff2 "$CORE"
sub Inter-ext.woff2   "$EXT"
echo "Keep the unicode-range values in src/styles/global.css in step with CORE and EXT above."
