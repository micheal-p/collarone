// ============================================================================
// Collarone AI — letter drafting endpoint (stub).
//
// The HR Letters composer calls this endpoint when the user clicks
// "Write with Collarone AI". The AI provider integration (OpenAI batch
// credits) is implemented by the platform owner — this stub documents the
// contract the UI depends on and returns a clear "not configured" error
// until the real implementation lands.
//
// CONTRACT (what client/src/suites/hr/lettersApi.js sends and expects):
//
//   POST /api/ai-letter
//   Headers: Authorization: Bearer <supabase access token>   (verify it!)
//   Body: {
//     letterType:      'confirmation' | 'promotion' | 'introduction' |
//                      'employment_verification' | 'query' | 'warning' | 'custom',
//     letterTypeLabel: 'Confirmation letter',
//     employeeName:    'Amaka Obi',
//     jobTitle:        'HR Manager',
//     department:      'People Ops',
//     startDate:       '2025-04-13',
//     companyName:     'Kaya Foods Ltd',
//     tone:            'formal Nigerian business correspondence',
//     instructions:    'optional free text from the HR manager',
//   }
//   200 → { body: '<plain-text letter body, Dear ... through Yours faithfully,>' }
//   4xx/5xx → { error: '<human-readable message>' }   (shown as a toast; the
//              composer stays usable for manual writing either way)
//
// Implementation notes for the real version:
//   - Verify the bearer token against Supabase (same pattern as admin.js)
//     before spending any AI credits — this endpoint is publicly reachable.
//   - Return ONLY the letter body text (no letterhead, no subject line) —
//     the client renders it onto the org's saved letterhead.
//   - Keep the response under ~400 words; Nigerian business-letter register.
// ============================================================================

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  return res.status(501).json({
    error: 'Collarone AI is not switched on yet — write the letter manually or use a template for now.',
  });
}
