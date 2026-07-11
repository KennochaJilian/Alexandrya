import crypto from 'node:crypto';
import { logger, serializeError } from '../utils/logger.js';

export type MaintenanceJobType = 'library-rescan' | 'search-reindex';
export type MaintenanceJobStatus = 'running' | 'completed' | 'failed';

export interface MaintenanceJobResult {
  total: number;
  indexed?: boolean;
}

export interface MaintenanceJob {
  id: string;
  type: MaintenanceJobType;
  status: MaintenanceJobStatus;
  startedAt: string;
  finishedAt?: string;
  result?: MaintenanceJobResult;
  error?: string;
}

const jobs = new Map<string, MaintenanceJob>();

function snapshot(job: MaintenanceJob): MaintenanceJob {
  return { ...job, result: job.result ? { ...job.result } : undefined };
}

function findRunningJob(type: MaintenanceJobType): MaintenanceJob | undefined {
  return [...jobs.values()].find((job) => job.type === type && job.status === 'running');
}

function pruneCompletedJobs() {
  const completedJobs = [...jobs.values()]
    .filter((job) => job.status !== 'running')
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt));

  completedJobs.slice(20).forEach((job) => jobs.delete(job.id));
}

export function startMaintenanceJob(
  type: MaintenanceJobType,
  runner: () => Promise<MaintenanceJobResult>
): MaintenanceJob {
  const runningJob = findRunningJob(type);

  if (runningJob) {
    return snapshot(runningJob);
  }

  const job: MaintenanceJob = {
    id: crypto.randomUUID(),
    type,
    status: 'running',
    startedAt: new Date().toISOString()
  };

  jobs.set(job.id, job);
  logger.info('maintenance job started', { jobId: job.id, type: job.type });

  void runner()
    .then((result) => {
      job.status = 'completed';
      job.result = result;
      job.finishedAt = new Date().toISOString();
      logger.info('maintenance job completed', {
        jobId: job.id,
        type: job.type,
        result
      });
      pruneCompletedJobs();
    })
    .catch((error: unknown) => {
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : String(error);
      job.finishedAt = new Date().toISOString();
      logger.error('maintenance job failed', {
        jobId: job.id,
        type: job.type,
        error: serializeError(error)
      });
      pruneCompletedJobs();
    });

  return snapshot(job);
}

export function getMaintenanceJob(id: string): MaintenanceJob | undefined {
  const job = jobs.get(id);
  return job ? snapshot(job) : undefined;
}
