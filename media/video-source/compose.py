"""Compose segments: panel PNG + phone recording + narration + captions -> final 1920x1080 MP4."""
import json, re, subprocess
L = json.load(open("lines.json")); D = json.load(open("durations.json"))
REC = {0: ("home", 2.0), 1: ("sensors", 1.5), 2: ("setup", 0.0), 3: ("watch", 1.0), 4: ("replay", 0.4)}
PAD = 0.7

def ts(t):
    h = int(t // 3600); m = int(t % 3600 // 60); s = t % 60
    return f"{h}:{m:02d}:{s:05.2f}"

def ass(i, dur, phone):
    # one caption per sentence, timed by character share; wrap under the right column or centred on full slides
    sents = [s for s in re.split(r"(?<=[.!?])\s+", L[i]) if s]
    total = sum(len(s) for s in sents); t = 0.15; ev = []
    span = dur - 0.3
    for s in sents:
        d = span * len(s) / total
        ev.append(f"Dialogue: 0,{ts(t)},{ts(t + d)},Cap,,0,0,0,,{s}"); t += d
    ml = 760 if phone else 160
    return f"""[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,Atkinson Hyperlegible,34,&H00FFFFFF,&H00FFFFFF,&H003A2314,&HC03A2314,0,0,0,0,100,100,0,0,3,14,0,1,{ml},160,40,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
""" + "\n".join(ev) + "\n"

parts = []
for i in range(7):
    dur = D[i] + PAD
    phone = i in REC
    open(f"seg{i}.ass", "w").write(ass(i, dur, phone))
    out = f"seg{i}.mp4"
    vf_sub = f"subtitles=seg{i}.ass:fontsdir=fonts"
    if phone:
        name, skip = REC[i]
        fc = (f"[1:v]crop=390:844:0:0,trim=start={skip},setpts=PTS-STARTPTS,scale=430:930:flags=lanczos,fps=30,tpad=stop_mode=clone:stop_duration=30[ph];"
              f"[0:v][ph]overlay=204:75:shortest=0,trim=duration={dur},{vf_sub},format=yuv420p[v]")
        cmd = ["ffmpeg", "-v", "error", "-y", "-loop", "1", "-framerate", "30", "-t", str(dur), "-i", f"panels/{i}.png",
               "-i", f"rec/{name}.webm", "-i", f"aud/{i}.wav", "-filter_complex", fc + f";[2:a]apad,atrim=duration={dur}[a]",
               "-map", "[v]", "-map", "[a]"]
    else:
        cmd = ["ffmpeg", "-v", "error", "-y", "-loop", "1", "-framerate", "30", "-t", str(dur), "-i", f"panels/{i}.png",
               "-i", f"aud/{i}.wav", "-filter_complex", f"[0:v]{vf_sub},format=yuv420p[v];[1:a]apad,atrim=duration={dur}[a]",
               "-map", "[v]", "-map", "[a]"]
    cmd += ["-t", str(dur), "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-r", "30",
            "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2", out]
    subprocess.run(cmd, check=True)
    parts.append(out); print("built", out, round(dur, 2))

open("list.txt", "w").write("".join(f"file '{p}'\n" for p in parts))
subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", "list.txt", "-c", "copy",
                "-movflags", "+faststart", "jagabanjir-demo.mp4"], check=True)
print("done")
