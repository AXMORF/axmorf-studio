import { useEffect, useLayoutEffect, useMemo, useRef, type FC } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { Camera, Mesh, Program, Renderer, Transform, Triangle, Vec3 } from "ogl";
import {
  getCursorPixelPointAtFrame,
  type CursorKeyframe,
} from "../interaction/cursor-keyframes";

type CursorPath = "orbit" | "sweep" | "figureEight" | "recorded";

export type MetaBallsPrimitiveProps = {
  animationSize?: number;
  ballCount?: number;
  clumpFactor?: number;
  color?: string;
  cursorBallColor?: string;
  cursorBallSize?: number;
  cursorKeyframes?: CursorKeyframe[];
  cursorPath?: CursorPath;
  enableMouseInteraction?: boolean;
  enableTransparency?: boolean;
  hoverSmoothness?: number;
  seed?: number;
  speed?: number;
};

type BallParams = {
  baseScale: number;
  dtFactor: number;
  radius: number;
  st: number;
  toggle: number;
};

type WebGlState = {
  camera: Camera;
  gl: Renderer["gl"];
  metaBallsUniform: Vec3[];
  program: Program;
  renderer: Renderer;
  scene: Transform;
};

type Point = {
  x: number;
  y: number;
};

const MAX_BALLS = 50;

const vertex = `#version 300 es
precision highp float;
layout(location = 0) in vec2 position;

void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const fragment = `#version 300 es
precision highp float;

uniform vec3 iResolution;
uniform vec3 iMouse;
uniform vec3 iColor;
uniform vec3 iCursorColor;
uniform float iAnimationSize;
uniform int iBallCount;
uniform float iCursorBallSize;
uniform vec3 iMetaBalls[50];
uniform bool enableTransparency;

out vec4 outColor;

