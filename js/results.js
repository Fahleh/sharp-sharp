// What happens when a shift ends: save the score for a signed-in player, show the rank, and
// fetch the leaderboard. Nothing here blocks play; every start.ng call can fail quietly.

import { fetchLeaderboard, saveScore } from './startng.js';
import { shouldSaveScore } from './validate.js';

/**
 * @param {{ ui: ReturnType<typeof import('./ui.js').createUi>, profile: ReturnType<typeof import('./profile.js').createProfile>,
 *   guestMode: boolean }} parts `guestMode` is true when the address has `?guest`: no sign-in invitations
 * @returns {{ show: (summary: { earnings: number, deliveries: number, newBest: boolean }) => Promise<void>, cancel: () => void }}
 */
export function createResults({ ui, profile, guestMode }) {
  let token = 0;

  async function show(summary) {
    token += 1;
    const mine = token;
    const player = profile.player();
    const local = summary.newBest ? 'New best!' : '';
    const stale = () => mine !== token;

    ui.setLeaderboard(null, null);
    if (shouldSaveScore({ signedIn: player.signedIn, deliveries: summary.deliveries })) {
      ui.setOverStatus('Saving your score…');
      const saved = await saveScore({ earnings: summary.earnings, deliveries: summary.deliveries });
      if (stale()) return;
      if (!saved.ok) ui.setOverStatus(local ? `${local} Could not save to the leaderboard.` : 'Could not save to the leaderboard.');
      else if (saved.improved) ui.setOverStatus(saved.rank ? `New best! You are #${saved.rank}.` : 'New best!');
      else ui.setOverStatus(saved.rank ? `Your best run stands. You are #${saved.rank}.` : 'Your best run stands.');
    } else if (!player.signedIn) {
      ui.setOverStatus(guestMode ? local : `${local} Sign in to put your shift on the leaderboard.`.trim());
    } else {
      ui.setOverStatus(local ? `${local} No deliveries, so nothing to save.` : 'No deliveries, so nothing to save.');
    }

    const board = await fetchLeaderboard();
    if (stale()) return;
    ui.setLeaderboard(board, player.id);
  }

  return { show, cancel: () => { token += 1; } };
}
