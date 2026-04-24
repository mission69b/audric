/**
 * Convert ElevenLabs character-level alignment into word-level ranges.
 * Used by the voice mode UI to highlight the assistant's text word by
 * word as TTS plays.
 *
 * ElevenLabs returns:
 *   characters:  ['H','e','l','l','o',' ','w','o','r','l','d']
 *   startTimes:  [0.00,0.05,0.11,0.17,0.23,0.29,0.32,0.38,0.44,0.50,0.56]
 *
 * We collapse this into word boundaries:
 *   [
 *     { word: 'Hello', startSec: 0.00, charStart: 0,  charEnd: 5  },
 *     { word: 'world', startSec: 0.32, charStart: 6,  charEnd: 11 },
 *   ]
 *
 * We split on whitespace (any char that's a space, tab, or newline).
 * Punctuation stays attached to the preceding word, matching how Claude
 * highlights — "world!" is one highlight unit, not two.
 */

export interface WordSpan {
  word: string;
  /** Audio time (seconds) when the first char of this word is spoken. */
  startSec: number;
  /** Index into the original text of the word's first character. */
  charStart: number;
  /** Index into the original text immediately after the word's last char. */
  charEnd: number;
}

export function buildWordSpans(
  characters: string[],
  startTimes: number[],
): WordSpan[] {
  if (characters.length !== startTimes.length) {
    // Defensive: ElevenLabs occasionally returns mismatched arrays for
    // edge-case inputs (empty SSML, control characters). We bail rather
    // than risk an off-by-one highlight.
    return [];
  }

  const spans: WordSpan[] = [];
  let inWord = false;
  let wordStartIdx = 0;
  let wordStartTime = 0;
  let wordChars = '';

  for (let i = 0; i < characters.length; i++) {
    const ch = characters[i];
    const isWs = /\s/.test(ch);

    if (!isWs) {
      if (!inWord) {
        inWord = true;
        wordStartIdx = i;
        wordStartTime = startTimes[i];
        wordChars = '';
      }
      wordChars += ch;
    } else if (inWord) {
      spans.push({
        word: wordChars,
        startSec: wordStartTime,
        charStart: wordStartIdx,
        charEnd: i,
      });
      inWord = false;
    }
  }

  if (inWord) {
    spans.push({
      word: wordChars,
      startSec: wordStartTime,
      charStart: wordStartIdx,
      charEnd: characters.length,
    });
  }

  return spans;
}

/**
 * Find the index of the last word whose `startSec` is <= currentSec.
 * Returns -1 before the first word begins. Used inside the rAF loop
 * during TTS playback.
 */
export function indexAtTime(spans: WordSpan[], currentSec: number): number {
  if (spans.length === 0) return -1;
  if (currentSec < spans[0].startSec) return -1;

  // Binary search since spans can run into the hundreds for long
  // assistant responses and the rAF loop calls this 60×/sec.
  let lo = 0;
  let hi = spans.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (spans[mid].startSec <= currentSec) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
