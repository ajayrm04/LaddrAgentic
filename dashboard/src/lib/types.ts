// API Response Types

export interface HealthStatus {
  status: string;
  version: string;
  components: {
    database: string;
    storage: string;
    message_bus: string;
  };
}

export interface Agent {
  name: string;
  role: string;
  goal: string;
  status: string;
  tools: string[];
  last_seen?: string;
  trace_count: number;
  last_executed?: string;
}

// AgentQueueInfo removed - not available in v3.0 API

export interface Job {
  job_id: string;
  pipeline_name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  created_at?: string;
  completed_at?: string;
  inputs?: Record<string, any>;
  outputs?: Record<string, any>;
  error?: string | null;
  agent?: string;
  result?: any;
  duration_ms?: number;
  token_usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    by_model?: Array<{
      provider?: string | null;
      model?: string | null;
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
      calls?: number;
    }>;
  };
}

export interface PipelineRunRequest {
  pipeline_name: string;
  inputs?: Record<string, any>;
}

export interface Trace {
  id: string;
  job_id?: string;
  agent_name?: string;
  event_type: string;
  payload: Record<string, any>;
  timestamp: string;
  // Optional: present when UI should nest this trace under a parent (e.g., delegate_parallel)
  parent_trace_id?: number | string;
}

export interface Metric {
  name: string;
  value: number;
  timestamp: string;
  labels: Record<string, string>;
  type: 'counter' | 'gauge' | 'histogram';
}

export interface SystemMetrics {
  total_jobs: number;
  avg_latency_ms: number;
  active_agents_count: number;
  cache_hits: number;
  tool_calls: number;
  total_tokens: number;
  completed_jobs: number;
  failed_jobs: number;
  timestamp: string;
  // Optional fields from certain deployments
  total_prompts?: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
}

export interface ChatRequest {
  message: string;
  context?: Record<string, any>;
}

export interface ChatResponse {
  task_id: string;
  status: string;
  response?: string;
}

export interface LogMessage {
  timestamp: string;
  level: 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  agent_name: string;
  message: string;
  metadata?: Record<string, any>;
}

export interface SystemEvent {
  event_type: 'agent_started' | 'agent_stopped' | 'job_submitted' | 'job_completed' | 'job_failed' | 'error';
  timestamp: string;
  data: Record<string, any>;
}

// Cited reports

export interface ReportSource {
  id: string;
  url: string;
  title: string;
  domain: string;
  snippet?: string | null;
  retrieved_at?: string | null;
  tool?: string | null;
}

export interface ReportFinding {
  text: string;
  source_ids: string[];
  quote?: string | null;
  verified: boolean;
}

export interface ReportMethodologyStep {
  agent?: string | null;
  event: string;
  at?: string | null;
  tool?: string | null;
  detail?: string | null;
  status?: string | null;
  duration_ms?: number | null;
}

export interface Report {
  report_id: string;
  prompt_id: string | null;
  job_id: string | null;
  question: string;
  title: string | null;
  status: string;
  agent_name: string | null;
  summary: string | null;
  markdown?: string | null;
  sources: ReportSource[];
  findings: ReportFinding[];
  disagreements: string[];
  limitations: string | null;
  confidence: number | null;
  methodology: ReportMethodologyStep[];
  source_count: number;
  verified_count: number;
  markdown_key?: string | null;
  html_key?: string | null;
  share_token: string | null;
  share_expires_at: string | null;
  error: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface ReportListResponse {
  reports: Report[];
  limit: number;
  offset: number;
  total: number;
}

export interface ShareReportResponse {
  report_id: string;
  token: string;
  path: string;
  expires_at: string | null;
}

