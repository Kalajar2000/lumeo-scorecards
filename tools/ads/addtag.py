import json,sys
p='tags_manual.json';t=json.load(open(p))
k,angle,fmt,av,desc=sys.argv[1:6]
e={'desc':desc,'src':'Ad copy and thumbnail in Ads Manager, tagged by Claude (my read)'}
if angle!='-': e['angle']=angle
if fmt!='-': e['format']=fmt
if av!='-': e['avatar']=av
t[k]=e;json.dump(t,open(p,'w'),indent=1,ensure_ascii=False);print('ok',k)
