# make-ico.py — 把交付的原始 PNG 直接转成多尺寸 Windows ICO,**不重绘、不改色**。
# 只在图标源更新时手动跑一次;产物 app/assets/yufeng.ico 要提交。
#   python app/scripts/make-ico.py
import sys
from pathlib import Path
from PIL import Image

SIZES = [16, 24, 32, 48, 64, 128, 256]

def main():
    assets = Path(__file__).resolve().parent.parent / "assets"
    src, dst = assets / "yufeng.png", assets / "yufeng.ico"
    img = Image.open(src).convert("RGBA")
    img.save(dst, format="ICO", sizes=[(s, s) for s in SIZES])
    with Image.open(dst) as ico:
        got = sorted(ico.ico.sizes())
    print(f"{dst}  {dst.stat().st_size} bytes  sizes={got}")

if __name__ == "__main__":
    sys.exit(main())
