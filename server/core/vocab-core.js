// Deck indexing and presentation, shared by server and browser.

export function indexVocab(words) {
  const byId = new Map(words.map((w) => [w.id, w]));
  const byRank = [...words].sort((a, b) => a.rank - b.rank);
  const categories = [...new Set(byRank.map((w) => w.cat))];
  return { words, byId, byRank, categories };
}

/** Returns the word fields shown to a learner in the selected dialect. */
export function present(word, dialect = 'libyan') {
  if (!word) return null;
  const msa = dialect === 'msa';
  return {
    id: word.id,
    rank: word.rank,
    ar: msa ? word.msa : word.ar,
    tr: msa ? '' : word.tr,
    alt: msa ? word.ar : word.msa,
    en: word.en,
    pos: word.pos,
    cat: word.cat,
    freq: word.freq,
    ex_ar: word.ex_ar,
    ex_tr: word.ex_tr,
    ex_en: word.ex_en,
    note: word.note,
    usage: word.usage,
    phrases: word.phrases ?? [],
  };
}
