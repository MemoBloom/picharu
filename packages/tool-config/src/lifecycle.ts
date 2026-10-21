// Product retirement does not invalidate IDs in historical jobs or Worker snapshots.
export const retiredToolIds = ['remove_person', 'remove_object'] as const;
export function isRetiredTool(id: string) {
  return retiredToolIds.some(retired => retired === id);
}
