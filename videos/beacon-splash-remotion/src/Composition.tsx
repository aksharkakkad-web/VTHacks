import {
  AbsoluteFill,
  Composition,
  Easing,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";

const FPS = 60;
const DURATION_IN_FRAMES = 192;

const clamp = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

export const MyComposition = () => {
  return (
    <Composition
      id="BeaconSplash"
      component={BeaconSplash}
      durationInFrames={DURATION_IN_FRAMES}
      fps={FPS}
      // VP9 alpha supports the supplied artwork's exact odd width.
      // eslint-disable-next-line @remotion/even-dimensions
      width={1035}
      height={990}
    />
  );
};

const BeaconSplash: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{backgroundColor: "transparent"}}>
      <Img
        src={staticFile("beacon-intro-base.png")}
        style={{position: "absolute", inset: 0, width: "100%", height: "100%"}}
      />

      <svg
        aria-hidden="true"
        viewBox="0 0 1035 990"
        style={{position: "absolute", inset: 0, width: "100%", height: "100%"}}
      >
        <defs>
          <mask
            id="beacon-route-reveal"
            x="0"
            y="0"
            width="1035"
            height="990"
            maskUnits="userSpaceOnUse"
          >
            <rect width="1035" height="990" fill="black" />
            <path
              d="M 280 650 C 330 550 445 455 635 355"
              pathLength="1"
              fill="none"
              stroke="white"
              strokeWidth="250"
              strokeLinecap="round"
              strokeDasharray="1"
              strokeDashoffset={interpolate(frame, [21, 117], [1, 0], {
                ...clamp,
                easing: Easing.bezier(0.45, 0, 0.12, 1),
              })}
            />
          </mask>
        </defs>
        <image
          href={staticFile("beacon-intro-road.png")}
          width="1035"
          height="990"
          mask="url(#beacon-route-reveal)"
        />
        <path
          d="M 285 545 L 300 515 C 330 535 360 560 385 580"
          fill="none"
          stroke="#16282a"
          strokeWidth="7"
          strokeLinecap="round"
          mask="url(#beacon-route-reveal)"
        />
      </svg>

      <Img
        src={staticFile("beacon-intro-pin.png")}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          clipPath: `circle(${interpolate(frame, [102, 114], [0, 100], {
            ...clamp,
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          })}% at 62% 35%)`,
          scale: interpolate(frame, [102, 138], [0.96, 1], {
            ...clamp,
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: `0 ${interpolate(frame, [102, 138], [16, 0], {
            ...clamp,
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          })}px`,
          transformOrigin: "62% 35%",
        }}
      />
    </AbsoluteFill>
  );
};
