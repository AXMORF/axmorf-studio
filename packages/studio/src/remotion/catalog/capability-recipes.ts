/** Small, content-parameterized recipes. The catalog freezes these beside the APIs. */
export const capabilityRecipes = {
  camera: [
    {
      id: "full-bleed-shot",
      whenToUse:
        "Fill the whole viewport with one world and move between shots by push, pull and pan instead of a boxed illustration (全幅、推近、拉远、摇镜、镜头变化).",
      exports: ["ProducerShotStage"],
      example: `import type {ReactNode} from "react";
import {ProducerShotStage, SceneTextSafeArea} from "@axmorf/studio/remotion";
export const Example = ({width,height,background,subject,foreground,text}:{width:number;height:number;background:ReactNode;subject:ReactNode;foreground:ReactNode;text:ReactNode}) => <ProducerShotStage width={width} height={height}
shots={[{frame:0,focus:[0.5,0.5],zoom:1,easing:"ease-in-out"},{frame:45,focus:[0.5,0.5],zoom:1,easing:"ease-in-out"},{frame:80,focus:[0.5,0.42],zoom:1.45,easing:"ease-in-out"},{frame:110,focus:[0.5,0.42],zoom:1.45,easing:"ease-in-out"},{frame:150,focus:[0.52,0.7],zoom:1.6,rotation:-2}]}
drift={{amplitudePx:8,periodFrames:150}} background={background} subject={subject} foreground={foreground}
overlay={<SceneTextSafeArea><div style={{position:"absolute",inset:0,height:"22%",background:"linear-gradient(#05080fee 55%, #05080f00)"}}/>{text}</SceneTextSafeArea>}/>;`,
    },
    {
      id: "artwork-depth",
      whenToUse:
        "Stage approved background art, a transparent subject and authored foreground occlusion; keep readable text out of the camera (生成图片、透明主体、接触阴影、前景遮挡、层次).",
      exports: ["ProducerLayeredStage"],
      example: `import type {ReactNode} from "react";
import {Img} from "remotion";
import {ProducerLayeredStage, SceneTextSafeArea} from "@axmorf/studio/remotion";
export const Example = ({backgroundSrc,subjectSrc,foreground,text,endFrame}:{backgroundSrc:string;subjectSrc:string;foreground:ReactNode;text:ReactNode;endFrame:number}) => <>
<ProducerLayeredStage keyframes={[{frame:0,x:-0.4,y:0},{frame:endFrame,x:0.4,y:0}]} maxOffsetPx={48}
background={<Img src={backgroundSrc} style={{position:"absolute",width:"112%",height:"112%",left:"-6%",top:"-6%",objectFit:"cover"}}/>}
subject={<Img src={subjectSrc} style={{position:"absolute",width:"70%",height:"80%",left:"15%",top:"10%",objectFit:"contain",filter:"drop-shadow(12px 22px 18px rgba(0,0,0,0.35))"}}/>}
foreground={foreground}/><SceneTextSafeArea>{text}</SceneTextSafeArea></>;`,
    },
    {
      id: "layered-reveal",
      whenToUse:
        "Reveal depth or occlusion between authored foreground, subject and background (分层、视差、遮挡).",
      exports: ["ProducerLayeredStage"],
      example: `import type {ReactNode} from "react";
import {ProducerLayeredStage} from "@axmorf/studio/remotion";
export const Example = ({background,subject,foreground,endFrame}:{background:ReactNode;subject:ReactNode;foreground:ReactNode;endFrame:number}) => <ProducerLayeredStage keyframes={[{frame:0,x:-0.5,y:0},{frame:endFrame,x:0.5,y:0}]} background={background} subject={subject} foreground={foreground} maxOffsetPx={60} />;`,
    },
    {
      id: "spatial-subject",
      whenToUse:
        "Explain volume, orbit or spatial relations with actual authored 3D geometry (立体、空间关系、环绕).",
      exports: ["ProducerCamera3D"],
      example: `import type {ReactNode} from "react";
import {ProducerCamera3D} from "@axmorf/studio/remotion";
export const Example = ({width,height,endFrame,subject}:{width:number;height:number;endFrame:number;subject:ReactNode}) => <ProducerCamera3D width={width} height={height} keyframes={[{frame:0,position:[0,0,6],target:[0,0,0],fov:40,roll:0},{frame:endFrame,position:[3,1,5],target:[0,0,0],fov:40,roll:0}]}>{subject}</ProducerCamera3D>;`,
    },
  ],
  motion: [
    {
      id: "gather-evidence",
      whenToUse:
        "Bring multiple items to a shared conclusion; keep identity and reach the target before the hold (汇聚、证据、收束).",
      exports: ["resolveProducerGather2D"],
      example: `import {useCurrentFrame} from "remotion";
import {resolveProducerGather2D} from "@axmorf/studio/remotion";
export const Example = ({points,target,endFrame,color,width,height}:{points:readonly (readonly [number,number])[];target:readonly [number,number];endFrame:number;color:string;width:number;height:number}) => {
const positions=resolveProducerGather2D(points,target,useCurrentFrame(),{startFrame:0,endFrame,staggerInFrames:2});
return <svg width={width} height={height}>{positions.map(([x,y],i)=><circle key={i} cx={x} cy={y} r={12} fill={color}/>)}</svg>;
};`,
    },
    {
      id: "continuous-follow",
      whenToUse:
        "Follow one moving subject through several beats without camera resets (追踪、跟随、连续运动).",
      exports: ["resolveProducerFollow2D"],
      example: `import {useCurrentFrame} from "remotion";
import {resolveProducerFollow2D} from "@axmorf/studio/remotion";
import type {ReactNode} from "react";
export const Example = ({children,width,height,endFrame}:{children:ReactNode;width:number;height:number;endFrame:number}) => {
const [x,y]=resolveProducerFollow2D([{frame:0,position:[0,0]},{frame:endFrame,position:[width,0]}],useCurrentFrame(),{timeConstantFrames:6});
return <div style={{width,height,transform:\`translate(\${width/2-x}px,\${height/2-y}px)\`}}>{children}</div>;
};`,
    },
  ],
  visual: [
    {
      id: "software-interface",
      whenToUse:
        "Show a real developer tool, repository, terminal session or code change as a credible interface (软件界面、终端、代码、开源仓库、命令行).",
      exports: [
        "InterfaceWindow",
        "TerminalPanel",
        "CodePanel",
        "RepositoryCard",
      ],
      example: `import {CodePanel, InterfaceWindow, RepositoryCard, TerminalPanel} from "@axmorf/studio/remotion";
export const Example = ({minFontSizePx}:{minFontSizePx:number}) => <div style={{position:"absolute",inset:0}}>
<div style={{position:"absolute",left:70,top:330}}><InterfaceWindow width={940} height={760} minFontSizePx={minFontSizePx} url="github.com/owner/project">
<div style={{padding:36,display:"flex",flexDirection:"column",gap:28}}>
<RepositoryCard owner="owner" name="project" description="What the project actually does" language={{name:"TypeScript",color:"#3178c6"}} topics={["agent"]} width={868} minFontSizePx={minFontSizePx}/>
<CodePanel code={"import { run } from \\"project\\";\\nawait run();"} fileName="example.ts" minFontSizePx={minFontSizePx} startFrame={20} highlights={[{fromLine:2,toLine:2,startFrame:70}]}/>
</div></InterfaceWindow></div>
<div style={{position:"absolute",left:150,top:1150}}><InterfaceWindow width={860} height={420} minFontSizePx={minFontSizePx} variant="app" title="zsh">
<TerminalPanel minFontSizePx={minFontSizePx} startFrame={90} lines={[{kind:"command",text:"npx project run"},{kind:"success",text:"done"}]}/>
</InterfaceWindow></div></div>;`,
    },
    {
      id: "authored-whip-pan",
      whenToUse:
        "A motivated fast pan between two authored views of the subject (甩镜、快速转场). No demo panels or fixed palette.",
      exports: ["WhipPan"],
      example: `import type {ReactNode} from "react";
import {WhipPan} from "@axmorf/studio/remotion";
export const Example = ({before,after,startFrame,durationInFrames}:{before:ReactNode;after:ReactNode;startFrame:number;durationInFrames:number}) => <WhipPan from={before} to={after} startFrame={startFrame} durationInFrames={durationInFrames} direction="left" blurPx={6}/>;`,
    },
    {
      id: "material-grain",
      whenToUse:
        "Texture an authored subject surface with subtle deterministic grain (颗粒、纸张、材质). Place inside a positioned subject, not over reading text.",
      exports: ["NoiseGrain"],
      example: `import type {ReactNode} from "react";
import {NoiseGrain} from "@axmorf/studio/remotion";
export const Example = ({children,width,height}:{children:ReactNode;width:number;height:number}) => <div style={{position:"relative",width,height,overflow:"hidden"}}>{children}<NoiseGrain opacity={0.08} grainSize={1.5} seed={3} holdFrames={2}/></div>;`,
    },
  ],
} as const;
