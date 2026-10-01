import numpy as np, wave
from scipy.signal import butter, sosfilt, fftconvolve
SR=48000; D=30.0; N=int(SR*D)
L=np.zeros(N); R=np.zeros(N)
rs=np.random.default_rng(3)
def at(t): return int(t*SR)
def add(sig,t,g=1.0,pan=0.0):
    i=at(t); j=min(N,i+len(sig))
    if j<=i: return
    s=sig[:j-i]*g
    L[i:j]+=s*np.sqrt((1-pan)/2)*1.414; R[i:j]+=s*np.sqrt((1+pan)/2)*1.414
def tt(d): return np.arange(int(d*SR))/SR
def env(d,a=.005,dec=.2):
    x=tt(d); return np.minimum(1,x/a)*np.exp(-x/dec)
def bp(sig,lo,hi): return sosfilt(butter(2,[lo,hi],'band',fs=SR,output='sos'),sig)
def hp(sig,f): return sosfilt(butter(2,f,'high',fs=SR,output='sos'),sig)
def lp(sig,f): return sosfilt(butter(2,f,'low',fs=SR,output='sos'),sig)
def kick(d=.45):
    x=tt(d); f=45+110*np.exp(-x/.035); ph=2*np.pi*np.cumsum(f)/SR
    return np.sin(ph)*np.exp(-x/.16)+.3*np.sin(ph*2)*np.exp(-x/.02)
def hat(): return hp(rs.standard_normal(int(.06*SR)),7000)*env(.06,.001,.018)
def pluck(f,d=.35,dec=.12):
    x=tt(d); return (np.sin(2*np.pi*f*x)+.4*np.sin(4*np.pi*f*x)+.15*np.sin(6*np.pi*f*x))*env(d,.002,dec)
def bell(f,d=1.6):
    x=tt(d); return sum(a*np.sin(2*np.pi*f*m*x)*np.exp(-x/(dec)) for m,a,dec in [(1,1,.6),(2.76,.4,.25),(5.4,.2,.12),(2,.3,.4)])*np.minimum(1,x/.002)
def whoosh(d,lo=300,hi=6000,up=True):
    n=int(d*SR); x=np.linspace(0,1,n); noise=rs.standard_normal(n)
    out=np.zeros(n); blk=1024
    for k in range(0,n,blk):
        p=x[k] if up else 1-x[k]; c=lo*(hi/lo)**p
        out[k:k+blk]=bp(noise[max(0,k-2048):k+blk],c*.6,min(c*1.6,20000))[-len(out[k:k+blk]):]
    shape=np.sin(np.pi*x)**2 if not up else x**2.2
    return out*shape
def tick(f=3000): return bp(rs.standard_normal(int(.02*SR)),f*.7,f*1.4)*env(.02,.0005,.004)
def boom(d=2.2):
    x=tt(d); f=30+70*np.exp(-x/.12); ph=2*np.pi*np.cumsum(f)/SR
    return np.sin(ph)*np.exp(-x/.7)+lp(rs.standard_normal(len(x)),900)*np.exp(-x/.18)*.8
note=lambda m:440*2**((m-69)/12)

# ---- bed: bright pop 120 bpm, I–V–vi–IV in C, 3.0 → 26.4
chords=[[60,64,67],[55,59,62],[57,60,64],[53,57,60]]
roots=[48,43,45,41]
duck=np.ones(N)
for b in np.arange(2.5,26.4,.5):
    add(kick(.35),b,.75)
    i=at(b); k=int(.25*SR); duck[i:i+k]=np.minimum(duck[i:i+k],1-.7*np.exp(-np.arange(min(k,N-i))/SR/.08))
    add(hat(),b+.25,.16,.3)
    if int(round((b-2.5)*2))%2==1: add(hp(rs.standard_normal(int(.12*SR)),1500)*env(.12,.001,.05),b,.18)  # clap
pad=np.zeros(N)
for bar,t0 in enumerate(np.arange(2.5,26.4,2.0)):
    ch=chords[bar%4]; d=2.05; x=tt(d)
    s=sum(sum(np.sin(2*np.pi*note(m+12)*h*x+h)/h for h in (1,2,3)) for m in ch)
    s*=np.minimum(1,x/.05)*np.minimum(1,(d-x)/.05)
    i=at(t0); j=min(N,i+len(s)); pad[i:j]+=lp(s,2600)[:j-i]
    for e in np.arange(t0,t0+2,.5):
        if e<26.4: add(lp(pluck(note(roots[bar%4]),.3,.09),700),e+.25,.5)
    for q,m in enumerate([0,1,2,1,0,2,1,2]):
        e=t0+q*.25
        if e<26.4: add(pluck(note(ch[m]+24),.25,.07),e,.07,(-.5,.5)[q%2])
