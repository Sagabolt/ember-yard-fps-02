// Rounds and economy: one place holds the match state. A match is first to
// 3 round wins (max 5 rounds). Each round: a 15 s buy phase, a 100 s live
// phase, then a 5 s banner. Foxes (the player's team) win a round by
// eliminating the Jackals, or by planting the charge at Site A and letting its
// 35 s fuse run out. Jackals win by eliminating the Foxes, by defusing a
// planted charge, or by the clock running out before a plant. Kills pay $300,
// a plant pays $300, a round win pays $325 and a loss pays $200.
import { SITE_A } from './world.js';

export const BUY_SECONDS = 15;
export const ROUND_SECONDS = 100;
export const FUSE_SECONDS = 35;
export const PLANT_SECONDS = 3;
export const WIN_ROUNDS = 3;
export const MAX_ROUNDS = 5;

export function createRounds(events) {
  const state = {
    phase: 'buy', // buy | live | planted | over
    round: 1,
    foxWins: 0,
    jackalWins: 0,
    money: 800,
    kills: 0,
    timer: BUY_SECONDS,
    planted: false,
    plantProgress: 0,
    defuseProgress: 0,
    banner: '',
    bannerSub: '',
    matchOver: false,
    matchWinner: null,
  };

  function startRound() {
    state.phase = 'buy';
    state.timer = BUY_SECONDS;
    state.planted = false;
    state.plantProgress = 0;
    state.defuseProgress = 0;
    state.banner = '';
    events.onRoundStart(state.round);
  }

  function endRound(foxWon, reason) {
    if (state.phase === 'over') return;
    state.phase = 'over';
    state.timer = 5;
    if (foxWon) state.foxWins += 1;
    else state.jackalWins += 1;
    state.money += foxWon ? 325 : 200;
    state.banner = foxWon ? 'Foxes take the round' : 'Jackals take the round';
    state.bannerSub = reason;
    events.onRoundEnd(foxWon, reason, state);
    if (state.foxWins >= WIN_ROUNDS || state.jackalWins >= WIN_ROUNDS || state.round >= MAX_ROUNDS) {
      state.matchOver = true;
      state.matchWinner = state.foxWins > state.jackalWins ? 'fox' : 'jackal';
    }
  }

  function plantCharge(byPlayer) {
    if (state.phase !== 'live' || state.planted) return false;
    state.planted = true;
    state.phase = 'planted';
    state.timer = FUSE_SECONDS;
    state.money += 300;
    events.onPlanted(byPlayer);
    return true;
  }

  return {
    state,
    startRound,
    endRound,
    plantCharge,
    nextRound() {
      if (state.matchOver) return false;
      state.round += 1;
      startRound();
      return true;
    },
    addKillReward() {
      state.kills += 1;
      state.money += 300;
    },
    step(dt, alive) {
      // alive: { fox, jackal } counts, polled by main.js each step.
      if (state.phase === 'buy' || state.phase === 'live' || state.phase === 'planted') {
        state.timer -= dt;
      }
      if (state.phase === 'buy' && state.timer <= 0) {
        state.phase = 'live';
        state.timer = ROUND_SECONDS;
        events.onLive();
      } else if (state.phase === 'live') {
        if (alive.jackal === 0) endRound(true, 'Jackal squad eliminated.');
        else if (alive.fox === 0) endRound(false, 'Fox squad eliminated.');
        else if (state.timer <= 0) endRound(false, 'Time ran out before the plant.');
      } else if (state.phase === 'planted') {
        if (alive.jackal === 0) endRound(true, 'Charge detonated — Jackals gone.');
        else if (alive.fox === 0) endRound(false, 'Fox squad eliminated — charge defused.');
        else if (state.timer <= 0) endRound(true, 'Charge detonated at Site A.');
      } else if (state.phase === 'over') {
        state.timer -= dt;
        if (state.timer <= 0 && !state.matchOver) {
          state.round += 1;
          startRound();
        }
      }
    },
    playerInSite(pos) {
      return Math.abs(pos.x - SITE_A.x) < SITE_A.half && Math.abs(pos.z - SITE_A.z) < SITE_A.half;
    },
  };
}
