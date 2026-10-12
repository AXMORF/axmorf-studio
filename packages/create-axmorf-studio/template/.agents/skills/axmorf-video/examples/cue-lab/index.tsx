import React from "react";
import {AbsoluteFill, Composition, registerRoot, staticFile, useCurrentFrame, useVideoConfig} from "remotion";
import {Audio} from "@remotion/media";
import sheet from "./cue-sheet.json";
import {clamp, landing, schedule} from "./timing.mjs";

const color = {background: "#fff5df", foreground: "#243847", auxiliary: "#315b5c", accent: "#9b421e"};
const cues = schedule(sheet);
const font = '"Noto Sans CJK SC", "Microsoft YaHei", sans-serif';

// Pure seeded geometry: seeking does not change paper edges.
const roughRect = (width: number, height: number, seed: number) => {
  const corners = [[0, 0], [width, 0], [width, height], [0, height]];
  return corners.flatMap(([x, y], edge) => {
    const [nx, ny] = corners[(edge + 1) % corners.length];
    const dx = nx - x;
    const dy = ny - y;
    const length = Math.hypot(dx, dy);
    return Array.from({length: 12}, (_, i) => {
      const jitter = Math.sin((edge * 12 + i + seed) * 19.31) * 1.5;
      return `${x + dx * i / 12 - dy / length * jitter},${y + dy * i / 12 + dx / length * jitter}`;
    });
  }).join(" ");
};

