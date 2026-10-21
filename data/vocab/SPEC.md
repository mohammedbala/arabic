# Vocabulary card spec (Libyan Arabic)

Each part file is a JSON array of objects. Every object:

| field   | required | description |
|---------|----------|-------------|
| `ar`    | yes | Word as spoken in **Libyan Arabic** (Tripoli/western urban usage as baseline), Arabic script. Add tashkeel only where it disambiguates pronunciation. |
| `tr`    | yes | Transliteration (convention below). |
| `en`    | yes | Short English gloss. Separate senses with `; `. |
| `msa`   | yes | Modern Standard Arabic equivalent, Arabic script (repeat `ar` if identical). |
| `pos`   | yes | one of `noun verb adj adv pron prep conj phrase num interj particle` |
| `cat`   | yes | category slug given in your assignment |
| `freq`  | yes | 1–5, 1 = among the most common words in daily Libyan speech, 5 = useful but less common |
| `ex_ar` | yes | Short natural example sentence in Libyan Arabic using the word |
| `ex_tr` | yes | Transliteration of example |
| `ex_en` | yes | English translation of example |
| `note`  | no  | Usage note, Libyan-specific detail, Italian/Turkish/Amazigh loanword origin, or a memorable mnemonic. For verbs ALWAYS include the imperfect (e.g. `"imperfect: يكتب yiktib"`). For nouns with irregular/broken plural include it (e.g. `"pl. بيوت byūt"`). |

## Transliteration convention

- Long vowels: ā ī ū ; short: a i u ; ē/ō allowed for Libyan diphthong reflexes (e.g. bēt, yōm)
- ء = `'` ; ع = `3` ; ح = `7` ; خ = `kh` ; غ = `gh` ; ش = `sh` ; ج = `j` ; ث = `th` ; ذ = `dh`
- Emphatics: ص = `S`, ض = `D`, ط = `T`, ظ = `DH` (uppercase)
- ق: in Libyan it is usually pronounced **g** — write `g` when spoken as g (e.g. gāl "he said"); write `q` only where Libyans keep q (formal/religious words).
- Doubled consonants written twice (tawwa, 7abba).

## Libyan features to respect

Future `bash`/`ash` (bash nimshi), progressive `gā3id` (gā3id nākil), negation `ma…sh` (ma nibbīsh), `mush` for non-verbal negation, `nibbi` (I want), `shinu/shin` (what), `wīn` (where), `kīf` (how), `3lāsh` (why), `tawwa` (now), `bāhi` (good/ok), `yāsir` (a lot), `hallba` (a lot), `gaddāsh` (how much), Italian loans (kūzīna kitchen, bāla, makīna car, flūs money, karrōsa…), 1st person singular imperfect with n- (nikteb = I write; niktbu = we write).

Do not invent words. If unsure whether a word is Libyan-specific, use the common pan-Maghrebi/Arabic form Libyans actually use and add a note.

Output must be valid JSON (UTF-8). Validate with:
`node -e "const a=require('./data/vocab/PARTFILE');console.log(a.length)"`

## v2 additions (5000-word deck)

Two more fields are **required on every entry**:

| field     | description |
|-----------|-------------|
| `usage`   | Integer 1–100: estimated **usage rank band** in everyday Libyan speech. The deck is ranked by this. Calibrate as: **95–100** among the ~50 most frequent words (و, في, أني, شن, مش…); **85–94** top 200; **75–84** top 500; **65–74** top 1000; **55–64** top 2000; **45–54** top 3000; **35–44** top 4000; **25–34** top 5000; **below 25** rarer than top 5000. Use the whole range inside a band (e.g. 71 vs 66) to order words. |
| `phrases` | Array of **at least 2** extra natural Libyan phrases/sentences that use the word (in any inflected form), each `{ "ar": "...", "tr": "...", "en": "..." }`. They must be different from `ex_ar` and from each other, short (2–8 words), and everyday — collocations, fixed expressions, typical questions/answers. |

So every word has at least 3 usages: `ex_*` plus `phrases[]`.

Checking a part file (schema, required fields, duplicates against every other part):

    node scripts/check-part.js data/vocab/partN.json

Fix every `ERROR`. A `DUP` means that word (same Arabic + same meaning) is already in another file — remove it from yours. `SAME-AR` is only a warning (homographs with a different meaning are fine).

Use your **own scratch folder** for any helper files: `/tmp/claude-0/-home-user-arabic/9763037e-5c23-56f2-aac7-f638c4292a09/scratchpad/<your-part-name>/` — other agents share the scratchpad.
