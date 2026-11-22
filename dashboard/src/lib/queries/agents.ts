import axios from 'axios';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api';
import type { Agent, ChatRequest, ChatResponse } from '../types';

export interface CreateAgentRequest {
  name: string;
  role: string;
  goal: string;
  backstory: string;
}

export interface DeleteAgentRequest {
  name: string;
  retry?: boolean;
}

const AGENT_MANAGER_URL = 'http://127.0.0.1:8765';

export const waitForAgentRegistration = async (agentName: string): Promise<void> => {
  const deadline = Date.now() + 120_000;
  let lastApiError: unknown;

  while (Date.now() < deadline) {
    try {
      const { data } = await api.get<{ agents: Agent[] }>('/api/agents', {
        timeout: 5000,
      });
      if (data.agents.some((agent) => agent.name === agentName)) {
        return;
      }
    } catch (error) {
      if (
        !axios.isAxiosError(error) ||
        (error.response && error.response.status < 500)
      ) {
        throw error;
      }
      lastApiError = error;
    }

    const remaining = deadline - Date.now();
    if (remaining > 0) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(2000, remaining)));
    }
  }

  const lastErrorDetail =
    lastApiError instanceof Error ? ` Last API error: ${lastApiError.message}` : '';
  throw new Error(
    `Timed out waiting for "${agentName}" to appear in the Agents list.${lastErrorDetail} ` +
      'The stack update completed. Check the worker logs, then try checking readiness again.'
  );
};

export const waitForAgentRemoval = async (agentName: string): Promise<void> => {
  const deadline = Date.now() + 120_000;
  let lastApiError: unknown;

  while (Date.now() < deadline) {
    try {
      const { data } = await api.get<{ agents: Agent[] }>('/api/agents', {
        timeout: 5000,
      });
      if (!data.agents.some((agent) => agent.name === agentName)) {
        return;
      }
    } catch (error) {
      if (
        !axios.isAxiosError(error) ||
        (error.response && error.response.status < 500)
      ) {
        throw error;
      }
      lastApiError = error;
    }

    const remaining = deadline - Date.now();
    if (remaining > 0) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(2000, remaining)));
    }
  }

  const lastErrorDetail =
    lastApiError instanceof Error ? ` Last API error: ${lastApiError.message}` : '';
  throw new Error(
    `Timed out waiting for "${agentName}" to disappear from the Agents list.${lastErrorDetail} ` +
      'The stack update completed. Check the API, then try checking removal again.'
  );
};

export const useAgents = () => {
  return useQuery({
    queryKey: ['agents'],
    queryFn: async () => {
      const { data } = await api.get<{ agents: Agent[] }>('/api/agents');
      return data.agents;
    },
  });
};

export const useCreateAgent = () => {
  return useMutation({
    mutationFn: async (request: CreateAgentRequest) => {
      const { data } = await axios.post<{ name: string; message: string }>(
        `${AGENT_MANAGER_URL}/agents`,
        request,
        { timeout: 25 * 60 * 1000 }
      );
      return data;
    },
  });
};

export const useDeleteAgent = () => {
  return useMutation({
    mutationFn: async (request: DeleteAgentRequest) => {
      const { data } = await axios.post<{ name: string; message: string }>(
        `${AGENT_MANAGER_URL}/agents/delete`,
        request,
        { timeout: 25 * 60 * 1000 }
      );
      return data;
    },
  });
};

export const useRestartAgentStack = () => {
  return useMutation({
    mutationFn: async () => {
      const { data } = await axios.post<{ message: string }>(
        `${AGENT_MANAGER_URL}/stack/restart`,
        {},
        { timeout: 25 * 60 * 1000 }
      );
      return data;
    },
  });
};

export const useAgent = (agentName: string) => {
  const agents = useAgents();
  
  return {
    ...agents,
    data: agents.data?.find(a => a.name === agentName),
  };
};

// Agent queue endpoint not available in v3.0 - removed
// Use job status and traces instead

export const useAgentChat = (agentName: string) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (request: ChatRequest) => {
      const { data } = await api.post<ChatResponse>(
        `/api/agents/${agentName}/chat`,
        { message: request.message, wait: true, timeout: 30 }
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents', agentName] });
    },
  });
};
