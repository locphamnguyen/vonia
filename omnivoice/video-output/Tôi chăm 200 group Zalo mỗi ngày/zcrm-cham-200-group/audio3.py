from audio_lib import Mix
m = Mix(duration=30)
m.bed(start=3.0, end=26.4, bpm=120)
# intro: 200 chấm dồn dập -> câu chuyện
m.whoosh(.02, .45, .35)
m.ticks(.2, 1.0, 40, .06, 3200)
for t in [.9, 1.0, 1.1, 1.2]: m.blip(t, 88, .05)
m.add(m.kick_sig(.3), .35, .45); m.add(m.kick_sig(.3), .6, .45)
m.bell(1.9, 84, .14); m.bell(2.0, 91, .1)
m.whoosh(2.95, .6, .4); m.boom(3.0, .8, .35)
# ch1: gõ + gửi + chọn + chia sẻ
m.ticks(3.35, 4.55, 30, .1)
m.click(4.65); m.whoosh(4.7, .35, .25, lo=1500, hi=9000); m.blip(4.8, 79, .12); m.blip(5.05, 84, .1)
m.blip(5.8, 72, .1, -.3)
m.add(m.bell_sig(330, .6) * .5, 6.55, .15)
m.blip(6.75, 76, .1); m.blip(6.95, 79, .1); m.click(7.35)
# ch2: 2 lượt chia sẻ
for t in [9.7, 10.1, 10.45, 10.75, 11.1, 11.7, 12.5, 12.8, 13.05, 13.3, 13.75]: m.click(t)
for k in range(7): m.blip(11.1 + k * .03, 72 + [0, 2, 4, 7, 9, 12, 14][k], .06); m.blip(13.3 + k * .03, 72 + [0, 2, 4, 7, 9, 12, 14][k], .06)
m.bell(11.85, 88, .1); m.bell(13.9, 91, .1)
for i in range(6): m.blip(14.9 + i * .3, [76, 79, 81, 84, 86, 88][i], .09, ((-1) ** i) * .4)
for i in range(20): m.add(m.tick_sig(2400 + i * 60), 14.7 + i * .07, .08)
m.add(m.bell_sig(330, .9) * .4, 15.7, .25)
m.chime(17.2)
# ch3: gắn kịch bản cho group
for t in [18.35, 18.8, 19.75]: m.click(t)
m.chime(19.95, 76)
for i, t in enumerate([20.75, 21.95, 23.15]): m.whoosh(t - .25, .3, .1, lo=1500, hi=7000); m.blip(t, [76, 79, 84][i], .14)
for t in [21.3, 22.5, 23.75]: m.blip(t, 67, .08, -.3)
# ch4 + CTA
m.ticks(24.6, 25.6, 20, .1, 2000)
c = 26.45
m.whoosh(c, .5, .45); m.boom(c + .55, 1.8, .5)
m.blip(c + 1.0, 79, .14, .3); m.ticks(c + 1.5, c + 1.9, 3, .12, 1800); m.blip(c + 1.9, 84, .14, -.3)
m.boom(c + 2.25, .7, .3)
for k in range(3): m.bell(c + 2.55 + k * .33, 96, .03)
m.click(c + 3.0, .5); m.bell(c + 3.02, 84, .18, 1.8)
m.save('audio3.wav', fade_from=29.3)
