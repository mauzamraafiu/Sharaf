# Second English translation (Talal Itani, plain modern English), one file per surah: a list of ayah texts.
# Source: fawazahmed0/quran-api, edition eng-talalitani. "God" is written "Allah", as in the translator's own Allah edition.
import json, re
rows = json.load(open('tools/data/src/eng-talalitani.json', encoding='utf-8'))['quran']
by = {}
for r in rows: by.setdefault(r['chapter'], []).append(re.sub(r'\bGod\b', 'Allah', r['text'].strip()))
for n in range(1, 115):
    want = len(json.load(open(f'public/quran/{n}.json', encoding='utf-8'))['ayahs'])
    assert len(by[n]) == want, (n, len(by[n]), want)
    json.dump(by[n], open(f'public/quran/en2/{n}.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('ok', sum(len(v) for v in by.values()))
