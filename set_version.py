import re, os
tag = os.environ.get("GITHUB_REF_NAME", "0.0.0").lstrip("v")
with open("main.py", encoding="utf-8") as f:
    s = f.read()
s = re.sub(r'APP_VERSION = "[^"]*"', f'APP_VERSION = "{tag}"', s)
with open("main.py", "w", encoding="utf-8") as f:
    f.write(s)
print("APP_VERSION set to", tag)
