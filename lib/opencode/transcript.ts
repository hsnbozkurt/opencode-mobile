import type { TranscriptDetail, TranscriptEntry } from '@/lib/opencode/format';

export type TranscriptActivityRow = {
  id: string;
  kind: TranscriptDetail['kind'];
  verb: string;
  target: string;
  status?: string;
};

const TOOL_VERBS: Record<string, string> = {
  write: 'Wrote',
  edit: 'Edited',
  read: 'Read',
  bash: 'Ran',
  list: 'Listed',
  grep: 'Searched',
  glob: 'Found',
  patch: 'Applied patch',
  web_search: 'Web search',
  web_fetch: 'Fetched',
  todo_update: 'Updated todos',
  task: 'Delegated',
  kill_agents: 'Stopped agents',
};

function firstLine(value: string) {
  const line = value.split('\n')[0] ?? '';
  return line.trim();
}

export function getTranscriptActivityRows(details: TranscriptDetail[]): TranscriptActivityRow[] {
  return details.flatMap((detail): TranscriptActivityRow[] => {
    switch (detail.kind) {
      case 'tool':
        return [{
          id: detail.id,
          kind: 'tool',
          verb: TOOL_VERBS[detail.toolName] ?? 'Ran',
          target: firstLine(detail.label),
          status: detail.status,
        }];
      case 'patch':
        return [{
          id: detail.id,
          kind: 'patch',
          verb: 'Patch',
          target: detail.label,
        }];
      case 'file':
        return [{
          id: detail.id,
          kind: 'file',
          verb: 'File',
          target: firstLine(detail.label),
        }];
      case 'reasoning':
        return [{
          id: detail.id,
          kind: 'reasoning',
          verb: 'Reasoning',
          target: firstLine(detail.body),
        }];
      case 'subtask':
        return [{
          id: detail.id,
          kind: 'subtask',
          verb: 'Subtask',
          target: firstLine(detail.body),
        }];
      case 'step':
        return [{
          id: detail.id,
          kind: 'step',
          verb: detail.label,
          target: firstLine(detail.body),
        }];
      case 'agent':
        return [{
          id: detail.id,
          kind: 'agent',
          verb: 'Agent',
          target: firstLine(detail.body),
        }];
      case 'retry':
        return [{
          id: detail.id,
          kind: 'retry',
          verb: detail.label,
          target: firstLine(detail.body),
        }];
      case 'compaction':
        return [{
          id: detail.id,
          kind: 'compaction',
          verb: 'Compaction',
          target: detail.label,
        }];
      default:
        return [];
    }
  });
}

export function getTranscriptActivityLabel(entry: TranscriptEntry) {
  const runningTool = entry.details.find((detail) => detail.kind === 'tool' && detail.status === 'running');
  if (runningTool) {
    return runningTool.label;
  }

  const latestTool = [...entry.details].reverse().find((detail) => detail.kind === 'tool');
  if (latestTool) {
    return latestTool.label;
  }

  const latestPatch = [...entry.details].reverse().find((detail) => detail.kind === 'patch');
  if (latestPatch) {
    return latestPatch.label;
  }

  const latestReasoning = [...entry.details].reverse().find((detail) => detail.kind === 'reasoning');
  if (latestReasoning) {
    return latestReasoning.label;
  }

  const latestStep = [...entry.details].reverse().find((detail) => detail.kind === 'step' || detail.kind === 'subtask');
  if (latestStep) {
    return latestStep.label;
  }

  return undefined;
}

export function isTranscriptDisplayMessage(entry: TranscriptEntry) {
  if (entry.role === 'user') {
    return true;
  }

  return Boolean(entry.text.trim() || entry.error);
}

export function summarizeTranscriptDetails(details: TranscriptDetail[]) {
  const patches = details.filter((detail) => detail.kind === 'patch').length;
  const files = details.filter((detail) => detail.kind === 'file').length;
  const runningTool = details.find((detail) => detail.kind === 'tool' && detail.status === 'running');
  const failedRetry = details.find((detail) => detail.kind === 'retry');
  const summaries: string[] = [];

  if (runningTool) {
    summaries.push(runningTool.label);
  }

  if (patches > 0) {
    summaries.push(`Updated ${patches} patch${patches === 1 ? '' : 'es'}`);
  }

  if (files > 0) {
    summaries.push(`${files} file${files === 1 ? '' : 's'}`);
  }

  if (failedRetry) {
    summaries.push(failedRetry.label);
  }

  return summaries;
}
