// The DOM HUD: crosshair, hit marker, ammo, health, money, round timer, score,
// team counts, objective line, kill feed, banners and the buy menu. It never
// touches the simulation; main.js pushes numbers in and reads callbacks out.
// All writes are cached so the DOM is only touched when a value changes.
import { WEAPONS, WEAPON_ORDER, GRENADE_PRICE } from './weapon.js';

const COPY = {
  start: {
    title: 'Ember Yard',
    copy: 'Foxes vs Jackals, first to 3 rounds. Plant the charge at Site A, or clear the Jackals. Click to play.',
    action: 'Click to play',
  },
  paused: {
    title: 'Ember Yard',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  end: {
    title: 'Match over',
    copy: '',
    action: 'Play again',
  },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const ammo = $('ammo');
  const weaponName = $('weapon-name');
  const healthFill = $('health-fill');
  const healthNum = $('health-num');
  const moneyValue = $('money-value');
  const timerValue = $('timer-value');
  const scoreFox = $('score-fox');
  const scoreJackal = $('score-jackal');
  const aliveFox = $('alive-fox');
  const aliveJackal = $('alive-jackal');
  const objective = $('objective');
  const killfeed = $('killfeed');
  const banner = $('banner');
  const bannerTitle = $('banner-title');
  const bannerSub = $('banner-sub');
  const hitmarker = $('hitmarker');
  const crosshair = $('crosshair');
  const damage = $('damage');
  const plantBar = $('plant-bar');
  const plantFill = $('plant-fill');
  const plantLabel = $('plant-label');
  const buyMenu = $('buy-menu');
  const buyMoney = $('buy-money');
  const buyList = $('buy-list');
  const deploy = $('deploy');
  const grenadeCount = $('grenade-count');
  let hitTimer = 0;
  let bannerTimer = 0;
  let damageTimer = 0;
  const cache = {};

  function setText(el, key, value) {
    if (cache[key] === value) return;
    cache[key] = value;
    el.textContent = value;
  }

  // Buy menu rows, built once; prices and ownership refresh each buy phase.
  const buyRows = {};
  for (const id of WEAPON_ORDER) {
    const row = document.createElement('div');
    row.className = 'buy-row';
    row.innerHTML = `<span class="buy-name"></span><span class="buy-price"></span><button type="button" class="buy-btn">Buy</button>`;
    row.querySelector('.buy-name').textContent = WEAPONS[id].name;
    row.querySelector('.buy-price').textContent = WEAPONS[id].price === 0 ? 'Owned' : `$${WEAPONS[id].price}`;
    row.querySelector('.buy-btn').addEventListener('click', () => buyRows[id].onBuy(id));
    buyList.appendChild(row);
    buyRows[id] = { row, onBuy: () => {} };
  }
  const grenadeRow = document.createElement('div');
  grenadeRow.className = 'buy-row';
  grenadeRow.innerHTML = `<span class="buy-name">Spark grenade</span><span class="buy-price">$${GRENADE_PRICE}</span><button type="button" class="buy-btn">Buy</button>`;
  grenadeRow.querySelector('.buy-btn').addEventListener('click', () => grenadeRow.onBuy());
  grenadeRow.onBuy = () => {};
  buyList.appendChild(grenadeRow);

  return {
    setAmmo(mag, reserve, name) {
      setText(ammoMag, 'mag', String(mag));
      setText(ammoReserve, 'reserve', `/ ${reserve}`);
      setText(weaponName, 'wname', name);
      ammo.classList.toggle('empty', mag === 0);
    },
    setHealth(hp) {
      const v = Math.max(0, Math.round(hp));
      setText(healthNum, 'hp', String(v));
      healthFill.style.width = `${v}%`;
      healthFill.classList.toggle('low', v <= 30);
    },
    setMoney(m) {
      setText(moneyValue, 'money', `$${m}`);
      setText(buyMoney, 'buymoney', `$${m}`);
    },
    setTimer(seconds, phase) {
      const s = Math.max(0, Math.ceil(seconds));
      setText(timerValue, 'timer', `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
      timerValue.classList.toggle('urgent', s <= 10 && phase !== 'buy');
    },
    setScore(fox, jackal) {
      setText(scoreFox, 'sfox', String(fox));
      setText(scoreJackal, 'sjack', String(jackal));
    },
    setAlive(fox, jackal) {
      setText(aliveFox, 'afox', `${fox} alive`);
      setText(aliveJackal, 'ajack', `${jackal} alive`);
    },
    setObjective(text) {
      setText(objective, 'obj', text);
    },
    setGrenades(n) {
      setText(grenadeCount, 'gren', n > 0 ? `Grenades: ${n} (G)` : '');
    },
    setSpread(px) {
      crosshair.style.setProperty('--gap', `${px}px`);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    damageFlash() {
      damage.classList.add('on');
      clearTimeout(damageTimer);
      damageTimer = setTimeout(() => damage.classList.remove('on'), 220);
    },
    killfeed(killer, victim, headshot) {
      const line = document.createElement('div');
      line.className = 'feed-line';
      line.textContent = headshot ? `${killer} ✕ ${victim} (headshot)` : `${killer} ✕ ${victim}`;
      killfeed.prepend(line);
      while (killfeed.children.length > 5) killfeed.removeChild(killfeed.lastChild);
      setTimeout(() => line.remove(), 6000);
    },
    showBanner(titleText, sub) {
      bannerTitle.textContent = titleText;
      bannerSub.textContent = sub || '';
      banner.hidden = false;
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => { banner.hidden = true; }, 4500);
    },
    hideBanner() {
      banner.hidden = true;
    },
    showPlant(progress, label) {
      plantBar.hidden = false;
      plantFill.style.width = `${Math.round(progress * 100)}%`;
      plantLabel.textContent = label;
    },
    hidePlant() {
      plantBar.hidden = true;
    },
    showOverlay(mode, score) {
      const text = COPY[mode];
      title.textContent = text.title;
      copy.textContent = mode === 'end' ? score : text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
    showBuy(money, owned, onBuy, onGrenade, onDeploy) {
      buyMenu.hidden = false;
      setText(buyMoney, 'buymoney', `$${money}`);
      for (const id of WEAPON_ORDER) {
        const row = buyRows[id];
        row.onBuy = onBuy;
        const btn = row.row.querySelector('.buy-btn');
        btn.disabled = owned[id] || money < WEAPONS[id].price;
        btn.textContent = owned[id] ? 'Owned' : 'Buy';
      }
      grenadeRow.onBuy = onGrenade;
      deploy.onclick = onDeploy;
    },
    hideBuy() {
      buyMenu.hidden = true;
    },
    reopenBuy() {
      // Re-show the buy menu without touching its handlers (used when the
      // pointer lock is lost during the buy phase).
      buyMenu.hidden = false;
    },
    refreshBuy(money, owned) {
      setText(buyMoney, 'buymoney', `$${money}`);
      for (const id of WEAPON_ORDER) {
        const btn = buyRows[id].row.querySelector('.buy-btn');
        btn.disabled = owned[id] || money < WEAPONS[id].price;
        btn.textContent = owned[id] ? 'Owned' : 'Buy';
      }
    },
  };
}
