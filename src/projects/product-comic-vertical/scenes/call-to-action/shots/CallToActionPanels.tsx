import type {CSSProperties, FC, ReactNode} from "react";
import {Easing, interpolate, spring} from "remotion";

const ink = "#171717";
const paper = "#f7f1df";
const accent = "#f05b3d";
const support = "#3b78cc";
const muted = "#c9c0aa";

const clamp = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

const panelStyle: CSSProperties = {
  position: "absolute",
  left: 72,
  width: 936,
  border: `6px solid ${ink}`,
  borderRadius: 18,
  background: paper,
  boxShadow: `14px 14px 0 ${ink}`,
  overflow: "hidden",
};

const Character: FC<{
  id: "producer" | "checker";
  left: number;
  top: number;
  label: string;
  progress: number;
}> = ({id, left, top, label, progress}) => {
  const isProducer = id === "producer";
  return (
    <div
      data-character={id}
      style={{
        position: "absolute",
        left,
        top,
        width: 154,
        height: 188,
        opacity: progress,
        transform: `translateY(${(1 - progress) * 20}px)`,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 39,
          top: 0,
          width: 78,
          height: 78,
          border: `6px solid ${ink}`,
          borderRadius: isProducer ? "48% 52% 44% 56%" : 14,
          background: paper,
        }}
      >
        {isProducer ? (
          <div
            style={{
              position: "absolute",
              left: -16,
              top: 24,
              width: 30,
              height: 12,
              background: accent,
              transform: "rotate(-18deg)",
            }}
          />
        ) : (
          <div
            style={{
              position: "absolute",
              right: 10,
              top: 19,
              width: 22,
              height: 22,
              background: support,
            }}
          />
        )}
      </div>
      <div
        style={{
          position: "absolute",
          left: 22,
          top: 70,
          width: 110,
          height: 72,
          border: `6px solid ${ink}`,
          borderRadius: isProducer ? "38px 38px 12px 12px" : 10,
          background: isProducer ? accent : support,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 151,
          width: "100%",
          fontSize: 36,
          lineHeight: 1,
          fontWeight: 900,
          textAlign: "center",
          letterSpacing: 1,
          color: ink,
        }}
      >
        {label}
      </div>
    </div>
  );
};

const InkLabel: FC<{
  children: ReactNode;
  left: number;
  top: number;
  color?: string;
  rotate?: number;
}> = ({children, left, top, color = ink, rotate = 0}) => (
  <div
    style={{
      position: "absolute",
      left,
      top,
      padding: "10px 18px",
      background: color,
      color: paper,
      fontSize: 36,
      fontWeight: 900,
      lineHeight: 1,
      letterSpacing: 1,
      transform: `rotate(${rotate}deg)`,
    }}
  >
    {children}
  </div>
);

