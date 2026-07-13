import re, shutil, os

# Copy fresh index.html
shutil.copy(r"D:\mywebsite-v2\index.html", r"D:\m2niwa-pages\index.html")

with open(r"D:\m2niwa-pages\index.html", 'r', encoding='utf-8') as f:
    html = f.read()

# Static cleanup
html = re.sub(r'<!-- ===== FLOATING DASHBOARD ===== -->.*?</aside>', '', html, flags=re.DOTALL)
html = re.sub(r'<div class="hero-glow hidden" id="heroGlow"></div>\s*\n?', '', html)
html = html.replace('href="#about"', 'href="#hero"')
html = re.sub(r'/\* ===== FLOATING DASHBOARD SIDEBAR.*?(?=/\* ===== LIFESTYLE MERGED)', '', html, flags=re.DOTALL)
html = re.sub(r'/\* ===== H5 TRICK #2.*?(?=/\* ===== H5 TRICK #3)', '', html, flags=re.DOTALL)
html = re.sub(r'/\* ===== FLOATING DASHBOARD JS.*?(?=/\* ===== FADE UP)', '', html, flags=re.DOTALL)
html = re.sub(r'/\* ===== SCROLL WOBBLE.*?(?=/\* ===== FADE UP)', '', html, flags=re.DOTALL)
html = re.sub(r'/\* =+\s*\n\s*H5 TRICK #2.*?(?=/\* =+\s*\n\s*H5 TRICK #3)', '', html, flags=re.DOTALL)
html = html.replace('  body { padding-bottom: 56px; }\n', '')
html = re.sub(r'\n{3,}', '\n\n', html)

with open(r"D:\m2niwa-pages\index.html", 'w', encoding='utf-8') as f:
    f.write(html)
print(f"Pages static: {len(html)} chars, data-en count: {html.count('data-en=')}")
