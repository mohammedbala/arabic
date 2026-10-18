// The fluency path. Vocabulary flows from the SRS deck in frequency order; this
// file defines the grammar/pattern lessons that are woven in week by week and
// the weekly themes/milestones. Lesson ids are stable (stored in lesson_progress).
//
// Each lesson: short explanation → worked examples (Libyan Arabic) → a
// retrieval quiz (testing effect). Examples double as comprehensible input.

export const WEEKS = [
  {
    week: 1,
    title: 'Survival kit',
    goal: 'Greet people, introduce yourself, ask basic questions, point at things.',
    focus: ['greetings', 'pronouns', 'questions', 'numbers'],
  },
  {
    week: 2,
    title: 'Wants, needs & money',
    goal: 'Say what you want and have, ask prices, handle shops and cafés.',
    focus: ['food', 'drink', 'shopping', 'numbers'],
  },
  {
    week: 3,
    title: 'Everyday actions (present)',
    goal: 'Talk about routines and what is happening now.',
    focus: ['verbs-core', 'verbs-daily', 'time'],
  },
  {
    week: 4,
    title: 'Telling what happened (past)',
    goal: 'Describe yesterday, last week, and tell short stories.',
    focus: ['verbs-motion', 'verbs-communication', 'family', 'people'],
  },
  {
    week: 5,
    title: 'Plans, directions & requests',
    goal: 'Make plans, give and follow directions, ask people to do things.',
    focus: ['city', 'travel', 'verbs-work', 'home'],
  },
  {
    week: 6,
    title: 'Real conversations',
    goal: 'Connect ideas, give opinions, use conditionals and Libyan expressions naturally.',
    focus: ['emotions', 'adjectives', 'social', 'culture'],
  },
];

