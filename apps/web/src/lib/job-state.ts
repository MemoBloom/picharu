const stageMessages: Record<string, string> = {
  queued: '受付が完了しました。処理が始まるまでお待ちください。',
  validating: '写真と編集内容を確認しています。',
  submitting: '編集を依頼しています。',
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
