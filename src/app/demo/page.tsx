import { DemoEntry } from "./demo-entry";

export default async function DemoPage({
  searchParams,
}: {
  searchParams: Promise<{ walkthrough?: string; transport?: string; presenter?: string }>;
}) {
  const query = await searchParams;
  return <DemoEntry walkthrough={query.walkthrough === "1"} manual={query.transport === "manual"} fixture={query.transport === "fixture"} presenter={query.presenter === "1"} />;
}
