import axios from 'axios';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Trash2, Wrench, X } from 'lucide-react';
import {
  useAgents,
  useCreateAgent,
  useDeleteAgent,
  useRestartAgentStack,
  waitForAgentRegistration,
  waitForAgentRemoval,
  type CreateAgentRequest,
} from '../../lib/queries/agents';

const EMPTY_FORM: CreateAgentRequest = {
  name: '',
  role: '',
  goal: '',
  backstory: '',
};

function getOperationError(error: unknown) {
  if (
    axios.isAxiosError<{
      detail?: string;
      agent_created?: boolean;
      agent_removed?: boolean;
      retryable?: boolean;
    }>(error)
  ) {
    if (error.code === 'ERR_NETWORK') {
      return {
        message:
          'Cannot reach the local Agent Manager. Start it with `python agent_manager.py` from the my_agent_system folder.',
        agentCreated: false,
        agentRemoved: false,
        retryable: true,
      };
    }
    return {
      message: error.response?.data?.detail || error.message,
      agentCreated: error.response?.data?.agent_created === true,
      agentRemoved: error.response?.data?.agent_removed === true,
      retryable: error.response?.data?.retryable === true,
    };
  }
  return {
    message: error instanceof Error ? error.message : 'The operation failed.',
    agentCreated: false,
    agentRemoved: false,
    retryable: false,
  };
}

