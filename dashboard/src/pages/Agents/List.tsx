import axios from 'axios';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Plus, Trash2, Wrench, X } from 'lucide-react';
import clsx from 'clsx';
import { Card, CardSkeleton, EmptyState, PageHeader } from '../../components/ui';
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

/* ------------------------------------------------------------------ */
/* Shared modal shell (spec §11): backdrop + header + X + footer.      */
/* Escape-to-close, body scroll lock, backdrop click and initial focus  */
/* are handled here so every dialog in this file behaves identically.   */
/* ------------------------------------------------------------------ */

function ModalShell({
  titleId,
  title,
  description,
  onClose,
  closeDisabled = false,
  onSubmit,
  panelClassName = 'max-w-2xl',
  footer,
  afterFooter,
  children,
}: {
  titleId: string;
  title: ReactNode;
  description?: ReactNode;
  onClose: () => void;
  closeDisabled?: boolean;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  panelClassName?: string;
  footer?: ReactNode;
  afterFooter?: ReactNode;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const closeDisabledRef = useRef(closeDisabled);
  onCloseRef.current = onClose;
  closeDisabledRef.current = closeDisabled;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !closeDisabledRef.current) {
        onCloseRef.current();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const requestClose = () => {
    if (!closeDisabled) onClose();
  };

  const footerMarkup = footer ? (
    <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-4">
      {footer}
    </div>
  ) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className={clsx(
          'surface max-h-[90vh] w-full overflow-y-auto shadow-pop animate-fade-up focus:outline-none',
          panelClassName
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="section-title">
              {title}
            </h2>
            {description && (
              <p className="mt-1 text-sm text-ink-subtle">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={requestClose}
            disabled={closeDisabled}
            aria-label="Close dialog"
            title="Close dialog"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface-overlay hover:text-ink disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {onSubmit ? (
          <form onSubmit={onSubmit}>
            <div className="space-y-4 p-5">{children}</div>
            {footerMarkup}
            {afterFooter}
          </form>
        ) : (
          <>
            <div className="space-y-4 p-5">{children}</div>
            {footerMarkup}
            {afterFooter}
          </>
        )}
      </div>
    </div>
  );
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agents"
        description={
          <>
            Start <code className="rounded bg-surface-overlay px-1 py-0.5 font-mono text-xs text-ink">
              python agent_manager.py
            </code>{' '}
            once from the my_agent_system folder to add or delete agents.
          </>
        }
        actions={
          <button type="button" onClick={openAddAgentForm} className="btn-primary">
            <Plus className="h-4 w-4" />
            Add agent
          </button>
        }
      />

      {isError && (
        <div className="flex items-start gap-3 rounded-lg border border-danger-border bg-danger-subtle px-4 py-3 text-sm text-danger">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">
            {error instanceof Error ? error.message : 'Could not load agents.'}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, index) => (
            <CardSkeleton key={`agent-skeleton-${index}`} rows={3} />
          ))
        ) : agents && agents.length > 0 ? (
          agents.map((agent) => (
            <Card hover as="article" key={agent.name} className="flex flex-col p-5">
              <Link to={`/agents/${agent.name}`} className="group block min-w-0">
                <h3 className="truncate text-base font-semibold text-ink transition-colors group-hover:text-primary-300">
                  {agent.name}
                </h3>
                <p className="mt-1 truncate text-sm text-ink-subtle">{agent.role}</p>
                <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-ink-muted">
                  {agent.goal || 'No goal provided.'}
                </p>
                <div className="mt-4 flex items-center gap-2 text-sm text-ink-muted">
                  <Wrench className="h-4 w-4 shrink-0 text-primary-400" />
                  <span className="tabular-nums">{agent.tools?.length || 0} tools</span>
                </div>
              </Link>
              <button
                type="button"
                onClick={() => openDeleteAgentDialog(agent.name)}
                className="btn-danger mt-4 self-start"
              >
                <Trash2 className="h-4 w-4" />
                Delete agent
              </button>
            </Card>
          ))
        ) : (
          !isError && (
            <div className="col-span-full">
              <EmptyState
                icon={<Wrench className="h-5 w-5" />}
                title="No agents configured yet"
                description="Agents are registered through the project CLI and started by Docker Compose."
                action={
                  <button type="button" onClick={openAddAgentForm} className="btn-primary">
                    <Plus className="h-4 w-4" />
                    Add your first agent
                  </button>
                }
              />
            </div>
          )
        )}
      </div>

      {isAddAgentOpen && (
        <ModalShell
          titleId="add-agent-title"
          title="Add agent"
          description="The project CLI will create the agent, then Docker Compose will rebuild and start the stack."
          onClose={() => setIsAddAgentOpen(false)}
          closeDisabled={isBusy}
          onSubmit={submitAgent}
          footer={
            <>
              <button
                type="button"
                onClick={() => setIsAddAgentOpen(false)}
                disabled={isBusy}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isBusy || pendingAgentRefreshName !== null}
                className="btn-primary"
              >
                {waitingForAgent
                  ? 'Waiting for API and agent...'
                  : createAgent.isPending
                    ? 'Creating agent and rebuilding...'
                    : pendingAgentRefreshName
                      ? 'Agent created'
                      : 'Create agent'}
              </button>
            </>
          }
          afterFooter={
            <>
              {createAgent.isPending && (
                <p aria-live="polite" className="px-5 pb-4 text-right text-xs text-ink-subtle">
                  This can take several minutes while Docker rebuilds the stack.
                </p>
              )}
              {waitingForAgent && (
                <p aria-live="polite" className="px-5 pb-4 text-right text-xs text-ink-subtle">
                  The stack is back up. Waiting for the API and new agent to be ready before
                  refreshing this page.
                </p>
              )}
            </>
          }
        >
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ink-muted">Agent name</span>
            <input
              required
              pattern="[a-z][a-z0-9_]{0,49}"
              maxLength={50}
              value={form.name}
              onChange={(event) => updateForm('name', event.target.value)}
              placeholder="e.g. summarizer"
              title="Use lowercase letters, numbers, and underscores; start with a letter."
              className="input"
            />
            <span className="mt-1.5 block text-xs text-ink-faint">
              Use lowercase snake_case; hyphens and spaces are not allowed.
            </span>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ink-muted">Role</span>
            <input
              required
              maxLength={200}
              value={form.role}
              onChange={(event) => updateForm('role', event.target.value)}
              placeholder="e.g. Research Specialist"
              className="input"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ink-muted">Goal</span>
            <textarea
              required
              rows={3}
              maxLength={2000}
              value={form.goal}
              onChange={(event) => updateForm('goal', event.target.value)}
              placeholder="What should this agent accomplish?"
              className="input resize-y"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ink-muted">Backstory</span>
            <textarea
              required
              rows={4}
              maxLength={4000}
              value={form.backstory}
              onChange={(event) => updateForm('backstory', event.target.value)}
              placeholder="Describe the agent's expertise and context."
              className="input resize-y"
            />
          </label>

          {formError && (
            <div className="flex items-start gap-3 rounded-lg border border-danger-border bg-danger-subtle px-4 py-3 text-sm text-danger">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="flex-1">
                <p className="whitespace-pre-wrap">{formError}</p>
                {stackUpdateRequired && (
                  <button
                    type="button"
                    onClick={retryStackUpdate}
                    disabled={isBusy}
                    className="btn-danger mt-3"
                  >
                    {restartStack.isPending ? 'Updating stack...' : 'Retry Docker Compose update'}
                  </button>
                )}
                {pendingAgentRefreshName && !waitingForAgent && (
                  <button
                    type="button"
                    onClick={() => void waitAndRefresh(pendingAgentRefreshName)}
                    disabled={isBusy}
                    className="btn-secondary mt-3"
                  >
                    Check readiness and refresh
                  </button>
                )}
              </div>
            </div>
          )}
        </ModalShell>
      )}

      {agentToDelete && (
        <ModalShell
          titleId="delete-agent-title"
          title={`Delete ${agentToDelete}`}
          description="The project files, Compose worker, and agent registry entry will be removed."
          onClose={() => setAgentToDelete(null)}
          closeDisabled={isBusy}
          panelClassName="max-w-xl"
          onSubmit={(event) => void submitDeleteAgent(event)}
          footer={
            <>
              <button
                type="button"
                onClick={() => setAgentToDelete(null)}
                disabled={isBusy}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isBusy || deleteConfirmation !== agentToDelete}
                className="btn-danger"
              >
                {waitingForRemoval
                  ? 'Waiting for API...'
                  : deleteAgent.isPending
                    ? 'Deleting and rebuilding...'
                    : 'Delete agent'}
              </button>
            </>
          }
          afterFooter={
            (deleteAgent.isPending || waitingForRemoval) && (
              <p aria-live="polite" className="px-5 pb-4 text-right text-xs text-ink-subtle">
                {deleteAgent.isPending
                  ? 'Docker is updating the stack. This can take several minutes.'
                  : 'Waiting for the API to confirm the agent is gone before refreshing this page.'}
              </p>
            )
          }
        >
          <div className="flex items-start gap-3 rounded-lg border border-warning-border bg-warning-subtle px-4 py-3 text-sm text-warning">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>Existing runs, traces, and history are retained. This cannot be undone.</div>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ink-muted">
              Type <code className="font-mono text-ink">{agentToDelete}</code> to confirm
            </span>
            <input
              required
              autoComplete="off"
              value={deleteConfirmation}
              onChange={(event) => setDeleteConfirmation(event.target.value)}
              className="input"
            />
          </label>

          {deleteError && (
            <div className="flex items-start gap-3 rounded-lg border border-danger-border bg-danger-subtle px-4 py-3 text-sm text-danger">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="flex-1">
                <p className="whitespace-pre-wrap">{deleteError}</p>
                {deleteRetryable && (
                  <button
                    type="button"
                    onClick={() => void submitDeleteAgent(undefined, true)}
                    disabled={isBusy || deleteConfirmation !== agentToDelete}
                    className="btn-danger mt-3"
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
                    className="btn-secondary mt-3"
                  >
                    Check removal and refresh
                  </button>
                )}
              </div>
            </div>
          )}
        </ModalShell>
      )}
    </div>
  );
}
