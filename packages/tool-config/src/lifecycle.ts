// Retired product entries remain valid in immutable jobs, ledgers and Worker
// contracts. Retirement removes discovery/new generation, never historical IDs.
export const retiredToolIds = ['remove_person', 'remove_object'] as const;
export function isRetiredTool(id: string) {
 return retiredToolIds.some(retired => retired === id);
}
