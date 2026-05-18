const MS_PER_DAY = 1000 * 60 * 60 * 24
const NEW_USER_DAYS = 7
const NEW_USER_PITCH_THRESHOLD = 5

// CR-4 AC2.3 — OR (not AND): either signal keeps the user in 'new' state
// until *both* graduation signals fire. Keeps burst-pasters (day 0, 8
// pitches) and slow-onboarders (day 9, 2 pitches) in the expanded feed
// state.
export function isNewUser(createdAt: string, pitchCount: number): boolean {
  const daysOld = (Date.now() - new Date(createdAt).getTime()) / MS_PER_DAY
  return daysOld < NEW_USER_DAYS || pitchCount < NEW_USER_PITCH_THRESHOLD
}
