# Builds public/quran/tj/N.json (tajweed colour ranges) and public/quran/wbw/N.json (word meanings)
# for the app's own Quran text. Tajweed: cpfair/quran-tajweed (CC BY 4.0), whose offsets refer to the
# Tanzil Uthmani text; they are carried over to our text letter by letter. Ayahs that do not line up are left plain.
import json, difflib, os, sys
R = os.path.join(os.path.dirname(__file__), '..')
taj = json.load(open(f'{R}/tools/data/src/tajweed.json'))
tanzil = [l.rstrip('\n').split('|')[-1] for l in open(f'{R}/tools/data/src/tanzil-uthmani.txt', encoding='utf-8') if l.strip() and not l.startswith('#')][:6236]
S = {n: json.load(open(f'{R}/public/quran/{n}.json')) for n in range(1, 115)}
GROUP = {'ghunnah': 'g', 'ikhfa': 'g', 'ikhfa_shafawi': 'g', 'iqlab': 'g', 'idghaam_ghunnah': 'g', 'idghaam_shafawi': 'g', 'qalqalah': 'q', 'madd_2': 'm',
         'madd_246': 'M', 'madd_munfasil': 'M', 'madd_muttasil': 'M', 'madd_6': 'M', 'silent': 's', 'hamzat_wasl': 's', 'lam_shamsiyyah': 's', 'idghaam_no_ghunnah': 's', 'idghaam_mutajanisayn': 's', 'idghaam_mutaqaribayn': 's'}
def base(c): return 'ء' <= c <= 'ي' or c == 'ٱ'
def key(c): return 'ا' if c in 'ٱأإآ' else c
BISM = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ '
os.makedirs(f'{R}/public/quran/tj', exist_ok=True); os.makedirs(f'{R}/public/quran/wbw', exist_ok=True)
out = {n: {} for n in S}; plain = 0; kept = 0; lost = 0
for x, t in zip(taj, tanzil):
    n, a = x['surah'], x['ayah']; ours = S[n]['ayahs'][a - 1][0]
    if not all(not (r['rule'] == 'hamzat_wasl' and t[r['start']:r['end']] != 'ٱ') and not (r['rule'] == 'lam_shamsiyyah' and t[r['start']:r['end']] != 'ل') and r['end'] <= len(t) for r in x['annotations']): plain += 1; continue
    off = len(BISM) if a == 1 and n not in (1, 9) and t.startswith(BISM) else 0
    t2 = t[off:]
    tb = [i for i, c in enumerate(t2) if base(c)]; ob = [i for i, c in enumerate(ours) if base(c)]
    sm = difflib.SequenceMatcher(None, [key(t2[i]) for i in tb], [key(ours[i]) for i in ob], autojunk=False)
    m = {}
    for blk in sm.get_matching_blocks():
        for k in range(blk.size): m[blk.a + k] = blk.b + k
    pos = {i: k for k, i in enumerate(tb)}  # tanzil char index -> base ordinal
    res = []
    for r in x['annotations']:
        s, e = r['start'] - off, r['end'] - off
        if s < 0: continue
        ords = [pos[i] for i in range(s, e) if i in pos]
        if not ords:  # the rule sits on marks only: colour the letter that carries them
            prev = [k for k, i in enumerate(tb) if i < s]
            if not prev: lost += 1; continue
            ords = [prev[-1]]
        if any(o not in m for o in ords): lost += 1; continue
        os_, oe = ob[m[ords[0]]], ob[m[ords[-1]]] + 1
        while oe < len(ours) and not base(ours[oe]) and ours[oe] != ' ' and ours[oe] not in 'ۖۗۘۙۚۛۜ۩۞': oe += 1
        res.append([os_, oe, GROUP[r['rule']]]); kept += 1
    res.sort(); clean = []
    for r in res:  # no overlaps: the earlier range wins
        if clean and r[0] < clean[-1][1]: continue
        clean.append(r)
    if clean: out[n][a] = clean
for n in S: json.dump(out[n], open(f'{R}/public/quran/tj/{n}.json', 'w'), separators=(',', ':'))
print('tajweed: ayahs left plain', plain, 'rules kept', kept, 'lost', lost)
W = sys.argv[1] if len(sys.argv) > 1 else None
if W:
    PAUSE = set('ۖۗۘۙۚۛۜ۩۞'); miss = 0
    for n in S:
        w = json.load(open(f'{W}/{n}.json')); o = {}
        for i, ay in enumerate(S[n]['ayahs']):
            mine = [k for k in ay[0].split() if not all(c in PAUSE for c in k)]; th = w[str(i + 1)]['w']
            if len(mine) != len(th): miss += 1; continue
            o[i + 1] = [[k['d'], k['e']] for k in th]
        json.dump(o, open(f'{R}/public/quran/wbw/{n}.json', 'w'), ensure_ascii=False, separators=(',', ':'))
    print('word by word: ayahs without it', miss)
