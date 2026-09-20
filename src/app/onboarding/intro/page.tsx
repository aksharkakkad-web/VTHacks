import type { Metadata } from "next";
import { LaunchAnimation } from "@/components/safecircle/launch-animation";

export const metadata: Metadata = {
  title: "Beacon",
  description: "Get home. We handle the rest.",
};

export default function IntroPage() {
  return <LaunchAnimation />;
}
