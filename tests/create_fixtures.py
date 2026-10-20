"""Create deterministic, clearly synthetic UI fixtures in a NEW directory.
Usage: python tests/create_fixtures.py [--dest /absolute/new-directory]
Existing directories are never overwritten. FFmpeg is required.
"""
import argparse
from pathlib import Path
import shutil
import subprocess

from PIL import Image, ImageDraw


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dest",default=str(Path.cwd()/".test-media"))
    args=parser.parse_args()
    if not shutil.which("ffmpeg"):
        raise SystemExit("请先安装 FFmpeg")
    root=Path(args.dest).absolute()
    root.mkdir(parents=True,exist_ok=False)
    (root/"images").mkdir();(root/"video").mkdir()
    im=Image.new("RGB",(1280,800))
    pixels=im.load()
    for y in range(800):
        for x in range(1280):
            pixels[x,y]=(int(30+x*100/1280),int(80+y*100/800),int(95+(x+y)*60/2080))
    draw=ImageDraw.Draw(im)
    draw.rectangle((110,110,1170,690),outline=(210,235,218),width=3)
    draw.text((160,180),"MediaSlim X - synthetic validation media",fill="white")
    im.save(root/"images"/"landscape.jpg",quality=100)
    im.save(root/"images"/"static.webp",quality=100)
    alpha=Image.new("RGBA",(800,500),(40,120,90,100))
    ImageDraw.Draw(alpha).ellipse((150,100,650,400),fill=(70,160,110,180))
    alpha.save(root/"images"/"alpha.png",compress_level=0)
    Image.new("RGBA",(1,1),(1,2,3,80)).save(root/"images"/"pixel.png",optimize=True)
    (root/"images"/"damaged.jpg").write_bytes(b"intentionally damaged synthetic media")
    Image.new("RGB",(32,32),"red").save(root/"images"/"unsupported.gif")
    subprocess.run(["ffmpeg","-nostdin","-v","error","-f","lavfi","-i","testsrc2=size=320x180:rate=24",
                    "-f","lavfi","-i","sine=frequency=440:sample_rate=44100","-t","2","-c:v","libx264",
                    "-crf","0","-pix_fmt","yuv420p","-threads","1","-c:a","aac",str(root/"video"/"sample.mp4")],check=True)
    print("合成验证素材：",root)
    print("7 个候选：5 个支持、1 个故意损坏、1 个暂不支持。不代表真实网站收益。")


if __name__=="__main__":
    main()
