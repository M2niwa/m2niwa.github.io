"""Sync local index.html to GitHub Pages static version.

Usage: cd D:/m2niwa-pages && python3 sync.py

Strips dynamic content (dashboard, WebSocket) that GitHub Pages can't serve,
and copies SEO files (robots.txt / sitemap.xml) alongside.
"""
import re, shutil, os

SRC = r"D:\mywebsite-v2\index.html"
DST = r"D:\m2niwa-pages\index.html"

# Copy fresh
shutil.copy(SRC, DST)

with open(DST, 'r', encoding='utf-8') as f:
    html = f.read()

# Strip dynamic-only elements
html = re.sub(r'<!-- ===== FLOATING DASHBOARD ===== -->.*?</aside>', '', html, flags=re.DOTALL)
html = re.sub(r'/\* ===== FLOATING DASHBOARD SIDEBAR.*?(?=/\* ===== LIFESTYLE MERGED)', '', html, flags=re.DOTALL)
html = re.sub(r'/\* ===== FLOATING DASHBOARD JS.*?(?=/\* ===== FADE UP)', '', html, flags=re.DOTALL)
html = re.sub(r'/\* ===== SCROLL WOBBLE.*?(?=/\* ===== FADE UP)', '', html, flags=re.DOTALL)
html = html.replace('  body { padding-bottom: 56px; }\n', '')
html = re.sub(r'\n{3,}', '\n\n', html)

with open(DST, 'w', encoding='utf-8') as f:
    f.write(html)

# Copy SEO files (safe if absent)
for name in ("robots.txt", "sitemap.xml"):
    src = os.path.join(os.path.dirname(SRC), name)
    if os.path.exists(src):
        shutil.copy(src, os.path.join(os.path.dirname(DST), name))

# Copy image assets (wine card photos + credits)
src_assets = os.path.join(os.path.dirname(SRC), "assets")
dst_assets = os.path.join(os.path.dirname(DST), "assets")
if os.path.isdir(src_assets):
    if os.path.isdir(dst_assets):
        shutil.rmtree(dst_assets)
    shutil.copytree(src_assets, dst_assets)

# Copy game folder (苍澜废舰 Roguelike, 纯静态)
src_game = os.path.join(os.path.dirname(SRC), "sea-bazaar")
dst_game = os.path.join(os.path.dirname(DST), "sea-bazaar")
if os.path.isdir(src_game):
    if os.path.isdir(dst_game):
        shutil.rmtree(dst_game)
    shutil.copytree(src_game, dst_game)

print(f"Pages static: {len(html)} chars, data-en count: {html.count('data-en=')}")
