export type DemoScreen =
  | "home"
  | "searching"
  | "recommendation"
  | "verifying"
  | "active"
  | "cancelled"
  | "replanning"
  | "replacement"
  | "replacement-active"
  | "arrival";

export type TechnicalStep = {
  id: string;
  title: string;
  detail: string;
  state: "complete" | "active" | "waiting" | "blocked";
};