float getMetaBallValue(vec2 c, float r, vec2 p) {
  vec2 d = p - c;
  float dist2 = max(dot(d, d), 0.0001);
  return (r * r) / dist2;
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  float scale = iAnimationSize / iResolution.y;
  vec2 coord = (fc - iResolution.xy * 0.5) * scale;
  vec2 mouseW = (iMouse.xy - iResolution.xy * 0.5) * scale;

  float m1 = 0.0;
  for (int i = 0; i < 50; i++) {
    if (i >= iBallCount) {
      break;
    }
    m1 += getMetaBallValue(iMetaBalls[i].xy, iMetaBalls[i].z, coord);
  }

  float m2 = getMetaBallValue(mouseW, iCursorBallSize, coord);
  float total = m1 + m2;
  float f = smoothstep(-1.0, 1.0, (total - 1.3) / min(1.0, fwidth(total)));

  vec3 cFinal = vec3(0.0);
  if (total > 0.0) {
    float alpha1 = m1 / total;
    float alpha2 = m2 / total;
    cFinal = iColor * alpha1 + iCursorColor * alpha2;
  }

  outColor = vec4(cFinal * f, enableTransparency ? f : 1.0);
}
`;

const fract = (value: number) => value - Math.floor(value);

const parseHexColor = (hex: string): [number, number, number] => {
  const normalized = hex.replace("#", "");
  const full =
    normalized.length === 3
      ? normalized
          .split("")
          .map((char) => `${char}${char}`)
          .join("")
      : normalized.padEnd(6, "0").slice(0, 6);

  return [
    Number.parseInt(full.slice(0, 2), 16) / 255,
    Number.parseInt(full.slice(2, 4), 16) / 255,
    Number.parseInt(full.slice(4, 6), 16) / 255,
  ];
};

const hash31 = (p: number): [number, number, number] => {
  const r: [number, number, number] = [
    fract(p * 0.1031),
    fract(p * 0.103),
    fract(p * 0.0973),
  ];
  const dotVal =
    r[0] * (r[1] + 33.33) + r[1] * (r[2] + 33.33) + r[2] * (r[0] + 33.33);

  return [fract(r[0] + dotVal), fract(r[1] + dotVal), fract(r[2] + dotVal)];
};

const hash33 = ([x, y, z]: [number, number, number]): [number, number, number] => {
  const p: [number, number, number] = [fract(x * 0.1031), fract(y * 0.103), fract(z * 0.0973)];
  const dotVal =
    p[0] * (p[1] + 33.33) + p[1] * (p[0] + 33.33) + p[2] * (p[2] + 33.33);
  const mixed: [number, number, number] = [
    fract(p[0] + dotVal),
    fract(p[1] + dotVal),
    fract(p[2] + dotVal),
  ];

  return [
    fract((mixed[0] + mixed[1]) * mixed[2]),
    fract((mixed[0] + mixed[0]) * mixed[1]),
    fract((mixed[1] + mixed[0]) * mixed[0]),
  ];
};

const getBallParams = (ballCount: number, seed: number): BallParams[] => {
  const effectiveBallCount = Math.min(Math.max(0, ballCount), MAX_BALLS);

  return Array.from({ length: effectiveBallCount }, (_, index) => {
    const h1 = hash31(index + 1 + seed * 17);
    const h2 = hash33(h1);

    return {
      baseScale: 5 + h1[1] * 10,
      dtFactor: 0.1 * Math.PI + h1[1] * 0.3 * Math.PI,
      radius: 0.5 + h2[2] * 1.5,
      st: h1[0] * 2 * Math.PI,
      toggle: Math.floor(h2[0] * 2),
    };
  });
};

const getAutomatedCursorPixelPosition = ({
  cursorPath,
  height,
  speed,
  time,
  width,
}: {
  cursorPath: Exclude<CursorPath, "recorded">;
  height: number;
  speed: number;
  time: number;
  width: number;
}) => {
  const t = time * speed;

  if (cursorPath === "sweep") {
    return {
      x: width * (0.5 + Math.sin(t * 1.4) * 0.3),
      y: height * (0.5 - Math.sin(t * 0.7 + Math.PI * 0.35) * 0.26),
    };
  }

  if (cursorPath === "figureEight") {
    return {
      x: width * (0.5 + Math.sin(t * 1.2) * 0.28),
      y: height * (0.5 - Math.sin(t * 2.4) * 0.22),
    };
  }

  return {
    x: width * (0.5 + Math.cos(t) * 0.2),
    y: height * (0.5 - Math.sin(t * 0.82) * 0.2),
  };
};

export const MetaBallsPrimitive: FC<MetaBallsPrimitiveProps> = ({
  animationSize = 30,
  ballCount = 15,
  clumpFactor = 1,
  color = "#ffffff",
  cursorBallColor = "#7dd3fc",
  cursorBallSize = 3,
  cursorKeyframes = [],
  cursorPath = "orbit",
  enableMouseInteraction = false,
  enableTransparency = true,
  hoverSmoothness = 0.2,
  seed = 1,
  speed = 0.3,
}) => {
  const frame = useCurrentFrame();
  const { fps, height, width } = useVideoConfig();
  const containerRef = useRef<HTMLDivElement>(null);
  const liveCursorRef = useRef<Point>({ x: width * 0.5, y: height * 0.5 });
  const pointerInsideRef = useRef(false);
  const smoothedLiveCursorRef = useRef<Point | null>(null);
  const webGlStateRef = useRef<WebGlState | null>(null);
  const time = frame / fps;
  const balls = useMemo(() => getBallParams(ballCount, seed), [ballCount, seed]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return undefined;
    }

    const onPointerEnter = () => {
      if (!enableMouseInteraction) {
        return;
      }

      pointerInsideRef.current = true;
    };

    const onPointerLeave = () => {
      if (!enableMouseInteraction) {
        return;
      }

      pointerInsideRef.current = false;
      smoothedLiveCursorRef.current = null;
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!enableMouseInteraction) {
        return;
      }

      const rect = container.getBoundingClientRect();
      liveCursorRef.current = {
        x: ((event.clientX - rect.left) / rect.width) * width,
        y: (1 - (event.clientY - rect.top) / rect.height) * height,
      };
    };

    const renderer = new Renderer({
      alpha: true,
      dpr: 1,
      premultipliedAlpha: false,
      width,
      height,
    });
    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, enableTransparency ? 0 : 1);
    gl.canvas.style.height = `${height}px`;
    gl.canvas.style.width = `${width}px`;
    container.appendChild(gl.canvas);

    const camera = new Camera(gl, {
      bottom: -1,
      far: 10,
      left: -1,
      near: 0.1,
      right: 1,
      top: 1,
    });
    camera.position.z = 1;

    const [r1, g1, b1] = parseHexColor(color);
    const [r2, g2, b2] = parseHexColor(cursorBallColor);
    const metaBallsUniform = Array.from({ length: MAX_BALLS }, () => new Vec3(0, 0, 0));
    const program = new Program(gl, {
      fragment,
      uniforms: {
        enableTransparency: { value: enableTransparency },
        iAnimationSize: { value: animationSize },
        iBallCount: { value: Math.min(balls.length, MAX_BALLS) },
        iColor: { value: new Vec3(r1, g1, b1) },
        iCursorBallSize: { value: cursorBallSize },
        iCursorColor: { value: new Vec3(r2, g2, b2) },
        iMetaBalls: { value: metaBallsUniform },
        iMouse: { value: new Vec3(width * 0.5, height * 0.5, 0) },
        iResolution: { value: new Vec3(width, height, 0) },
      },
      vertex,
    });
    const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });
    const scene = new Transform();
    mesh.setParent(scene);

    webGlStateRef.current = {
      camera,
      gl,
      metaBallsUniform,
      program,
      renderer,
      scene,
    };

    container.addEventListener("pointerenter", onPointerEnter);
    container.addEventListener("pointerleave", onPointerLeave);
    container.addEventListener("pointermove", onPointerMove);

    return () => {
      webGlStateRef.current = null;
      container.removeEventListener("pointerenter", onPointerEnter);
      container.removeEventListener("pointerleave", onPointerLeave);
      container.removeEventListener("pointermove", onPointerMove);
      if (gl.canvas.parentElement === container) {
        container.removeChild(gl.canvas);
      }
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [
    animationSize,
    balls.length,
    color,
    cursorBallColor,
    cursorBallSize,
    enableMouseInteraction,
    enableTransparency,
    height,
    width,
  ]);

  useLayoutEffect(() => {
    const state = webGlStateRef.current;
    if (!state) {
      return;
    }

    for (let index = 0; index < balls.length; index += 1) {
      const ball = balls[index];
      const dt = time * speed * ball.dtFactor;
      const th = ball.st + dt;
      state.metaBallsUniform[index].set(
        Math.cos(th) * ball.baseScale * clumpFactor,
        Math.sin(th + dt * ball.toggle) * ball.baseScale * clumpFactor,
        ball.radius,
      );
    }

    const automatedCursor =
      cursorPath === "recorded"
        ? getCursorPixelPointAtFrame({
            frame,
            height,
            keyframes: cursorKeyframes,
            width,
          }) ??
          getAutomatedCursorPixelPosition({
            cursorPath: "orbit",
            height,
            speed,
            time,
            width,
          })
        : getAutomatedCursorPixelPosition({
            cursorPath,
            height,
            speed,
            time,
            width,
          });

    const cursor =
      enableMouseInteraction && pointerInsideRef.current ? liveCursorRef.current : automatedCursor;

    if (enableMouseInteraction && pointerInsideRef.current) {
      const smoothness = Math.min(Math.max(hoverSmoothness, 0), 1);
      const previous = smoothedLiveCursorRef.current ?? cursor;
      smoothedLiveCursorRef.current = {
        x: previous.x + (cursor.x - previous.x) * smoothness,
        y: previous.y + (cursor.y - previous.y) * smoothness,
      };
    }

    const renderedCursor = smoothedLiveCursorRef.current ?? cursor;

    state.program.uniforms.iBallCount.value = Math.min(balls.length, MAX_BALLS);
    state.program.uniforms.iMouse.value.set(renderedCursor.x, renderedCursor.y, 0);
    state.renderer.render({ camera: state.camera, scene: state.scene });
  }, [
    balls,
    clumpFactor,
    cursorKeyframes,
    cursorPath,
    enableMouseInteraction,
    frame,
    height,
    hoverSmoothness,
    speed,
    time,
    width,
  ]);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: enableTransparency ? "transparent" : "#020617",
        overflow: "hidden",
      }}
    >
      <div
        ref={containerRef}
        style={{
          height: "100%",
          pointerEvents: "auto",
          width: "100%",
        }}
      />
    </AbsoluteFill>
  );
};