const HandoffShot: FC<{sceneFrame: number}> = ({sceneFrame}) => {
  const enter = interpolate(sceneFrame, [0, 24], [0, 1], {
    ...clamp,
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const statement = interpolate(sceneFrame, [38, 82], [0, 1], {
    ...clamp,
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const markerUnderlineProgress = interpolate(sceneFrame, [96, 132], [0, 1], {
    ...clamp,
    easing: Easing.bezier(0.22, 1, 0.36, 1),
  });
  const decisionStamp = interpolate(sceneFrame, [16, 38], [0, 1], {
    ...clamp,
    easing: Easing.out(Easing.cubic),
  });
  return (
    <>
      <div
        style={{
          ...panelStyle,
          top: 120,
          height: 528,
          opacity: enter,
          transform: `translateY(${(1 - enter) * 42}px)`,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(circle at 18% 24%, rgba(59,120,204,.10) 0 3px, transparent 4px) 0 0/26px 26px",
          }}
        />
        <InkLabel left={30} top={28} color={support} rotate={-1}>
          用户最终决定
        </InkLabel>
        <div
          style={{
            position: "absolute",
            right: 34,
            top: 32,
            width: 178,
            height: 72,
            border: `5px solid ${ink}`,
            background: paper,
            fontSize: 36,
            fontWeight: 900,
            lineHeight: "62px",
            textAlign: "center",
            transform: `scale(${0.82 + decisionStamp * 0.18}) rotate(2deg)`,
          }}
        >
          HANDOFF
        </div>
        <div
          style={{
            position: "absolute",
            left: 46,
            top: 152,
            width: 842,
            opacity: statement,
            transform: `translateX(${(1 - statement) * -28}px)`,
          }}
        >
          <div
            style={{
              fontSize: 54,
              lineHeight: 1.08,
              fontWeight: 900,
              letterSpacing: -2,
              color: ink,
            }}
          >
            视频，不止一次导出
          </div>
          <div
            style={{
              position: "relative",
              marginTop: 32,
              display: "inline-block",
              fontSize: 62,
              lineHeight: 1.12,
              fontWeight: 950,
              letterSpacing: -3,
              color: ink,
            }}
          >
            可继续验证的作品
            <svg
              aria-hidden="true"
              viewBox="0 0 660 54"
              style={{
                position: "absolute",
                left: -5,
                top: 66,
                width: 670,
                height: 58,
                overflow: "visible",
              }}
            >
              <path
                d="M8 31 C 126 19, 243 40, 354 25 S 558 18, 650 28"
                fill="none"
                stroke={support}
                strokeWidth={25}
                strokeLinecap="round"
                strokeDasharray={680}
                strokeDashoffset={680 * (1 - markerUnderlineProgress)}
              />
            </svg>
          </div>
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 132,
          top: 664,
          width: 816,
          height: 6,
          background: support,
          transformOrigin: "left center",
          transform: `scaleX(${markerUnderlineProgress})`,
        }}
      />
    </>
  );
};

const ProcessShot: FC<{sceneFrame: number}> = ({sceneFrame}) => {
  const processFrame = Math.max(0, sceneFrame - 182);
  const panelEnter = spring({
    fps: 30,
    frame: processFrame,
    config: {damping: 18, mass: 0.8, stiffness: 150},
    durationInFrames: 42,
  });
  const chainProgress = interpolate(sceneFrame, [196, 300], [0, 1], {
    ...clamp,
    easing: Easing.bezier(0.45, 0, 0.55, 1),
  });
  const completed = interpolate(sceneFrame, [292, 338], [0, 1], {
    ...clamp,
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const pulse = interpolate(sceneFrame, [182, 188, 194], [1, 1.12, 1], clamp);
  const nodes = [
    {label: "主题资料", sub: "SOURCE", left: 44},
    {label: "创作", sub: "AUTHOR", left: 286},
    {label: "校验", sub: "CHECK", left: 528},
    {label: "作品", sub: "WORK", left: 770},
  ] as const;
  return (
    <div
      style={{
        ...panelStyle,
        top: 704,
        height: 648,
        opacity: panelEnter,
        transform: `translateY(${(1 - panelEnter) * 54}px)`,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 34,
          top: 28,
          fontSize: 40,
          fontWeight: 950,
          letterSpacing: 1,
        }}
      >
        从一份主题资料开始
      </div>
      <InkLabel left={617} top={20} color={accent} rotate={1}>
        START HERE
      </InkLabel>
      <div
        style={{
          position: "absolute",
          left: 112,
          top: 194,
          width: 710,
          height: 12,
          background: muted,
          border: `3px solid ${ink}`,
        }}
      >
        <div
          style={{
            width: `${chainProgress * 100}%`,
            height: "100%",
            background: support,
          }}
        />
      </div>
      {nodes.map((node, index) => {
        const nodeProgress = interpolate(
          chainProgress,
          [index / nodes.length, (index + 0.72) / nodes.length],
          [0, 1],
          clamp,
        );
        const isFirst = index === 0;
        const isLast = index === nodes.length - 1;
        return (
          <div
            key={node.sub}
            style={{
              position: "absolute",
              left: node.left,
              top: 135,
              width: 144,
              height: 144,
              border: `6px solid ${ink}`,
              borderRadius: isFirst ? 12 : isLast ? 72 : 20,
              background: isLast ? support : paper,
              color: isLast ? paper : ink,
              opacity: nodeProgress,
              transform: `scale(${(isFirst ? pulse : 0.84) + nodeProgress * (isFirst ? 0 : 0.16)}) rotate(${(1 - nodeProgress) * (index % 2 === 0 ? -5 : 5)}deg)`,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 2,
            }}
          >
            <div style={{fontSize: 36, fontWeight: 950, lineHeight: 1}}>
              {node.label}
            </div>
            <div
              style={{
                marginTop: 12,
                fontSize: 36,
                fontWeight: 800,
                lineHeight: 1,
                transform: "scale(.72)",
              }}
            >
              {node.sub}
            </div>
          </div>
        );
      })}
      <Character
        id="producer"
        left={86}
        top={336}
        label="PRODUCER"
        progress={interpolate(sceneFrame, [205, 236], [0, 1], clamp)}
      />
      <Character
        id="checker"
        left={690}
        top={336}
        label="CHECKER"
        progress={interpolate(sceneFrame, [244, 275], [0, 1], clamp)}
      />
      <div
        style={{
          position: "absolute",
          left: 280,
          top: 370,
          width: 380,
          padding: "20px 22px 18px",
          border: `5px solid ${ink}`,
          background: support,
          color: paper,
          opacity: completed,
          transform: `scale(${0.9 + completed * 0.1}) rotate(${(1 - completed) * -2}deg)`,
          textAlign: "center",
        }}
      >
        <div style={{fontSize: 38, fontWeight: 950, lineHeight: 1}}>
          第一支作品
        </div>
        <div
          style={{
            marginTop: 14,
            fontSize: 36,
            fontWeight: 850,
            lineHeight: 1,
            letterSpacing: 2,
          }}
        >
          COMPLETED WORK
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 52,
          right: 52,
          bottom: 30,
          fontSize: 36,
          lineHeight: 1,
          fontWeight: 850,
          textAlign: "center",
          letterSpacing: 1,
          color: ink,
        }}
      >
        按可验证生产链完成
      </div>
    </div>
  );
};

export const CallToActionPanels: FC<{
  sceneFrame: number;
  durationInFrames: number;
}> = ({sceneFrame, durationInFrames}) => {
  const exitSettle = interpolate(
    sceneFrame,
    [durationInFrames - 58, durationInFrames - 18],
    [0, 1],
    {...clamp, easing: Easing.out(Easing.cubic)},
  );
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        background: paper,
        color: ink,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.26,
          backgroundImage:
            "radial-gradient(circle at center, rgba(23,23,23,.22) 0 1px, transparent 1.5px)",
          backgroundSize: "18px 18px",
        }}
      />
      <HandoffShot sceneFrame={sceneFrame} />
      <ProcessShot sceneFrame={sceneFrame} />
      <div
        style={{
          position: "absolute",
          left: 72,
          top: 1378,
          width: 936,
          height: 12,
          border: `3px solid ${ink}`,
          background: muted,
        }}
      >
        <div
          data-continuity="completed-work-handoff"
          style={{
            width: `${78 + exitSettle * 22}%`,
            height: "100%",
            background: support,
          }}
        />
      </div>
      <div
        style={{
          position: "absolute",
          left: 72,
          top: 1407,
          width: 936,
          fontSize: 36,
          lineHeight: 1,
          fontWeight: 900,
          letterSpacing: 1,
          color: support,
          textAlign: "right",
          opacity: exitSettle,
        }}
      >
        IDENTITY THREAD · CURRENT
      </div>
    </div>
  );
};