export default function AgentsList() {
  const { data: agents, isLoading, isError, error } = useAgents();
  const createAgent = useCreateAgent();
  const deleteAgent = useDeleteAgent();
  const restartStack = useRestartAgentStack();
  const [isAddAgentOpen, setIsAddAgentOpen] = useState(false);
  const [form, setForm] = useState<CreateAgentRequest>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [stackUpdateRequired, setStackUpdateRequired] = useState(false);
  const [pendingAgentRefreshName, setPendingAgentRefreshName] = useState<string | null>(null);
  const [waitingForAgent, setWaitingForAgent] = useState(false);
  const [agentToDelete, setAgentToDelete] = useState<string | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleteRetryable, setDeleteRetryable] = useState(false);
  const [pendingAgentRemovalName, setPendingAgentRemovalName] = useState<string | null>(null);
  const [waitingForRemoval, setWaitingForRemoval] = useState(false);
  const isBusy =
    createAgent.isPending ||
    deleteAgent.isPending ||
    restartStack.isPending ||
    waitingForAgent ||
    waitingForRemoval;

  const updateForm = (field: keyof CreateAgentRequest, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const openAddAgentForm = () => {
    setForm(EMPTY_FORM);
    setFormError('');
    setStackUpdateRequired(false);
    setPendingAgentRefreshName(null);
    setIsAddAgentOpen(true);
  };

  const openDeleteAgentDialog = (name: string) => {
    setAgentToDelete(name);
    setDeleteConfirmation('');
    setDeleteError('');
    setDeleteRetryable(false);
    setPendingAgentRemovalName(null);
  };

  const waitAndRefresh = async (agentName: string) => {
    setWaitingForAgent(true);
    setFormError('');
    try {
      await waitForAgentRegistration(agentName);
      window.location.reload();
    } catch (readinessError) {
      const message =
        readinessError instanceof Error
          ? readinessError.message
          : 'The API is not ready yet. Check the worker logs and try again.';
      setFormError(message);
      setStackUpdateRequired(false);
    } finally {
      setWaitingForAgent(false);
    }
  };

  const submitAgent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError('');
    setStackUpdateRequired(false);

    try {
      const result = await createAgent.mutateAsync(form);
      setPendingAgentRefreshName(result.name);
      await waitAndRefresh(result.name);
    } catch (operationError) {
      const result = getOperationError(operationError);
      setFormError(result.message);
      setStackUpdateRequired(result.agentCreated);
    }
  };

  const retryStackUpdate = async () => {
    setFormError('');
    try {
      await restartStack.mutateAsync();
      setStackUpdateRequired(false);
      setPendingAgentRefreshName(form.name);
      await waitAndRefresh(form.name);
    } catch (operationError) {
      setFormError(getOperationError(operationError).message);
    }
  };

  const waitAndRefreshRemoval = async (agentName: string) => {
    setWaitingForRemoval(true);
    setDeleteError('');
    try {
      await waitForAgentRemoval(agentName);
      window.location.reload();
    } catch (readinessError) {
      const message =
        readinessError instanceof Error
          ? readinessError.message
          : 'The API is not ready yet. Check the stack, then try again.';
      setDeleteError(message);
      setDeleteRetryable(true);
    } finally {
      setWaitingForRemoval(false);
    }
  };

  const submitDeleteAgent = async (
    event?: FormEvent<HTMLFormElement>,
    retry = false
  ) => {
    event?.preventDefault();
    if (!agentToDelete || deleteConfirmation !== agentToDelete) {
      return;
    }

    setDeleteError('');
    setDeleteRetryable(false);
    try {
      const result = await deleteAgent.mutateAsync({
        name: agentToDelete,
        ...(retry ? { retry: true } : {}),
      });
      setPendingAgentRemovalName(result.name);
      await waitAndRefreshRemoval(result.name);
    } catch (operationError) {
      const result = getOperationError(operationError);
      setDeleteError(result.message);
      setDeleteRetryable(result.agentRemoved || result.retryable);
      if (result.agentRemoved) {
        setPendingAgentRemovalName(agentToDelete);
      }
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-400">Loading agents...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-cyan-400">Agents</h1>
          <p className="mt-1 text-xs text-gray-500">
            Start <code>python agent_manager.py</code> once from the my_agent_system folder to add or delete agents.
          </p>
        </div>
        <button
          type="button"
          onClick={openAddAgentForm}
          className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 font-medium text-white transition-colors hover:bg-cyan-500"
        >
          <Plus className="h-4 w-4" />
          Add agent
        </button>
      </div>

      {isError && (
        <div className="rounded-lg border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">
          {error instanceof Error ? error.message : 'Could not load agents.'}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {agents && agents.length > 0 ? (
          agents.map((agent) => (
            <article
              key={agent.name}
              className="rounded-lg border border-gray-800 bg-[#1f1f1f] p-6 transition-colors hover:border-cyan-400"
            >
              <Link to={`/agents/${agent.name}`} className="group block">
                <h3 className="mb-2 text-lg font-semibold text-cyan-400 transition-colors group-hover:text-cyan-300">
                  {agent.name}
                </h3>
                <p className="mb-4 text-sm text-gray-400">{agent.role}</p>
                <p className="mb-6 line-clamp-3 text-sm text-gray-300">
                  {agent.goal || 'No goal provided.'}
                </p>
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <Wrench className="h-4 w-4 text-cyan-400" />
                  <span>{agent.tools?.length || 0} tools</span>
                </div>
              </Link>
              <button
                type="button"
                onClick={() => openDeleteAgentDialog(agent.name)}
                className="mt-5 inline-flex items-center gap-2 rounded border border-red-900/70 px-3 py-2 text-sm text-red-300 transition-colors hover:border-red-600 hover:bg-red-950/40"
              >
                <Trash2 className="h-4 w-4" />
                Delete agent
              </button>
            </article>
          ))
        ) : (
          !isError && (
            <div className="col-span-full py-12 text-center">
              <p className="text-gray-400">No agents configured yet.</p>
              <button
                type="button"
                onClick={openAddAgentForm}
                className="mt-3 text-cyan-400 hover:text-cyan-300"
              >
                Add your first agent
              </button>
            </div>
          )
        )}
      </div>

      {isAddAgentOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <section
            aria-labelledby="add-agent-title"
            aria-modal="true"
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-gray-700 bg-[#1f2121] shadow-2xl"
            role="dialog"
          >
            <div className="flex items-center justify-between border-b border-gray-800 px-6 py-4">
              <div>
                <h2 id="add-agent-title" className="text-xl font-semibold text-white">
                  Add agent
                </h2>
                <p className="mt-1 text-sm text-gray-400">
                  The project CLI will create the agent, then Docker Compose will rebuild and start the stack.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddAgentOpen(false)}
                disabled={isBusy}
                aria-label="Close dialog"
                className="rounded p-2 text-gray-400 hover:bg-gray-800 hover:text-white disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={submitAgent} className="space-y-4 p-6">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-300">Agent name</span>
                <input
                  required
                  pattern="[a-z][a-z0-9_]{0,49}"
                  maxLength={50}
                  value={form.name}
                  onChange={(event) => updateForm('name', event.target.value)}
                  placeholder="e.g. summarizer"
                  title="Use lowercase letters, numbers, and underscores; start with a letter."
                  className="w-full rounded-lg border border-gray-700 bg-[#0d0e0e] px-3 py-2 text-white outline-none focus:border-cyan-400"
                />
                <span className="mt-1 block text-xs text-gray-500">
                  Use lowercase snake_case; hyphens and spaces are not allowed.
                </span>
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-300">Role</span>
                <input
                  required
                  maxLength={200}
                  value={form.role}
                  onChange={(event) => updateForm('role', event.target.value)}
                  placeholder="e.g. Research Specialist"
                  className="w-full rounded-lg border border-gray-700 bg-[#0d0e0e] px-3 py-2 text-white outline-none focus:border-cyan-400"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-300">Goal</span>
                <textarea
                  required
                  rows={3}
                  maxLength={2000}
                  value={form.goal}
                  onChange={(event) => updateForm('goal', event.target.value)}
                  placeholder="What should this agent accomplish?"
                  className="w-full resize-y rounded-lg border border-gray-700 bg-[#0d0e0e] px-3 py-2 text-white outline-none focus:border-cyan-400"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-300">Backstory</span>
                <textarea
                  required
                  rows={4}
                  maxLength={4000}
                  value={form.backstory}
                  onChange={(event) => updateForm('backstory', event.target.value)}
                  placeholder="Describe the agent's expertise and context."
                  className="w-full resize-y rounded-lg border border-gray-700 bg-[#0d0e0e] px-3 py-2 text-white outline-none focus:border-cyan-400"
                />
              </label>

              {formError && (
                <div className="rounded-lg border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">
                  <p className="whitespace-pre-wrap">{formError}</p>
                  {stackUpdateRequired && (
                    <button
                      type="button"
                      onClick={retryStackUpdate}
                      disabled={isBusy}
                      className="mt-3 rounded bg-red-800 px-3 py-2 font-medium text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      {restartStack.isPending ? 'Updating stack...' : 'Retry Docker Compose update'}
                    </button>
                  )}
                  {pendingAgentRefreshName && !waitingForAgent && (
                    <button
                      type="button"
                      onClick={() => void waitAndRefresh(pendingAgentRefreshName)}
                      disabled={isBusy}
                      className="mt-3 rounded bg-gray-700 px-3 py-2 font-medium text-white hover:bg-gray-600 disabled:opacity-50"
                    >
                      Check readiness and refresh
                    </button>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-3 border-t border-gray-800 pt-4">
                <button
                  type="button"
                  onClick={() => setIsAddAgentOpen(false)}
                  disabled={isBusy}
                  className="rounded-lg border border-gray-700 px-4 py-2 text-gray-300 hover:bg-gray-800 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isBusy || pendingAgentRefreshName !== null}
                  className="rounded-lg bg-cyan-600 px-4 py-2 font-medium text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {waitingForAgent
                    ? 'Waiting for API and agent...'
                    : createAgent.isPending
                      ? 'Creating agent and rebuilding...'
                      : pendingAgentRefreshName
                        ? 'Agent created'
                        : 'Create agent'}
                </button>
              </div>
              {createAgent.isPending && (
                <p aria-live="polite" className="text-right text-xs text-gray-400">
                  This can take several minutes while Docker rebuilds the stack.
                </p>
              )}
              {waitingForAgent && (
                <p aria-live="polite" className="text-right text-xs text-gray-400">
                  The stack is back up. Waiting for the API and new agent to be ready before refreshing this page.
                </p>
              )}
            </form>
          </section>
        </div>
      )}

      {agentToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <section
            aria-labelledby="delete-agent-title"
            aria-modal="true"
            className="w-full max-w-xl rounded-xl border border-gray-700 bg-[#1f2121] shadow-2xl"
            role="dialog"
          >
            <div className="flex items-center justify-between border-b border-gray-800 px-6 py-4">
              <div>
                <h2 id="delete-agent-title" className="text-xl font-semibold text-white">
                  Delete {agentToDelete}
                </h2>
                <p className="mt-1 text-sm text-gray-400">
                  The project files, Compose worker, and agent registry entry will be removed.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAgentToDelete(null)}
                disabled={isBusy}
                aria-label="Close dialog"
                className="rounded p-2 text-gray-400 hover:bg-gray-800 hover:text-white disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              onSubmit={(event) => void submitDeleteAgent(event)}
              className="space-y-4 p-6"
            >
              <div className="rounded-lg border border-amber-900/70 bg-amber-950/30 p-3 text-sm text-amber-200">
                Existing runs, traces, and history are retained. This cannot be undone.
              </div>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-300">
                  Type <code className="text-white">{agentToDelete}</code> to confirm
                </span>
                <input
                  required
                  autoComplete="off"
                  value={deleteConfirmation}
                  onChange={(event) => setDeleteConfirmation(event.target.value)}
                  className="w-full rounded-lg border border-gray-700 bg-[#0d0e0e] px-3 py-2 text-white outline-none focus:border-red-400"
                />
              </label>

              {deleteError && (
                <div className="rounded-lg border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">
                  <p className="whitespace-pre-wrap">{deleteError}</p>
                  {deleteRetryable && (
                    <button
                      type="button"
                      onClick={() => void submitDeleteAgent(undefined, true)}
                      disabled={isBusy || deleteConfirmation !== agentToDelete}
                      className="mt-3 rounded bg-red-800 px-3 py-2 font-medium text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      {deleteAgent.isPending
                        ? 'Retrying deletion...'
                        : 'Retry deletion and Docker Compose update'}
                    </button>
                  )}
                  {pendingAgentRemovalName && !waitingForRemoval && (
                    <button
                      type="button"
                      onClick={() => void waitAndRefreshRemoval(pendingAgentRemovalName)}
                      disabled={isBusy}
                      className="mt-3 rounded bg-gray-700 px-3 py-2 font-medium text-white hover:bg-gray-600 disabled:opacity-50"
                    >
                      Check removal and refresh
                    </button>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-3 border-t border-gray-800 pt-4">
                <button
                  type="button"
                  onClick={() => setAgentToDelete(null)}
                  disabled={isBusy}
                  className="rounded-lg border border-gray-700 px-4 py-2 text-gray-300 hover:bg-gray-800 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isBusy || deleteConfirmation !== agentToDelete}
                  className="inline-flex items-center gap-2 rounded-lg bg-red-700 px-4 py-2 font-medium text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {waitingForRemoval
                    ? 'Waiting for API...'
                    : deleteAgent.isPending
                      ? 'Deleting and rebuilding...'
                      : 'Delete agent'}
                </button>
              </div>
              {(deleteAgent.isPending || waitingForRemoval) && (
                <p aria-live="polite" className="text-right text-xs text-gray-400">
                  {deleteAgent.isPending
                    ? 'Docker is updating the stack. This can take several minutes.'
                    : 'Waiting for the API to confirm the agent is gone before refreshing this page.'}
                </p>
              )}
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
