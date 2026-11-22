# Second English translation (Talal Itani, plain modern English), one file per surah: a list of ayah texts.
# Source: fawazahmed0/quran-api, edition eng-talalitani. The wording is the translator's own and is not changed.
import json, re
rows = json.load(open('tools/data/src/eng-talalitani.json', encoding='utf-8'))['quran']
by = {}
for r in rows: by.setdefault(r['chapter'], []).append(r['text'].strip())
for n in range(1, 115):
    want = len(json.load(open(f'public/quran/{n}.json', encoding='utf-8'))['ayahs'])
    assert len(by[n]) == want, (n, len(by[n]), want)
    json.dump(by[n], open(f'public/quran/enp/{n}.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('ok', sum(len(v) for v in by.values()))
