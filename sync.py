import re, shutil

# Copy fresh index.html
shutil.copy(r"D:\mywebsite-v2\index.html", r"D:\m2niwa-pages\index.html")

with open(r"D:\m2niwa-pages\index.html", 'r', encoding='utf-8') as f:
    html = f.read()

# Static cleanup — only what still exists in current version
html = re.sub(r'<!-- ===== FLOATING DASHBOARD ===== -->.*?</aside>', '', html, flags=re.DOTALL)
html = re.sub(r'<div class="hero-glow hidden" id="heroGlow"></div>\s*\n?', '', html)
html = html.replace('href="#about"', 'href="#hero"')

# Remove CSS: H5 Trick #1 scroll reveal (dashboard JS CSS)
html = re.sub(r'/\* ===== H5 TRICK #1: Scroll reveal ===== \*/\n\.reveal[^}]*}\n\.reveal\.visible[^}]*}', '', html)

# Remove JS: FLOATING DASHBOARD JS block
html = re.sub(r'/\* ===== FLOATING DASHBOARD JS.*?(?=/\* ===== FADE UP ANIMATION)', '', html, flags=re.DOTALL)

# Remove JS: H5 Trick #1 scroll reveal
html = re.sub(r'/\*\s*\n\s*H5 TRICK #1: Intersection Observer.*?(?=/\*\s*\n\s*H5 TRICK #3)', '', html, flags=re.DOTALL)

# Mobile padding (dashboard)
html = html.replace('  body { padding-bottom: 56px; }\n', '')

# Clean excess newlines
html = re.sub(r'\n{3,}', '\n\n', html)

with open(r"D:\m2niwa-pages\index.html", 'w', encoding='utf-8') as f:
    f.write(html)
print(f"Pages static: {len(html)} chars, data-en count: {html.count('data-en=')}")
