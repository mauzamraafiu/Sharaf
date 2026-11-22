# Builds the three files the Quran search reads: English, Dhivehi and Arabic without its marks.
# Each is a list of 114 lists of ayah texts. Run: python3 tools/build-search.py
import json, re, unicodedata
en, dv, ar = [], [], []
for n in range(1, 115):
    d = json.load(open(f'public/quran/{n}.json', encoding='utf-8'))
    en.append([a[1] for a in d['ayahs']]); dv.append([a[2] for a in d['ayahs']])
    out = []
    for a in d['ayahs']:
        s = ''.join(c for c in a[0] if not unicodedata.combining(c) and c not in 'ـۖۗۘۙۚۛۜ۩۞ۣ۪ۭ۟۠ۡۢۤۥۦۧۨ۫۬')
        s = re.sub('[ٱأإآ]', 'ا', s).replace('ى', 'ي').replace('ة', 'ه')
        out.append(re.sub(r'\s+', ' ', s).strip())
    ar.append(out)
for name, data in (('en', en), ('dv', dv), ('ar', ar)):
    json.dump(data, open(f'public/quran/find-{name}.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
