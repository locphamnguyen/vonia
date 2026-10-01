from audio_lib import Mix
m = Mix(duration=57)
m.bed(start=9.0, end=53.3, bpm=120, level=.04)
# mở đầu case study + vấn đề (giữ như bản trước)
m.whoosh(.05, .45, .3); m.bell(.12, 79, .12)
for i in range(6): m.blip(1.3 + i * .18, [72, 74, 76, 79, 81, 84][i], .09, (-.4, .4)[i % 2])
for i in range(6): m.add(m.tick_sig(3000), 3.0 + i * .08, .12)
m.whoosh(4.6, .4, .2, up=False)
m.blip(5.5, 76, .12); m.blip(6.4, 64, .12, -.3)
m.boom(7.0, .6, .3); m.add(m.bell_sig(233, .8) * .6, 7.0, .2)
m.chime(7.6, 72); m.whoosh(8.7, .5, .35); m.boom(9.0, .8, .3)
# các lượt chọn + tạo tag + gắn
batches = [
  dict(sel=[10.2, 10.6, 10.95, 11.25], tag=11.7, create=12.4, type=(12.9, 13.4), color=14.0, submit=15.0),
  dict(sel=[17.1, 17.4], tag=17.8, create=18.2, type=(18.5, 18.9), color=19.2, submit=19.6),
  dict(sel=[21.4], tag=21.8, create=22.1, type=(22.35, 22.55), color=22.8, submit=23.15),
  dict(sel=[33.8, 34.15, 34.5], tag=35.0, create=35.4, type=(35.7, 36.4), color=36.7, submit=37.3),
]
for b in batches:
    for i, t in enumerate(b['sel']): m.click(t); m.blip(t + .02, [72, 76, 79, 84][i % 4], .06)
    m.click(b['tag'] - .1); m.whoosh(b['tag'], .3, .12, lo=800, hi=5000)
    m.click(b['create']); m.whoosh(b['create'] + .08, .3, .12, lo=800, hi=5000)
    m.ticks(b['type'][0], b['type'][1], max(3, int((b['type'][1] - b['type'][0]) * 22)), .1)
    m.click(b['color']); m.blip(b['color'] + .02, 88, .12)
    m.click(b['submit']); m.chime(b['submit'] + .35)
# bước 2: chọn + tích 2 tag + sửa màu
for t in [24.8, 25.15, 25.5]: m.click(t)
m.click(25.9); m.click(26.7); m.chime(26.9, 74); m.click(27.1); m.chime(27.3, 77)
m.add(m.bell_sig(330, .6) * .5, 28.3, .15); m.click(29.2); m.blip(29.22, 84, .12); m.click(29.9); m.chime(30.05, 79)
m.whoosh(32.6, .35, .18, up=False)
m.whoosh(39.3, .4, .2, pan=.4); m.blip(39.95, 84, .14); m.whoosh(42.75, .4, .2, pan=.4)
# kết quả
for t in [43.4, 44.2, 44.6, 45.05]: m.click(t)
m.blip(45.3, 79, .12); m.whoosh(46.3, .5, .25)
for i in range(4): m.blip(46.85 + i * .35, [72, 76, 79, 84][i], .12, ((-1) ** i) * .3)
c = 53.45
m.whoosh(c, .5, .45); m.boom(c + .55, 1.8, .5)
m.blip(c + 1.0, 79, .14, .3); m.ticks(c + 1.5, c + 1.9, 3, .12, 1800); m.blip(c + 1.9, 84, .14, -.3)
m.boom(c + 2.25, .7, .3)
for k in range(3): m.bell(c + 2.55 + k * .33, 96, .03)
m.click(c + 3.0, .5); m.bell(c + 3.02, 84, .18, 1.8)
m.save('audio5.wav', fade_from=56.3)
