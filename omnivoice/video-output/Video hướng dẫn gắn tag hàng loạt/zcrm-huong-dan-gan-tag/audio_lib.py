"""Bộ tổng hợp âm thanh cho video motion — không cần file nhạc, không lo bản quyền.

Dùng:  from audio_lib import Mix
       m = Mix(duration=30)
       m.bed(start=2.5, end=26.4, bpm=120)          # trống + bass + hợp âm + arp
       m.click(4.85); m.blip(7.6, 76); m.whoosh(2.45, .6); m.boom(27.0)
       m.save('audio.wav', fade_from=29.3)
Mọi mốc tính bằng giây, phải khớp với mốc trong HTML (tap(), seg(t, a, b)...).
"""
import wave
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve

SR = 48000
note = lambda m: 440 * 2 ** ((m - 69) / 12)   # số MIDI -> Hz (60 = Đô giữa)


class Mix:
    def __init__(self, duration, seed=3):
        self.N = int(SR * duration); self.L = np.zeros(self.N); self.R = np.zeros(self.N)
        self.rs = np.random.default_rng(seed)

    # ---------- nền tảng ----------
    def at(self, t): return int(t * SR)
    def tt(self, d): return np.arange(int(d * SR)) / SR
    def env(self, d, a=.005, dec=.2): x = self.tt(d); return np.minimum(1, x / a) * np.exp(-x / dec)
    def bp(self, s, lo, hi): return sosfilt(butter(2, [lo, hi], 'band', fs=SR, output='sos'), s)
    def hp(self, s, f): return sosfilt(butter(2, f, 'high', fs=SR, output='sos'), s)
    def lp(self, s, f): return sosfilt(butter(2, f, 'low', fs=SR, output='sos'), s)
    def add(self, sig, t, g=1.0, pan=0.0):
        i = self.at(t); j = min(self.N, i + len(sig))
        if j <= i or i < 0: return
        s = sig[:j - i] * g
        self.L[i:j] += s * np.sqrt((1 - pan) / 2) * 1.414; self.R[i:j] += s * np.sqrt((1 + pan) / 2) * 1.414

    # ---------- nhạc cụ ----------
    def kick_sig(self, d=.4):
        x = self.tt(d); f = 45 + 110 * np.exp(-x / .035); ph = 2 * np.pi * np.cumsum(f) / SR
        return np.sin(ph) * np.exp(-x / .16) + .3 * np.sin(ph * 2) * np.exp(-x / .02)
    def hat_sig(self): return self.hp(self.rs.standard_normal(int(.06 * SR)), 7000) * self.env(.06, .001, .018)
    def pluck_sig(self, f, d=.35, dec=.12):
        x = self.tt(d); return (np.sin(2*np.pi*f*x) + .4*np.sin(4*np.pi*f*x) + .15*np.sin(6*np.pi*f*x)) * self.env(d, .002, dec)
    def bell_sig(self, f, d=1.6):
        x = self.tt(d)
        return sum(a*np.sin(2*np.pi*f*m*x)*np.exp(-x/dc) for m, a, dc in [(1, 1, .6), (2.76, .4, .25), (5.4, .2, .12), (2, .3, .4)]) * np.minimum(1, x/.002)
    def whoosh_sig(self, d, lo=300, hi=6000, up=True):
        n = int(d * SR); x = np.linspace(0, 1, n); noise = self.rs.standard_normal(n); out = np.zeros(n); blk = 1024
        for k in range(0, n, blk):
            p = x[k] if up else 1 - x[k]; c = lo * (hi / lo) ** p
            seg = self.bp(noise[max(0, k - 2048):k + blk], c * .6, min(c * 1.6, 20000)); out[k:k + blk] = seg[-len(out[k:k + blk]):]
        return out * (x ** 2.2 if up else np.sin(np.pi * x) ** 2)
    def tick_sig(self, f=3000): return self.bp(self.rs.standard_normal(int(.02 * SR)), f * .7, f * 1.4) * self.env(.02, .0005, .004)
    def boom_sig(self, d=2.2):
        x = self.tt(d); f = 30 + 70 * np.exp(-x / .12); ph = 2 * np.pi * np.cumsum(f) / SR
        return np.sin(ph) * np.exp(-x / .7) + self.lp(self.rs.standard_normal(len(x)), 900) * np.exp(-x / .18) * .8

    # ---------- hiệu ứng gắn với hình ----------
    def click(self, t, g=.35):          # chạm tay / bấm nút
        self.add(self.tick_sig(4200), t, g); self.add(self.pluck_sig(1900, .05, .01), t, g * .4)
    def blip(self, t, midi, g=.12, pan=0): self.add(self.pluck_sig(note(midi), .25, .06), t, g, pan)   # dấu tích, chip bật ra
    def bell(self, t, midi, g=.1, d=1.4): self.add(self.bell_sig(note(midi), d), t, g)                 # thành công, thông báo
    def whoosh(self, t, d=.4, g=.25, up=True, lo=300, hi=6000, pan=0): self.add(self.whoosh_sig(d, lo, hi, up), t, g, pan)  # chuyển cảnh
    def boom(self, t, d=1.8, g=.5): self.add(self.boom_sig(d), t, g)                                    # cú chốt lớn
    def ticks(self, t0, t1, n, g=.12, f=2600):                                                        # gõ chữ, đếm số
        for k in range(n): self.add(self.tick_sig(f + (k % 5) * 250), t0 + (t1 - t0) * k / max(1, n), g, ((-1) ** k) * .2)
    def chime(self, t, root=72, g=.06):                                                               # hợp âm "xong"
        for i, m in enumerate([0, 4, 7, 12]): self.bell(t + i * .05, root + m + 12, g)
    def riser(self, t, d=1.1, g=.5):
        x = self.tt(d); f = 180 * (8 ** (x / d)); ph = 2 * np.pi * np.cumsum(f) / SR
        self.add((np.sin(ph) * .3 + self.whoosh_sig(d, 200, 12000)) * (x / d) ** 2, t, g)

    # ---------- nhạc nền: pop sáng, 4 hợp âm C–G–Am–F ----------
    def bed(self, start, end, bpm=120, chords=None, roots=None, level=.045):
        beat = 60 / bpm; bar = beat * 4
        chords = chords or [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]]
        roots = roots or [48, 43, 45, 41]
        duck = np.ones(self.N)
        for i, b in enumerate(np.arange(start, end, beat)):
            self.add(self.kick_sig(.35), b, .75)
            a = self.at(b); k = int(.25 * SR)
            duck[a:a + k] = np.minimum(duck[a:a + k], 1 - .7 * np.exp(-np.arange(min(k, self.N - a)) / SR / .08))
            self.add(self.hat_sig(), b + beat / 2, .16, .3)
            if i % 2: self.add(self.hp(self.rs.standard_normal(int(.12 * SR)), 1500) * self.env(.12, .001, .05), b, .18)
        pad = np.zeros(self.N)
        for n, t0 in enumerate(np.arange(start, end, bar)):
            ch = chords[n % 4]; d = bar + .05; x = self.tt(d)
            s = sum(sum(np.sin(2*np.pi*note(m+12)*h*x + h) / h for h in (1, 2, 3)) for m in ch)
            s *= np.minimum(1, x / .05) * np.minimum(1, (d - x) / .05)
            a = self.at(t0); j = min(self.N, a + len(s)); pad[a:j] += self.lp(s, 2600)[:j - a]
            for e in np.arange(t0, t0 + bar, beat):
                if e < end: self.add(self.lp(self.pluck_sig(note(roots[n % 4]), .3, .09), 700), e + beat / 2, .5)
            for q, m in enumerate([0, 1, 2, 1, 0, 2, 1, 2]):
                e = t0 + q * beat / 2
                if e < end: self.add(self.pluck_sig(note(ch[m] + 24), .25, .07), e, .07, (-.5, .5)[q % 2])
        pad *= duck * level; self.L += pad; self.R += pad

    def save(self, path, fade_from=None, reverb=.45):
        ir_t = self.tt(1.4); ir = self.rs.standard_normal(len(ir_t)) * np.exp(-ir_t / .3); ir = self.lp(ir, 6000); ir /= np.abs(ir).sum() ** .5 * 8
        L = self.L + fftconvolve(self.L, ir)[:self.N] * reverb; R = self.R + fftconvolve(self.R, ir)[:self.N] * reverb
        if fade_from is not None:
            fd = np.ones(self.N); a = self.at(fade_from); fd[a:] = np.linspace(1, 0, self.N - a); L *= fd; R *= fd
        m = np.tanh(np.stack([L, R], 1) * 1.2); m /= np.abs(m).max() / .89
        with wave.open(path, 'wb') as w:
            w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((m * 32767).astype('<i2').tobytes())
        print('saved', path)
