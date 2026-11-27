import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api';
import type {
  Report,
  ReportListResponse,
  ShareReportResponse,
} from '../types';

export interface ReportFilters {
  limit?: number;
  offset?: number;
  q?: string;
  status?: string;
  prompt_id?: string;
}

export const useReports = (filters: ReportFilters = {}) => {
  const { limit = 50, offset = 0, q, status, prompt_id } = filters;
  return useQuery({
    queryKey: ['reports', { limit, offset, q, status, prompt_id }],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      params.set('offset', String(offset));
      if (q) params.set('q', q);
      if (status) params.set('status', status);
      if (prompt_id) params.set('prompt_id', prompt_id);
      const { data } = await api.get<ReportListResponse>(`/api/reports?${params.toString()}`);
      return data;
    },
    staleTime: 5000,
    refetchOnWindowFocus: true,
  });
};

export const useReport = (reportId: string | undefined) => {
  return useQuery({
    queryKey: ['report', reportId],
    queryFn: async () => {
      const { data } = await api.get<Report>(`/api/reports/${reportId}`);
      return data;
    },
    enabled: !!reportId,
  });
};

export const useReportForPrompt = (promptId: string | undefined) => {
  return useQuery({
    queryKey: ['report', 'prompt', promptId],
    queryFn: async () => {
      const { data } = await api.get<ReportListResponse>(
        `/api/reports?prompt_id=${promptId}&limit=1`
      );
      return data.reports[0] ?? null;
    },
    enabled: !!promptId,
  });
};

export const useSharedReport = (token: string | undefined) => {
  return useQuery({
    queryKey: ['report', 'shared', token],
    queryFn: async () => {
      const { data } = await api.get<Report>(`/api/reports/shared/${token}`);
      return data;
    },
    enabled: !!token,
    retry: false,
  });
};

export const useShareReport = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ reportId, expiresInDays = 30 }: { reportId: string; expiresInDays?: number }) => {
      const { data } = await api.post<ShareReportResponse>(`/api/reports/${reportId}/share`, {
        expires_in_days: expiresInDays,
      });
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['report', variables.reportId] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
    },
  });
};

export const useDeleteReport = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (reportId: string) => {
      const { data } = await api.delete<{ ok: boolean }>(`/api/reports/${reportId}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports'] });
    },
  });
};

export const useBackfillReports = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ limit = 20, force = false }: { limit?: number; force?: boolean } = {}) => {
      const { data } = await api.post<{ created: number; skipped: number; errors: Array<{ prompt_id: string; error: string }> }>(
        '/api/reports/backfill',
        { limit, force }
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports'] });
    },
  });
};

async function fetchBlob(path: string): Promise<Blob> {
  const response = await api.get(path, { responseType: 'blob' });
  return response.data as Blob;
}

export async function downloadReportMarkdown(reportId: string, title?: string | null) {
  const blob = await fetchBlob(`/api/reports/${reportId}/markdown`);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const slug = (title || 'report')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  link.download = `${slug || 'report'}-${reportId.slice(0, 8)}.md`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function openReportPrintView(reportId: string) {
  const blob = await fetchBlob(`/api/reports/${reportId}/html`);
  const url = URL.createObjectURL(new Blob([blob], { type: 'text/html' }));
  window.open(url, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
