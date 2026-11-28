import { useParams, Link } from 'react-router-dom';
import { useAgent } from '../../lib/queries/agents';
import { useAgentTools } from '../../lib/queries/agentTools';
import { AlertTriangle, ChevronLeft, Search, Wrench } from 'lucide-react';
import { useState } from 'react';
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  CardSkeleton,
  EmptyState,
  Skeleton,
} from '../../components/ui';

export default function AgentDetail() {
  const { agentName } = useParams<{ agentName: string }>();
  const { data: agent, isLoading, isError } = useAgent(agentName!);
  const { data: agentTools } = useAgentTools(agentName!);
  const [searchQuery, setSearchQuery] = useState('');

  // Tools come from the dedicated tools endpoint when it is available.
  const toolsList = agentTools?.tools || [];

  const filteredTools = toolsList.filter(
    (tool) =>
      tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tool.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="space-y-6" aria-busy="true">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-md" />
          <Skeleton className="h-6 w-56" />
        </div>
        <CardSkeleton rows={4} />
        <Skeleton className="h-9 w-full sm:w-72" />
        <CardSkeleton rows={5} />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-danger-border bg-danger-subtle px-4 py-3 text-sm text-danger">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="flex-1">Could not load this agent. It may have been removed, or the API is unreachable.</div>
        <Link to="/agents" className="btn-ghost h-7 px-2">
          Back to agents
        </Link>
      </div>
    );
  }

  if (!agent) {
    return (
      <EmptyState
        icon={<Wrench className="h-5 w-5" />}
        title="Agent not found"
        description={
          agentName
            ? `No agent named “${agentName}” is registered in this workspace.`
            : 'This agent is not registered in this workspace.'
        }
        action={
          <Link to="/agents" className="btn-secondary">
            Back to agents
          </Link>
        }
      />
    );
  }

  const toolNames = agent.tools || [];

  return (
    <div className="space-y-6">
      {/* Back link & title */}
      <div className="flex items-center gap-3">
        <Link
          to="/agents"
          aria-label="Back to agents"
          title="Back to agents"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface-overlay hover:text-ink"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="page-title truncate">{agent.name}</h1>
        </div>
      </div>

      {/* Agent details */}
      <Card>
        <CardHeader title="Agent details" icon={<Wrench className="h-4 w-4" />} />
        <CardBody className="space-y-5">
          <div className="min-w-0">
            <h2 className="caption mb-1.5">Role</h2>
            <p className="text-sm text-ink">{agent.role}</p>
          </div>

          <div className="min-w-0">
            <h2 className="caption mb-1.5">Goal</h2>
            <p className="text-sm leading-relaxed text-ink-muted">
              {agent.goal || 'No goal provided.'}
            </p>
          </div>

          <div className="min-w-0">
            <h2 className="caption mb-2">Registered tools</h2>
            <div className="mb-3 flex items-center gap-2 text-sm text-ink-muted">
              <span className="tabular-nums">
                {toolsList.length > 0 ? toolsList.length : toolNames.length} tools
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {toolNames.slice(0, 8).map((tool, index) => (
                <Badge key={`${tool}-${index}`} tone="neutral" className="max-w-full">
                  <span className="truncate">{tool}</span>
                </Badge>
              ))}
              {toolNames.length === 0 && (
                <span className="text-sm text-ink-faint">No tools registered.</span>
              )}
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Search */}
      <div className="relative w-full sm:w-72">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
        <input
          type="text"
          role="searchbox"
          aria-label="Find tool"
          placeholder="Find tool"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          className="input pl-9"
        />
      </div>

      {/* Tools table */}
      <div className="surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table min-w-[560px]">
            <caption className="sr-only">Tools registered for {agent.name}</caption>
            <thead>
              <tr>
                <th>Tool name</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {filteredTools.length > 0 ? (
                filteredTools.map((tool, index) => (
                  <tr key={`${tool.name}-${index}`}>
                    <td className="max-w-[260px] truncate font-medium text-ink">{tool.name}</td>
                    <td className="min-w-0 break-words">{tool.description}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={2} className="py-8 text-center text-ink-subtle">
                    {toolsList.length > 0
                      ? 'No tools match your search.'
                      : 'No tools found'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
