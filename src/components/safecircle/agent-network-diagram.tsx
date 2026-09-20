import { activityEdges, type AgentActivityEvent } from "@/lib/client/beacon-client";

function nodeKind(name: string) {
  const value = name.toLowerCase();
  if (value.includes("databricks")) return "Databricks";
  if (value.includes("ans")) return "ANS";
  if (value.includes("authoriz")) return "Authorization";
  return "Agent";
}

function displayName(name: string) {
  return name.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function AgentNetworkDiagram({ events }: { events: AgentActivityEvent[] }) {
  const edges = activityEdges(events);
  const nodes = [...new Set(edges.flatMap((edge) => [edge.sender, edge.recipient]))];

  if (!edges.length) return <p className="sc-activity-empty">No agent requests have been recorded for this run.</p>;

  return (
    <div className="sc-network" role="img" aria-label={`${edges.length} recorded agent request${edges.length === 1 ? "" : "s"} between ${nodes.length} participants`}>
      <div className="sc-network-nodes">
        {nodes.map((node) => <div className={`sc-network-node is-${nodeKind(node).toLowerCase()}`} key={node}><span>{nodeKind(node)}</span><strong>{displayName(node)}</strong></div>)}
      </div>
      <ol className="sc-network-edges" aria-label="Recorded request paths">
        {edges.map((edge) => {
          const outcome = edge.response?.phase ?? "pending";
          return <li key={edge.id} className={`is-${outcome}`}><span>{displayName(edge.sender)}</span><i aria-hidden="true">→</i><span>{displayName(edge.recipient)}</span><strong>{edge.request.operation.replaceAll("_", " ")}</strong><small>{outcome}</small></li>;
        })}
      </ol>
    </div>
  );
}