const Paper: React.FC<{width: number; height: number; fill: string; seed: number; children?: React.ReactNode}> = ({width, height, fill, seed, children}) => (
  <div style={{position: "relative", width, height, filter: "drop-shadow(1px 2px 0px #24384736) drop-shadow(3px 8px 8px #24384724)"}}>
    <svg width={width} height={height} viewBox={`-4 -4 ${width + 8} ${height + 8}`} style={{position: "absolute", overflow: "visible"}}>
      <polygon points={roughRect(width, height, seed)} fill={color.background} stroke={color.background} strokeWidth={7}/>
      <polygon points={roughRect(width, height, seed)} fill={fill}/>
      <path d={`M 12 10 L ${width - 13} 8 M 12 ${height - 11} L ${width - 18} ${height - 14}`} stroke={color.background} strokeOpacity={0.18} strokeWidth={1.2}/>
    </svg>
    <div style={{position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center"}}>{children}</div>
  </div>
);

const Content: React.FC = () => {
  const f = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const portrait = height > width;
  const unit = Math.min(width / (portrait ? 720 : 1280), height / (portrait ? 1280 : 720));
  const [paper, mark, tag, result] = cues;
  const p = landing(f, paper.contactFrame, paper.leadFrames, paper.settleFrames);
  const t = landing(f, tag.contactFrame, tag.leadFrames, tag.settleFrames, 0.03);
  const r = landing(f, result.contactFrame, result.leadFrames, result.settleFrames, 0.06);
  const stroke = clamp((f - mark.contactFrame) / 13);
  const impact = Math.max(0, 1 - Math.abs(f - paper.contactFrame) / 7);
  const centerX = portrait ? width * 0.5 : width * 0.33;
  const centerY = portrait ? height * 0.46 : height * 0.51;
  const noteX = portrait ? width * 0.5 : width * 0.76;
  const noteY = portrait ? height * 0.76 : height * 0.53;

  return <AbsoluteFill style={{fontFamily: font, color: color.foreground}}>
    <div style={{position: "absolute", left: portrait ? 55 : 76, top: portrait ? 76 : 48, fontSize: (portrait ? 24 : 20) * unit, fontWeight: 700, letterSpacing: 2}}>纸片 / 动作 / 声音</div>
    <div style={{position: "absolute", left: portrait ? 55 : 76, top: portrait ? 130 : 82, fontSize: 58 * unit, fontWeight: 700, lineHeight: 1.3}}>让动作有落点</div>

    <div style={{position: "absolute", left: centerX, top: centerY, transform: `scale(${unit * (1 + impact * 0.012)})`}}>
      <svg width={440} height={370} viewBox="-220 -185 440 370" style={{position: "absolute", left: -220, top: -185}}>
        <ellipse cx={0} cy={8} rx={202} ry={170} fill={color.auxiliary} opacity={0.12}/>
        <path d="M -171 123 C -82 162 97 172 178 101" fill="none" stroke={color.auxiliary} strokeWidth={3} strokeDasharray="5 9" opacity={0.45}/>
      </svg>
      <div style={{position: "absolute", left: -149, top: -125, opacity: p === 0 ? 0 : 1, transform: `translateY(${-235 * (1 - p)}px) rotate(${-12 + 19 * (1 - p)}deg)`}}>
        <Paper width={298} height={245} fill={color.auxiliary} seed={sheet.seed}>
          <svg width={230} height={190} viewBox="0 0 230 190" aria-label="折叠纸面">
            <path d="M 27 126 L 102 33 L 207 110 L 119 164 Z" fill={color.background} stroke={color.background} strokeWidth={5} strokeLinejoin="round"/>
            <path d="M 27 126 L 102 33 L 116 118 Z" fill={color.accent}/>
            <path d="M 102 33 L 207 110 L 116 118 Z" fill={color.foreground}/>
            <path d="M 27 126 L 116 118 L 119 164 Z" fill={color.foreground}/>
            <path d="M 116 118 L 207 110 L 119 164 Z" fill={color.accent}/>
            <path d="M 102 33 L 116 118 L 119 164" stroke={color.background} strokeWidth={2} fill="none"/>
          </svg>
        </Paper>
      </div>
      <div style={{position: "absolute", left: -163, top: 110, opacity: t === 0 ? 0 : 1, transform: `translateX(${160 * (1 - t)}px) rotate(4deg)`}}>
        <Paper width={326} height={62} fill={color.foreground} seed={sheet.seed + 4}>
          <span style={{fontSize: 28, fontWeight: 700, color: color.background}}>声音贴合动作</span>
        </Paper>
      </div>
    </div>

    <div style={{position: "absolute", left: noteX, top: noteY, transform: `translate(-50%, -50%) scale(${unit})`, width: 380}}>
      <div style={{fontSize: 38, fontWeight: 700, lineHeight: 1.7}}>先预备，再接触。</div>
      <svg width={347} height={20} style={{display: "block"}}>
        <path d="M 3 9 Q 161 2 340 9" stroke={color.accent} strokeWidth={5} fill="none" strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - stroke}/>
      </svg>
      <div style={{marginTop: 12, fontSize: 30, lineHeight: 1.6, color: color.auxiliary}}>接触之后，留出阅读。</div>
      <div style={{marginTop: 26, transformOrigin: "left center", transform: `scale(${r})`, opacity: r === 0 ? 0 : 1}}>
        <Paper width={265} height={66} fill={color.accent} seed={sheet.seed + 9}>
          <span style={{fontSize: 31, fontWeight: 700, color: color.background}}>停下来读</span>
        </Paper>
      </div>
    </div>
    <div style={{position: "absolute", left: portrait ? 55 : 76, right: portrait ? 55 : 76, bottom: portrait ? 75 : 42, display: "flex", justifyContent: "space-between", fontSize: 19 * unit, color: color.auxiliary}}>
      <span>预备 → 落点 → 稳定</span><span>同一事件 · 同一时间轴</span>
    </div>
  </AbsoluteFill>;
};

const Lesson: React.FC = () => {
  const f = useCurrentFrame();
  const opacity = clamp((sheet.durationInFrames - 1 - f) / 6);
  // The composition owns background and the standalone mixed track, once each.
  return <AbsoluteFill style={{backgroundColor: color.background}}>
    <Audio src={staticFile("lesson.wav")}/>
    <div style={{position: "absolute", inset: 0, opacity}}><Content/></div>
  </AbsoluteFill>;
};

const Root: React.FC = () => <>
  <Composition id="CueLabLandscape" component={Lesson} durationInFrames={sheet.durationInFrames} fps={sheet.fps} width={1280} height={720}/>
  <Composition id="CueLabPortrait" component={Lesson} durationInFrames={sheet.durationInFrames} fps={sheet.fps} width={720} height={1280}/>
</>;

registerRoot(Root);
