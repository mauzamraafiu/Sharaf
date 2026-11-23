# Adds the qibla bearing (degrees from true north) and the position (la, lo) to every island in public/data/prayer.json.
# Run after tools/build-data.mjs:  python3 tools/add-qibla.py path/to/salat.json
import json,math,sys
src=json.load(open(sys.argv[1]))
loc={i['islandId']:i['location'] for i in src['islands']}
d=json.load(open('public/data/prayer.json'))
KL,KO=math.radians(21.4225),math.radians(39.8262)
for i in d['islands']:
    l=loc.get(i['id'])
    if not l: continue
    i['la']=round(l['lat'],3); i['lo']=round(l['long'],3)
    a,b=math.radians(l['lat']),math.radians(l['long']); dl=KO-b
    i['q']=round((math.degrees(math.atan2(math.sin(dl)*math.cos(KL),math.cos(a)*math.sin(KL)-math.sin(a)*math.cos(KL)*math.cos(dl)))+360)%360,1)
json.dump(d,open('public/data/prayer.json','w'),ensure_ascii=False,separators=(',',':'))
