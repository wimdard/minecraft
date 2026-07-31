#!/usr/bin/env python3
import os
p = os.path.expanduser("~/Minecraft/Styles/topbar.css")
c = open(p, encoding="utf-8").read()
old = "    transition: opacity .5s ease, transform .4s ease;"
new = "  transition: opacity .28s ease, transform .28s cubic-bezier(.2,.8,.2,1);"
if "transition: opacity .28s ease, transform .28s" in c:
    print("[i] Уже синхронизировано")
elif old in c:
    open(p+".bak_p2speed","w",encoding="utf-8").write(c)
    open(p,"w",encoding="utf-8").write(c.replace(old, new, 1))
    print("[ok] topbar.css: вторая панель в темпе первой (.28s)")
else:
    print("[!!] transition .settings-panel-2 не найден — покажи grep -n 'transition' topbar.css")