pad*=duck*.045; L+=pad; R+=pad
def click(t0,g=.35): add(tick(4200),t0,g); add(pluck(1900,.05,.01),t0,g*.4)
def blip(t0,m,g=.12,pan=0): add(pluck(note(m),.25,.06),t0,g,pan)
# intro: three stabs on the three lines
add(whoosh(.45,300,6000),.05,.35)
add(bell(note(79),1.6),.3,.14)
for i,t0 in enumerate([.35,.7,1.05]): add(kick(.3),t0,.5); add(bell(note([72,76,79][i]+12),1.2),t0,.1)
add(whoosh(.6,200,5000),2.45,.4); add(boom(.8),2.5,.35)
for c in [11.0,18.5]: add(whoosh(.35,500,6000,False),c-.28,.18)
add(whoosh(.4,300,4000),18.45,.2,.4); add(whoosh(.4,300,4000),21.35,.2,.4)
taps=[3.62,3.95,4.85, 4.95+.5,4.95+.9,4.95+1.2,4.95+1.5,4.95+1.9,4.95+2.45,
      11.15+.45,11.15+.95,11.15+1.35,11.15+1.65,11.15+1.95,11.15+2.35,11.15+2.85, 19.45,19.9,21.05]
for t0 in taps: click(t0)
for k in range(12): add(tick(2600+(k%4)*250),3.2+k*.02 if k<3 else 4.05+(k-3)*.07,.1)
for i in range(7): blip(4.95+1.9+i*.04,72+[0,2,4,7,9,12,14][i],.07,(i/3-1))
for i in range(7): blip(11.15+2.35+i*.04,72+[0,2,4,7,9,12,14][i],.07,(i/3-1))
add(bell(note(88),1.0),7.6,.1); add(bell(note(88),1.0),14.1,.1)
for i in range(8): blip(8.35+i*.25,[76,79,81,84][i%4],.09,((-1)**i)*.4)
for t0 in [9.0,9.6,10.1]: blip(t0,64,.08)
for i,m in enumerate([72,76,79,84]): add(bell(note(m+12),1.4),10.4+i*.05,.06)
for i in range(6): blip(14.6+(i+1)*.225,[76,79,81,84,86,88][i],.09,((-1)**i)*.4)
x=tt(.9); add(np.sin(2*np.pi*330*x)*env(.9,.05,.4)*.25,15.95,.35)
for i in range(12): add(tick(2800+i*80),16.85+i*.075,.12)
for i,m in enumerate([72,76,79,84]): add(bell(note(m+12),1.4),17.75+i*.05,.06)
for k in range(20): add(tick(2600+(k%5)*200),20.35+k*.03,.1)
add(bell(note(88),1.0),21.25,.08)
for i,t0 in enumerate([22.1,23.2,24.3]): blip(t0,[76,79,84][i],.14); add(whoosh(.3,1500,7000),t0-.25,.1)
add(bell(note(91),.9),25.0,.12); add(bell(note(96),.9),25.08,.08)
# CTA
add(whoosh(.5,200,8000),26.45,.45); add(boom(1.8),27.0,.5)
for m in [60,64,67,72,76]: add(bell(note(m),2.2),27.0,.05)
blip(27.45,79,.14,.3)
for k in range(3): add(tick(1800),27.95+k*.13,.12)
blip(28.35,84,.14,-.3)
add(boom(.7),28.7,.3)
for m in [48,60,64,67,72,79]: add(bell(note(m),2.0),28.7,.05)
for k in range(3): add(bell(note(96),.5),29.0+k*.33,.03)
click(29.45,.5); add(bell(note(84),1.8),29.47,.18); add(bell(note(91),1.6),29.52,.1)
x=tt(3.0); s=sum(np.sin(2*np.pi*note(m)*x)+.3*np.sin(4*np.pi*note(m)*x) for m in [48,55,60,64,67,72])
add(lp(s,2000)*np.minimum(1,x/.3)*np.minimum(1,(3.0-x)/1.0),27.0,.045)
ir_t=tt(1.4); ir=rs.standard_normal(len(ir_t))*np.exp(-ir_t/.3); ir=lp(ir,6000); ir/=np.abs(ir).sum()**.5*8
L=L+fftconvolve(L,ir)[:N]*.45; R=R+fftconvolve(R,ir)[:N]*.45
fade=np.ones(N); fade[at(29.3):]=np.linspace(1,0,N-at(29.3)); L*=fade; R*=fade
m=np.tanh(np.stack([L,R],1)*1.2); m/=np.abs(m).max()/0.89
with wave.open('audio2.wav','wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((m*32767).astype('<i2').tobytes())
print('ok')
