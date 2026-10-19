import json
import argparse
from pathlib import Path
from PIL import ImageFont
root=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser()
parser.add_argument('--font',default=str(root/'work/fonts/Montserrat-Black.ttf'))
parser.add_argument('--plan',type=Path,default=root/'work/plans/full.json')
parser.add_argument('--transcripts',type=Path,default=root/'work/transcripts')
parser.add_argument('--output',type=Path,default=root/'work/reference-style/caption-plan.json')
args=parser.parse_args()
font=ImageFont.truetype(args.font,78)
plan=json.loads(args.plan.read_text(encoding='utf-8-sig'))
entries=[]; offset=0; groups=[]
for clip in plan['clips']:
    data=json.loads((args.transcripts/f"{Path(clip['source']).stem}.json").read_text(encoding='utf-8'))
    words=[dict(w,start=offset+w['start']-clip['in'],end=offset+w['end']-clip['in'])
           for s in data['segments'] for w in s['words'] if w['start']>=clip['in'] and w['end']<=clip['out']]
    for first in range(0,len(words),4):
        group=words[first:first+4]
        start=group[0]['start'];end=min(offset+clip['out']-clip['in'],group[-1]['end']+0.06,
                                      words[first+4]['start'] if first+4<len(words) else float('inf'))
        lines=[[]]
        for slot,w in enumerate(group):
            text=w['text'].strip().upper()
            width=font.getlength(text)
            if lines[-1] and sum(v[2] for v in lines[-1])+24*len(lines[-1])+width>850:
                lines.append([])
            lines[-1].append((slot,w,width,text))
        for row,line in enumerate(lines):
            lineWidth=sum(v[2] for v in line)+24*(len(line)-1)
            x=540-lineWidth/2
            y=1490+(row-(len(lines)-1)/2)*76
            for slot,w,width,text in line:
                # Native positions are normalized about the canvas centre.
                position={'x':(x+width/2-540)/540,'y':(960-y)/960}
                activeEnd=group[slot+1]['start'] if slot+1<len(group) else end
                for a,b,highlight in [(start,w['start'],False),(w['start'],activeEnd,True),(activeEnd,end,False)]:
                    if b-a>0.015:
                        entries.append({'text':text,'start':round(a,6),'duration':round(b-a,6),'highlight':highlight,'slot':slot,**position})
                x+=width+24
        groups.append({'start':start,'end':end,'text':' '.join(w['text'].strip() for w in group)})
    offset+=clip['out']-clip['in']
out=args.output
out.parent.mkdir(parents=True,exist_ok=True)
out.write_text(json.dumps({'editPlan':plan,'fontPath':args.font,'fontSize':9.75,
                           'styleApproximation':True,'entries':entries,'groups':groups},ensure_ascii=False,indent=2),encoding='utf-8')
print(f'{len(entries)} editable text states, {len(groups)} phrase groups; {offset:.2f}s')
