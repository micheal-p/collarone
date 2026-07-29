// The org event spine's emit helper. Fire-and-forget by design: an event is a
// byproduct of work that already succeeded, so emitting must NEVER fail the
// caller (payment confirms don't roll back because a feed row didn't insert).
// Server-side only — org_events has no client insert policy, so every event
// in the feed is one a trusted code path actually emitted.
//
//   emitOrgEvent(admin, orgId, 'payment.confirmed', { amountKobo, reference })
//
// Type convention: dot-namespaced '<domain>.<happened>' — payment.confirmed,
// billing.renewal_due, hr.hired... Consumers filter by prefix.
export async function emitOrgEvent(admin, orgId, type, payload = {}, actorId = null) {
  try {
    await admin.from('org_events').insert({ org_id: orgId, type, payload, actor_id: actorId });
  } catch { /* never let an event break the work that caused it */ }
}