export const LESSONS = [
  {
    id: 'w1-sounds',
    week: 1,
    title: 'Sounds & transliteration',
    summary: 'The Arabic letters that English lacks and how this app writes them.',
    body: [
      {
        h: 'Why this first',
        p: 'You learn words faster when you can hear them correctly in your head. Spend five minutes here, then every card will "sound" right.',
      },
      {
        h: 'The tricky consonants',
        table: [
          ['ع', '3', 'A squeeze in the throat — like the start of "uh-oh" but tighter.', 'عين 3ēn (eye)'],
          ['ح', '7', 'A breathy, whispered "h" from deep in the throat.', 'حليب 7līb (milk)'],
          ['خ', 'kh', 'Like Scottish "loch" or German "Bach".', 'خبزة khubza (bread)'],
          ['غ', 'gh', 'A gargled French "r".', 'غالي ghāli (expensive)'],
          ['ق', 'g', 'Libyans usually say ق as a hard g.', 'قال gāl (he said)'],
          ['ص ض ط ظ', 'S D T DH', 'Emphatic ("heavy") versions of s d t dh — tongue low, back of mouth wide.', 'طاولة Tāwla (table)'],
          ['ء', "'", 'A glottal stop, as in "uh-oh".', "سأل sa'al (asked)"],
        ],
      },
      {
        h: 'Libyan vowel tip',
        p: 'Libyan speech drops many short vowels: MSA كَتَبَ kataba becomes ktib; أَكَلَ akala becomes klā. Long vowels ā ī ū (and ē ō) are where the stress usually lands.',
      },
    ],
    quiz: [
      { q: 'Which number represents ع in transliteration?', options: ['3', '7', '2', '5'], answer: 0 },
      { q: 'How do Libyans usually pronounce ق in قال?', options: ['g', 'q', 'k', "'"], answer: 0 },
      { q: '7 stands for…', options: ['ح', 'خ', 'ه', 'ع'], answer: 0 },
    ],
  },
  {
    id: 'w1-pronouns',
    week: 1,
    title: 'I, you, he… (pronouns)',
    summary: 'Independent pronouns — the backbone of every sentence.',
    body: [
      {
        h: 'Libyan pronouns',
        table: [
          ['أني', 'āni', 'I'],
          ['إنت', 'inta', 'you (m.)'],
          ['إنتي', 'inti', 'you (f.)'],
          ['هو', 'huwwa', 'he'],
          ['هي', 'hiyya', 'she'],
          ['إحنا', 'i7na', 'we'],
          ['إنتو', 'intu', 'you (pl.)'],
          ['هوما', 'humma', 'they'],
        ],
      },
      {
        h: 'Notice',
        p: 'Libyan uses one plural "you" and one "they" for men and women. "I" is āni (not MSA ana).',
      },
      {
        h: 'Examples',
        examples: [
          ['أني من طرابلس', 'āni min Trābləs', 'I am from Tripoli.'],
          ['هي طالبة', 'hiyya Tālba', 'She is a student.'],
          ['هوما وين؟', 'humma wīn?', 'Where are they?'],
        ],
      },
    ],
    quiz: [
      { q: '"We" in Libyan is…', options: ['i7na', 'humma', 'intu', 'āni'], answer: 0 },
      { q: 'āni means…', options: ['I', 'you', 'he', 'they'], answer: 0 },
      { q: '"They" in Libyan is…', options: ['humma', 'hunna', 'huwwa', 'intu'], answer: 0 },
    ],
  },
  {
    id: 'w1-nominal',
    week: 1,
    title: 'No "to be": simple sentences',
    summary: 'Arabic just puts things side by side: "I tired", "the house big".',
    body: [
      {
        h: 'The pattern',
        p: 'In the present tense there is no verb "to be". Subject + description is a full sentence. Negate with mush (not).',
      },
      {
        h: 'Examples',
        examples: [
          ['أني تعبان', 'āni ta3bān', 'I am tired.'],
          ['الحوش كبير', 'il7ōsh kbīr', 'The house is big.'],
          ['هو مش هني', 'huwwa mush hni', 'He is not here.'],
          ['هذا مش غالي', 'hādha mush ghāli', 'This is not expensive.'],
        ],
      },
      {
        h: 'This & that',
        table: [
          ['هذا', 'hādha', 'this (m.)'],
          ['هذي', 'hādhi', 'this (f.)'],
          ['هذوما', 'hādhūma', 'these'],
          ['هذاك / هذيك', 'hādhāk / hādhīk', 'that (m./f.)'],
        ],
      },
    ],
    quiz: [
      { q: 'How do you say "I am not tired"?', options: ['āni mush ta3bān', 'āni ma ta3bānsh', 'mush āni ta3bān', 'āni kān ta3bān'], answer: 0 },
      { q: 'hādhi is used for…', options: ['feminine nouns', 'masculine nouns', 'plurals', 'far things'], answer: 0 },
      { q: 'il7ōsh kbīr means…', options: ['The house is big', 'The big house', 'A house was big', 'Houses are big'], answer: 0 },
    ],
  },
  {
    id: 'w1-questions',
    week: 1,
    title: 'Asking questions',
    summary: 'shinu, wīn, kīf, 3lāsh, gaddāsh, mīn — ask anything.',
    body: [
      {
        h: 'Question words',
        table: [
          ['شنو / شن', 'shinu / shin', 'what'],
          ['وين', 'wīn', 'where'],
          ['كيف', 'kīf', 'how'],
          ['علاش', '3lāsh', 'why'],
          ['قداش', 'gaddāsh', 'how much / how many'],
          ['مين', 'mīn', 'who'],
          ['وقتاش', 'waqtāsh', 'when'],
          ['منين', 'mnīn', 'from where'],
        ],
      },
      {
        h: 'Word order',
        p: 'Question word usually comes first; intonation does the rest. A yes/no question is just a statement with rising tone.',
      },
      {
        h: 'Examples',
        examples: [
          ['شن اسمك؟', 'shin ismik?', 'What is your name?'],
          ['منين إنت؟', 'mnīn inta?', 'Where are you from?'],
          ['قداش هذا؟', 'gaddāsh hādha?', 'How much is this?'],
          ['كيف حالك؟', 'kīf 7ālik?', 'How are you?'],
        ],
      },
    ],
    quiz: [
      { q: '"Why?" in Libyan is…', options: ['3lāsh', 'wīn', 'kīf', 'mīn'], answer: 0 },
      { q: 'gaddāsh hādha? means…', options: ['How much is this?', 'What is this?', 'Where is this?', 'Who is this?'], answer: 0 },
      { q: '"Where are you from?"', options: ['mnīn inta?', 'wīn inta?', 'kīf inta?', 'shinu inta?'], answer: 0 },
    ],
  },
  {
    id: 'w2-want-have',
    week: 2,
    title: 'Want & have: nibbi, 3andi',
    summary: 'The two most useful structures for getting what you need.',
    body: [
      {
        h: 'Want — يبي',
        table: [
          ['نبي', 'nibbi', 'I want'],
          ['تبي', 'tibbi', 'you want (m.)'],
          ['تبي', 'tibbi', 'you want (f.) — often tibbī'],
          ['يبي', 'yibbi', 'he wants'],
          ['تبي', 'tibbi', 'she wants'],
          ['نبوا', 'nibbu', 'we want'],
          ['تبوا', 'tibbu', 'you (pl.) want'],
          ['يبوا', 'yibbu', 'they want'],
        ],
      },
      {
        h: 'Have — عند + suffix',
        p: '"Have" is a preposition, 3and (at), with a pronoun ending: 3andi (I have), 3andak (you have), 3anda (he has), 3andha (she has), 3andna (we have), 3andkum (you pl. have), 3andhum (they have). Negate: ma 3andīsh (I don’t have).',
      },
      {
        h: 'Examples',
        examples: [
          ['نبي شاهي بالله', 'nibbi shāhi billāh', 'I’d like a tea, please.'],
          ['عندك صرف؟', '3andak Sarf?', 'Do you have change?'],
          ['ما عنديش وقت', 'ma 3andīsh wagt', 'I don’t have time.'],
          ['شن تبي؟', 'shin tibbi?', 'What do you want?'],
        ],
      },
    ],
    quiz: [
      { q: '"I want" =', options: ['nibbi', 'yibbi', 'tibbi', 'nibbu'], answer: 0 },
      { q: '"I don’t have" =', options: ['ma 3andīsh', 'mush 3andi', 'ma nibbīsh', 'la 3andi'], answer: 0 },
      { q: '3andha means…', options: ['she has', 'he has', 'they have', 'I have'], answer: 0 },
    ],
  },
  {
    id: 'w2-possession',
    week: 2,
    title: 'Mine, yours: possessive endings & mtā3',
    summary: 'Attach endings to nouns, or use mtā3 (of/belonging to).',
    body: [
      {
        h: 'Endings',
        table: [
          ['-i', 'my', 'kitābi — my book'],
          ['-ak / -ik', 'your (m./f.)', 'kitābak'],
          ['-a / -ah', 'his', 'kitāba'],
          ['-ha', 'her', 'kitābha'],
          ['-na', 'our', 'kitābna'],
          ['-kum', 'your (pl.)', 'kitābkum'],
          ['-hum', 'their', 'kitābhum'],
        ],
      },
      {
        h: 'mtā3 — "belonging to"',
        p: 'Libyans very often say il-X mtā3 Y: ilmakīna mtā3i (my car), ilkitāb mtā3 Ahmad (Ahmad’s book). mtā3 takes the same endings.',
      },
      {
        h: 'Examples',
        examples: [
          ['هذي الماكينة متاعي', 'hādhi ilmakīna mtā3i', 'This car is mine.'],
          ['حوشنا قريب', '7ōshna grīb', 'Our house is close.'],
          ['شن اسم بوك؟', 'shin ism būk?', 'What is your father’s name?'],
        ],
      },
    ],
    quiz: [
      { q: '"my car" =', options: ['ilmakīna mtā3i', 'mtā3 makīna', 'makīnak', 'ilmakīna mtā3ak'], answer: 0 },
      { q: 'The ending -na means…', options: ['our', 'my', 'their', 'your'], answer: 0 },
    ],
  },
  {
    id: 'w2-numbers-prices',
    week: 2,
    title: 'Numbers & prices',
    summary: 'Counting, dinars, and bargaining at the sūg.',
    body: [
      {
        h: 'Key numbers',
        table: [
          ['واحد', 'wā7id', '1'],
          ['زوز / اثنين', 'zūz / ithnīn', '2'],
          ['ثلاثة', 'tlāta', '3'],
          ['أربعة', 'arb3a', '4'],
          ['خمسة', 'khamsa', '5'],
          ['عشرة', '3ashra', '10'],
          ['عشرين', '3ishrīn', '20'],
          ['مية', 'miyya', '100'],
        ],
      },
      {
        h: 'Counting things',
        p: 'With 3–10 the noun is plural (tlāt dnānīr — 3 dinars); from 11 up the noun is singular (khmasTāsh dīnār — 15 dinars). With 2 you can use zūz + plural: zūz khubzāt.',
      },
      {
        h: 'At the market',
        examples: [
          ['قداش الكيلو؟', 'gaddāsh ilkīlu?', 'How much per kilo?'],
          ['غالي ياسر!', 'ghāli yāsir!', 'Very expensive!'],
          ['نقص شوية', 'naggiS shwayya', 'Lower it a bit.'],
        ],
      },
    ],
    quiz: [
      { q: '"two" in Libyan can be…', options: ['zūz', 'tlāta', 'wā7id', 'arb3a'], answer: 0 },
      { q: '"Very expensive!" =', options: ['ghāli yāsir!', 'rkhīS yāsir!', 'mush ghāli', 'gaddāsh?'], answer: 0 },
    ],
  },
  {
    id: 'w3-present',
    week: 3,
    title: 'Present tense: the n- for "I"',
    summary: 'Maghrebi hallmark: "I write" is nikteb, "we write" is niktbu.',
    body: [
      {
        h: 'Conjugation of كتب (write)',
        table: [
          ['نكتب', 'niktib', 'I write'],
          ['تكتب', 'tiktib', 'you write (m.)'],
          ['تكتبي', 'tiktbi', 'you write (f.)'],
          ['يكتب', 'yiktib', 'he writes'],
          ['تكتب', 'tiktib', 'she writes'],
          ['نكتبوا', 'niktbu', 'we write'],
          ['تكتبوا', 'tiktbu', 'you (pl.) write'],
          ['يكتبوا', 'yiktbu', 'they write'],
        ],
      },
      {
        h: 'Rule of thumb',
        p: 'Prefixes: n- (I), t- (you, she), y- (he). Add -u for plurals. Add -i for "you (f.)". This one pattern covers almost every verb you learn on your cards.',
      },
      {
        h: 'Examples',
        examples: [
          ['نخدم في بنك', 'nikhdim fi bank', 'I work in a bank.'],
          ['يسكنوا في بنغازي', 'yisknu fi Benghāzi', 'They live in Benghazi.'],
          ['تشرب قهوة؟', 'tishrib gahwa?', 'Do you drink coffee?'],
        ],
      },
    ],
    quiz: [
      { q: '"I write" =', options: ['niktib', 'aktub', 'yiktib', 'niktbu'], answer: 0 },
      { q: '"we work" =', options: ['nikhdmu', 'nikhdim', 'yikhdmu', 'tikhdim'], answer: 0 },
      { q: 'The prefix y- marks…', options: ['he / they', 'I', 'we', 'you (f.)'], answer: 0 },
    ],
  },
  {
    id: 'w3-progressive',
    week: 3,
    title: 'Right now: gā3id + verb',
    summary: 'gā3id (lit. "sitting") turns a verb into "-ing".',
    body: [
      {
        h: 'Pattern',
        p: 'gā3id (m.), gā3da (f.), gā3din (pl.) + present verb = action in progress. tawwa (now) often comes with it.',
      },
      {
        h: 'Examples',
        examples: [
          ['قاعد ناكل', 'gā3id nākil', 'I’m eating.'],
          ['قاعدة تقرا', 'gā3da tigra', 'She is reading.'],
          ['شن قاعد دير تو؟', 'shin gā3id dīr tawwa?', 'What are you doing now?'],
          ['قاعدين نستنوا فيك', 'gā3din nistannu fīk', 'We are waiting for you.'],
        ],
      },
    ],
    quiz: [
      { q: '"I’m eating" =', options: ['gā3id nākil', 'bash nākil', 'klīt', 'nākil bash'], answer: 0 },
      { q: 'gā3da is used for…', options: ['a woman', 'a man', 'a group', 'the past'], answer: 0 },
    ],
  },
  {
    id: 'w3-negation',
    week: 3,
    title: 'Negation: ma…sh',
    summary: 'Wrap the verb: ma nibbīsh (I don’t want).',
    body: [
      {
        h: 'Two negators',
        p: 'Verbs get wrapped in ma … -sh: ma nfhamsh (I don’t understand). Nouns, adjectives and future get mush: mush ghāli, mush bash nimshi.',
      },
      {
        h: 'Examples',
        examples: [
          ['ما فهمتش', 'ma fhimtsh', 'I didn’t understand.'],
          ['ما نبيش', 'ma nibbīsh', 'I don’t want (it).'],
          ['ما فيش مشكلة', 'ma fīsh mushkila', 'No problem.'],
          ['مش باهي', 'mush bāhi', 'Not good.'],
        ],
      },
    ],
    quiz: [
      { q: '"I don’t want" =', options: ['ma nibbīsh', 'mush nibbi', 'la nibbi', 'nibbi mush'], answer: 0 },
      { q: '"Not good" =', options: ['mush bāhi', 'ma bāhish', 'bāhi mush', 'la bāhi'], answer: 0 },
      { q: 'ma fīsh mushkila means…', options: ['No problem', 'There is a problem', 'What problem?', 'Big problem'], answer: 0 },
    ],
  },
  {
    id: 'w4-past',
    week: 4,
    title: 'Past tense endings',
    summary: 'Suffixes tell who did it: ktibt (I wrote), ktibna (we wrote).',
    body: [
      {
        h: 'Conjugation of كتب (wrote)',
        table: [
          ['كتبت', 'ktibt', 'I wrote'],
          ['كتبت', 'ktibt', 'you wrote (m.)'],
          ['كتبتي', 'ktibti', 'you wrote (f.)'],
          ['كتب', 'ktib', 'he wrote'],
          ['كتبت', 'kitbat', 'she wrote'],
          ['كتبنا', 'ktibna', 'we wrote'],
          ['كتبتوا', 'ktibtu', 'you (pl.) wrote'],
          ['كتبوا', 'kitbu', 'they wrote'],
        ],
      },
      {
        h: 'Hollow & weak verbs',
        p: 'Verbs with a long vowel shorten it before consonant endings: gāl → gilt (I said), shāf → shuft (I saw), mshā → mshīt (I walked), klā → klīt (I ate).',
      },
      {
        h: 'Examples',
        examples: [
          ['البارح مشيت للسوق', 'ilbār7a mshīt lissūg', 'Yesterday I went to the market.'],
          ['شفته في القهوة', 'shufta fi ilgahwa', 'I saw him at the café.'],
          ['شن قلت؟', 'shin gilt?', 'What did you say?'],
        ],
      },
    ],
    quiz: [
      { q: '"I ate" =', options: ['klīt', 'klā', 'nākil', 'kalu'], answer: 0 },
      { q: '"we wrote" =', options: ['ktibna', 'kitbu', 'niktbu', 'ktibt'], answer: 0 },
      { q: 'shuft means…', options: ['I saw', 'he saw', 'I see', 'look!'], answer: 0 },
    ],
  },
  {
    id: 'w4-time',
    week: 4,
    title: 'Talking about time',
    summary: 'ilbār7a, gbal, ba3d, min… — anchor your stories.',
    body: [
      {
        h: 'Anchors',
        table: [
          ['البارح', 'ilbār7a', 'yesterday'],
          ['اليوم', 'ilyōm', 'today'],
          ['غدوة', 'ghudwa', 'tomorrow'],
          ['قبل', 'gbal', 'before / ago'],
          ['بعدين', 'ba3dēn', 'later / then'],
          ['من زمان', 'min zamān', 'a long time ago'],
          ['الجمعة الجاية', 'ijjum3a ijjāya', 'next week'],
        ],
      },
      {
        h: 'Examples',
        examples: [
          ['جيت ليبيا من شهرين', 'jīt Lībya min shahrēn', 'I came to Libya two months ago.'],
          ['نتلاقوا بعدين', 'nitlāgu ba3dēn', 'We’ll meet later.'],
        ],
      },
    ],
    quiz: [
      { q: 'ghudwa =', options: ['tomorrow', 'yesterday', 'today', 'later'], answer: 0 },
      { q: '"two months ago" =', options: ['min shahrēn', 'ba3d shahrēn', 'shahrēn ijjāyin', 'fi shahrēn'], answer: 0 },
    ],
  },
  {
    id: 'w5-future',
    week: 5,
    title: 'Future: bash',
    summary: 'bash (or ash) + present verb = will / going to.',
    body: [
      {
        h: 'Pattern',
        p: 'bash nimshi = I will go. Negative: mush bash nimshi. Some speakers shorten to ash or bsh.',
      },
      {
        h: 'Examples',
        examples: [
          ['باش نمشي للبحر غدوة', 'bash nimshi lilba7r ghudwa', 'I’m going to the beach tomorrow.'],
          ['شن باش دير؟', 'shin bash dīr?', 'What are you going to do?'],
          ['مش باش نجي', 'mush bash niji', 'I won’t come.'],
        ],
      },
    ],
    quiz: [
      { q: '"I will go" =', options: ['bash nimshi', 'gā3id nimshi', 'mshīt', 'nimshi kān'], answer: 0 },
      { q: '"I won’t come" =', options: ['mush bash niji', 'ma bash nijīsh', 'bash ma niji', 'la niji'], answer: 0 },
    ],
  },
  {
    id: 'w5-imperative',
    week: 5,
    title: 'Commands & requests',
    summary: 'Imperatives, directions, and softening with billāh / 3afak.',
    body: [
      {
        h: 'Forming commands',
        p: 'Take the "you" present form and drop the t-: tiktib → iktib (write!), tīji → ta3āl (come! — irregular), tishrib → ishrib. Add -i for a woman, -u for a group. Soften with billāh (please) or 3afak.',
      },
      {
        h: 'Directions',
        examples: [
          ['امشي طول', 'imshi Tūl', 'Go straight.'],
          ['دور على اليمين', 'dūr 3al-limīn', 'Turn right.'],
          ['وقف هني بالله', 'waggif hni billāh', 'Stop here, please.'],
          ['استنى شوية', 'istanna shwayya', 'Wait a bit.'],
        ],
      },
    ],
    quiz: [
      { q: '"Go straight" =', options: ['imshi Tūl', 'dūr Tūl', 'waggif', 'ta3āl'], answer: 0 },
      { q: 'billāh in a request means roughly…', options: ['please', 'thanks', 'sorry', 'quickly'], answer: 0 },
    ],
  },
  {
    id: 'w6-connectors',
    week: 6,
    title: 'Connecting ideas',
    summary: 'w, lākin, 3la khāTir, illi, ba3d ma — longer, natural sentences.',
    body: [
      {
        h: 'Connectors',
        table: [
          ['و', 'w', 'and'],
          ['لكن', 'lākin', 'but'],
          ['على خاطر', '3la khāTir', 'because'],
          ['اللي', 'illi', 'who / which / that'],
          ['باش', 'bash', 'so that / in order to'],
          ['ولا', 'walla', 'or'],
          ['بعد ما', 'ba3d ma', 'after (doing)'],
        ],
      },
      {
        h: 'Examples',
        examples: [
          ['ما جيتش على خاطر كنت مريض', 'ma jītsh 3la khāTir kunt marīD', 'I didn’t come because I was sick.'],
          ['الراجل اللي شفته البارح', 'irrājil illi shufta ilbār7a', 'The man I saw yesterday.'],
          ['نبي نتعلم عربي باش نهدرز مع الناس', 'nibbi nit3allam 3arbi bash nhadriz ma3 innās', 'I want to learn Arabic so I can chat with people.'],
        ],
      },
    ],
    quiz: [
      { q: '"because" =', options: ['3la khāTir', 'lākin', 'walla', 'illi'], answer: 0 },
      { q: 'illi is used like English…', options: ['who/which/that', 'and', 'or', 'but'], answer: 0 },
    ],
  },
  {
    id: 'w6-conditionals',
    week: 6,
    title: 'If…: kān and lū',
    summary: 'Real conditions with kān / kan; imaginary ones with lū.',
    body: [
      {
        h: 'Pattern',
        p: 'kān + past (or present) for real possibilities: kān jīt, nimshu (if you come, we’ll go). lū for hypotheticals: lū 3andi flūs, nishri 7ōsh (if I had money, I’d buy a house).',
      },
      {
        h: 'Examples',
        examples: [
          ['كان تبي، نمشوا مع بعض', 'kān tibbi, nimshu ma3 ba3D', 'If you want, we’ll go together.'],
          ['لو نعرف، نقولك', 'lū na3rif, ngullak', 'If I knew, I’d tell you.'],
        ],
      },
    ],
    quiz: [
      { q: 'For an imaginary "if" use…', options: ['lū', 'kān', 'bash', 'illi'], answer: 0 },
    ],
  },
  {
    id: 'w6-expressions',
    week: 6,
    title: 'Sounding Libyan',
    summary: 'The fillers and expressions that make you sound local.',
    body: [
      {
        h: 'Everyday expressions',
        table: [
          ['باهي', 'bāhi', 'OK / good'],
          ['تو', 'tawwa', 'now; in a moment'],
          ['ياسر', 'yāsir', 'a lot / very'],
          ['هلبة', 'hallba', 'a lot'],
          ['خلاص', 'khalāṣ', 'enough / done'],
          ['يا ودي', 'yā wuddi', 'my friend / mate (friendly address)'],
          ['ربي يعطيك الصحة', 'rabbi ya3Tīk iṣṣa77a', 'God give you health (thank you)'],
          ['إن شاء الله', 'inshallah', 'God willing'],
        ],
      },
      {
        h: 'Culture tip',
        p: 'Greetings are long and layered: after salām, people ask about your health, family and news (shin 7wālik? ilmhimm labās?). Mirroring them is polite — rushing is not.',
      },
    ],
    quiz: [
      { q: 'tawwa means…', options: ['now / soon', 'yesterday', 'never', 'a lot'], answer: 0 },
      { q: 'A typical way to say thank you:', options: ['rabbi ya3Tīk iṣṣa77a', 'ma3lēsh', 'khalāṣ', 'yalla'], answer: 0 },
    ],
  },
];

