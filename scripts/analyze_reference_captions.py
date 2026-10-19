import subprocess
from pathlib import Path
from PIL import Image, ImageDraw
root=Path(__file__).resolve().parents[1]
out=root/'work/reference-style'
out.mkdir(parents=True,exist_ok=True)
ffmpeg=next((root/'work/tools/ffmpeg-essentials').glob('*/bin/ffmpeg.exe'))
times=[0.10,0.30,0.55,0.80,1.05,1.30,1.60,1.95,2.30,3.55,5.2,8.5,10.5,14.5,19.5,24.5,31.5,43.5]
sheet=Image.new('RGB',(540*3,175*12),'#202020')
for ref,source in enumerate(sorted((root/'samples').glob('copy*'))):
    for i,t in enumerate(times):
        frame=out/f'{ref}-{i:02}.png'
        subprocess.run([str(ffmpeg),'-hide_banner','-loglevel','error','-y','-ss',str(t),'-i',str(source),'-frames:v','1',str(frame)],check=True)
        with Image.open(frame) as img:
            crop=img.crop((0,1330,1080,1650)).resize((540,160))
            idx=ref*len(times)+i
            x=idx%3*540;y=idx//3*175
            sheet.paste(crop,(x,y))
            ImageDraw.Draw(sheet).text((x+8,y+158),f'Copy {ref+1} | {t:.2f}s',fill='white')
sheet.save(out/'caption-timing-sheet.jpg')
print(out/'caption-timing-sheet.jpg')
