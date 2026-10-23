const stageMessages: Record<string, string> = {
  queued: '受付が完了しました。処理が始まるまでお待ちください。',
  validating: '写真と編集内容を確認しています。',
  submitting: 'AIが仕上がりを作成しています。完成までそのままお待ちください。',
  waiting_provider: '仕上がりを待っています。',
  polling: '仕上がりを待っています。',
  generating: '仕上がりを待っています。',
  needs_reconciliation: '依頼の状況を確認しています。新しく依頼し直さず、このままお待ちください。',
  storing: '仕上がりを保存しています。',
  persisting: '仕上がりを保存しています。',
  settling: '編集の完了を確認しています。',
};

export function jobStageMessage(stage: string) {
  return stageMessages[stage] ?? '編集の状況を確認しています。画面を閉じても、履歴から再び確認できます。';
}

export type ProgressJob = { status: string; stage: string; created_at: string; completed_at: string | null };
export const jobSteps = ['受付・順番待ち', 'AIで編集中', '仕上がりを保存', '完了'] as const;
export function jobStep(job: Pick<ProgressJob, 'status' | 'stage'>): number | null {
  if (job.status === 'completed') return 3;
  if (job.status === 'queued') return 0;
  if (job.status !== 'processing') return null;
  return ['storing', 'persisting', 'settling'].includes(job.stage) ? 2 : 1;
}
export function jobElapsedSeconds(job: ProgressJob, now: number, observedAt: number) {
  const start = Date.parse(job.created_at);
  const terminal = ['completed', 'failed', 'cancelled'].includes(job.status);
  const completed = job.completed_at ? Date.parse(job.completed_at) : NaN;
  const end = terminal ? (Number.isFinite(completed) ? completed : observedAt) : now;
  return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, Math.floor((end - start) / 1000)) : 0;
}
export function formatElapsed(seconds: number) {
  const value = Math.max(0, Math.floor(seconds));
  if (value < 60) return `${value}秒`;
  if (value < 3600) return `${Math.floor(value / 60)}分${String(value % 60).padStart(2, '0')}秒`;
  return `${Math.floor(value / 3600)}時間${Math.floor(value % 3600 / 60)}分${String(value % 60).padStart(2, '0')}秒`;
}