export const lessonById = new Map(LESSONS.map((l) => [l.id, l]));

/**
 * Builds the personalised path for a user: target timeline scaled to their
 * chosen number of days, which week they are in, today's new-word quota and
 * milestones. The quota is "spread the remaining words evenly over the
 * remaining days" so the deck finishes on time without cramming.
 */
export const CORE_WORDS = 1000;
export const AFTER_CORE_PER_DAY = 10;

export function buildPlan({ totalWords, introduced, startedAt, targetDays, now = Date.now() }) {
  const DAY = 86_400_000;
  const dayIndex = Math.max(0, Math.floor((now - startedAt) / DAY));
  const daysLeft = Math.max(1, targetDays - dayIndex);
  // The target is the CORE_WORDS most frequent words by the end of the plan;
  // the rest of the deck follows at a gentle maintenance pace.
  const core = Math.min(CORE_WORDS, totalWords);
  const remaining = Math.max(0, core - introduced);
  const deckLeft = Math.max(0, totalWords - introduced);
  const newPerDay =
    deckLeft === 0 ? 0 : remaining === 0 ? Math.min(deckLeft, AFTER_CORE_PER_DAY) : Math.min(60, Math.max(5, Math.ceil(remaining / daysLeft)));
  const weekLen = targetDays / WEEKS.length;
  const currentWeek = Math.min(WEEKS.length, Math.floor(dayIndex / weekLen) + 1);
  const weeks = WEEKS.map((w) => ({
    ...w,
    startsDay: Math.round((w.week - 1) * weekLen) + 1,
    wordTarget: Math.round((core * w.week) / WEEKS.length),
    lessons: LESSONS.filter((l) => l.week === w.week).map((l) => ({ id: l.id, title: l.title, summary: l.summary })),
  }));
  return { dayIndex: dayIndex + 1, daysLeft, targetDays, newPerDay, currentWeek, weeks, remaining, core, deckLeft };
}
