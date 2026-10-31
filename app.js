/* Halloween Night: Secret Assassin + costume contest.
   There is no server. Missions, hand-offs and ballots travel between phones as QR links,
   and each phone keeps its own state in localStorage. */
(() => {
  'use strict';

  // ---------- small helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = s => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  const same = (a, b) => norm(a) === norm(b);
  const cleanName = s => String(s ?? '').replace(/^\s*(?:[-*•·]|\d+[.)])\s*/, '').replace(/\s+/g, ' ').trim().slice(0, 28);
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const timeOf = t => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  // Vibrate only after the person has tapped the page; browsers block it otherwise.
  const buzz = pattern => {
    const ua = navigator.userActivation;
    if (navigator.vibrate && (!ua || ua.hasBeenActive)) navigator.vibrate(pattern);
  };

  const BASE = location.origin + location.pathname.replace(/index\.html$/, '');

  const CATS = [
    { id: 'scary', name: 'Scariest' },
    { id: 'funny', name: 'Funniest' },
    { id: 'char', name: 'Most in Character' },
    { id: 'creative', name: 'Most Creative' },
    { id: 'overall', name: 'Best Overall', grand: true },
  ];
  const REVEAL_ORDER = ['scary', 'funny', 'char', 'creative', 'overall'];

  const DEFAULT_WORDS = [
    'pineapple', 'Tuesday', 'spreadsheet', 'dinosaur', 'airport', 'avocado', 'Costco', 'karaoke',
    'brisket', "Buc-ee's", 'Whataburger', 'Netflix', 'vacation', 'grandma', 'unicorn', 'hurricane',
    'burrito', 'LinkedIn', 'traffic', 'wedding', 'banana', 'penguin', 'Wi-Fi', 'IKEA', 'cowboy',
    'pickle', 'volcano', 'sushi', 'pancakes', 'taxes', 'lasagna', 'kangaroo', 'podcast', 'parking',
    'bowling', 'yoga', 'tornado', 'Tex-Mex', 'H-E-B', 'flamingo',
  ];
  const DEFAULT_ACTIONS = [
    'give you a high five', 'take a selfie with you', 'hold your drink for a second',
    'tell you what time it is', 'show you a photo on their phone', 'fist-bump you',
    'compliment your costume', 'hand you a napkin', 'pass you a snack', 'clink glasses with you',
    'tell you their favorite movie', 'spell their name out loud', 'sit down next to you',
    'help fix your costume', 'do their best villain laugh', 'tell you their worst costume ever',
    'guess what your costume is', 'take a photo of you', 'show you their shoes', 'sing a line of any song',
  ];

  // ---------- storage (each phone keeps its own state) ----------
  const NS = 'hn2026.';
  const memStore = {};
  let storageOK = true;
  try { localStorage.setItem(NS + 't', '1'); localStorage.removeItem(NS + 't'); } catch (e) { storageOK = false; }

  function load(key) {
    try {
      const raw = storageOK ? localStorage.getItem(NS + key) : memStore[key];
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function save(key, val) {
    const raw = val == null ? null : JSON.stringify(val);
    if (storageOK) {
      try {
        if (raw == null) localStorage.removeItem(NS + key); else localStorage.setItem(NS + key, raw);
        return;
      } catch (e) { storageOK = false; }
    }
    if (raw == null) delete memStore[key]; else memStore[key] = raw;
  }
  const getHost = () => load('host');
  const getMe = () => load('me');
  const getVote = () => load('vote');
  const getBallot = () => load('ballot');
  // Read-modify-write from storage so a second tab never overwrites newer data.
  function updateHost(fn) { const h = getHost(); if (!h) return null; fn(h); save('host', h); return h; }
  function updateMe(fn) { const m = getMe(); if (!m) return null; fn(m); save('me', m); return m; }

  // ---------- link encoding ----------
  const KEY = new TextEncoder().encode('witching-hour-2026');
  const xor = bytes => bytes.map((b, i) => b ^ KEY[i % KEY.length]);
  function b64u(bytes) {
    let s = '';
    bytes.forEach(b => { s += String.fromCharCode(b); });
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function unb64u(str) {
    let s = String(str).replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  const enc = obj => b64u(xor(new TextEncoder().encode(JSON.stringify(obj))));
  function dec(str) {
    try { return JSON.parse(new TextDecoder().decode(xor(unb64u(str)))); } catch (e) { return null; }
  }
  const linkFor = (param, obj) => `${BASE}?${param}=${enc(obj)}`;

  // ---------- randomness ----------
  function rand(n) { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; }
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  function rid(len = 5) {
    const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
    let s = '';
    for (let i = 0; i < len; i++) s += abc[rand(abc.length)];
    return s;
  }

  // ---------- weapons ----------
  const weaponText = w => (w[0] === 'w' ? `Get them to say “${w[1]}”` : `Get them to ${w[1]}`);
  function weaponPool(h) {
    const W = (h.words || []).map(x => ['w', x]);
    const A = (h.actions || []).map(x => ['a', x]);
    let pool;
    if (h.mix === 'words') pool = W.length ? W : A;
    else if (h.mix === 'actions') pool = A.length ? A : W;
    else pool = W.concat(A);
    return pool.length ? pool : DEFAULT_WORDS.map(x => ['w', x]);
  }
  function freshWeapon(avoid) {
    const pool = DEFAULT_WORDS.map(x => ['w', x]).concat(DEFAULT_ACTIONS.map(x => ['a', x]))
      .filter(w => !(avoid && w[0] === avoid[0] && w[1] === avoid[1]));
    return pool[rand(pool.length)];
  }

  // Everyone who plays goes into one shuffled loop: each player's target is the next name.
  function dealMissions(h) {
    const players = h.guests.filter(g => g.p).map(g => g.n);
    const order = shuffle(players);
    const weapons = shuffle(weaponPool(h));
    const cards = {};
    order.forEach((n, i) => {
      cards[n] = { o: n, t: order[(i + 1) % order.length], w: weapons[i % weapons.length] };
    });
    return { id: rid(4), at: Date.now(), order, cards };
  }

  // ---------- UI plumbing: layers, dialogs, toasts ----------
  const layerStack = [];
  function openLayer(html, { label = 'Dialog', cls = '', onClose } = {}) {
    const wrap = document.createElement('div');
    wrap.className = `layer ${cls}`;
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-label', label);
    wrap.innerHTML = `<div class="sheet">${html}</div>`;
    $('#layers').appendChild(wrap);
    layerStack.push({ el: wrap, onClose, prevFocus: document.activeElement });
    document.body.classList.add('locked');
    const focusable = wrap.querySelector('[autofocus]') || wrap.querySelector('button, [href], input, textarea, select');
    if (focusable) setTimeout(() => focusable.focus({ preventScroll: true }), 30);
    return wrap;
  }
  function closeLayer() {
    const top = layerStack.pop();
    if (!top) return;
    top.el.remove();
    if (!layerStack.length) document.body.classList.remove('locked');
    if (top.onClose) top.onClose();
    if (top.prevFocus && document.contains(top.prevFocus) && top.prevFocus.focus) top.prevFocus.focus({ preventScroll: true });
  }
  function closeAllLayers() { while (layerStack.length) closeLayer(); }

  function ask({ title, body = '', buttons }) {
    return new Promise(resolve => {
      let chosen = buttons[0].value;
      const el = openLayer(`
        <h2 class="dlg-title">${esc(title)}</h2>
        ${body ? `<p class="dlg-body">${esc(body)}</p>` : ''}
        <div class="dlg-btns">${buttons.map((b, i) => `<button type="button" class="btn ${b.kind || (i === buttons.length - 1 ? 'potion' : 'ghost')}" data-i="${i}">${esc(b.label)}</button>`).join('')}</div>`,
      { label: title, onClose: () => resolve(chosen) });
      el.addEventListener('click', e => {
        const btn = e.target.closest('[data-i]');
        if (!btn) return;
        chosen = buttons[+btn.dataset.i].value;
        closeLayer();
      });
    });
  }
  const tell = (title, body) => ask({ title, body, buttons: [{ label: 'OK', value: true, kind: 'potion' }] });

  function toast(msg, kind = '') {
    const t = document.createElement('div');
    t.className = `toast ${kind}`;
    t.textContent = msg;
    $('#toasts').appendChild(t);
    setTimeout(() => t.classList.add('out'), 2800);
    setTimeout(() => t.remove(), 3300);
  }

  async function copyText(text, label = 'Link') {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${label} copied`, 'good');
    } catch (e) {
      openLayer(`
        <h2 class="dlg-title">Copy this</h2>
        <p class="dlg-body">Press and hold the box below, then choose Copy.</p>
        <textarea class="copybox" rows="4" readonly>${esc(text)}</textarea>
        <div class="dlg-btns"><button type="button" class="btn potion" data-act="close">Done</button></div>`, { label: 'Copy this' });
      const box = $('.copybox:last-of-type');
      if (box) { box.focus(); box.select(); }
    }
  }

  function qrSVG(text) {
    if (typeof window.qrcode !== 'function') {
      return '<p class="noqr">The QR code couldn’t load. Use the copy button instead.</p>';
    }
    const qr = window.qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    const q = 3;
    const size = n + q * 2;
    let d = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + q} ${r + q}h1v1h-1z`;
    }
    return `<svg viewBox="0 0 ${size} ${size}" role="img" aria-label="QR code" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#0e0c17"/></svg>`;
  }

  function openQR({ title, body = '', url, copyLabel = 'Copy link', primary, extra = '', cls = '' }) {
    const dataAttrs = primary && primary.data
      ? Object.entries(primary.data).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ') : '';
    return openLayer(`
      <h2 class="dlg-title">${esc(title)}</h2>
      ${body ? `<p class="dlg-body">${esc(body)}</p>` : ''}
      <div class="qrbox">${qrSVG(url)}</div>
      <div class="dlg-btns">
        <button type="button" class="btn ghost" data-act="copy" data-text="${esc(url)}" data-label="${esc(copyLabel.replace(/^Copy /, '').replace(/^./, c => c.toUpperCase()))}">${esc(copyLabel)}</button>
        <button type="button" class="btn potion" data-act="${primary ? primary.act : 'close'}" ${dataAttrs}>${esc(primary ? primary.label : 'Done')}</button>
      </div>
      <details class="cant"><summary>Can’t scan it?</summary>
        <p class="fine">Copy the link and text it instead. Opening it does the same thing as scanning.</p>
        <input class="linkfield" type="text" readonly value="${esc(url)}" aria-label="Link">
      </details>
      ${extra}`, { label: title, cls: `qr-layer ${cls}` });
  }

  // ---------- incoming links (?m= mission, ?c= hand-over card, ?v= voting, ?b= ballot) ----------
  let flash = null;
  let pendingScroll = null;

  function readIncoming() {
    const qs = new URLSearchParams(location.search);
    let found = null;
    for (const key of ['m', 'c', 'v', 'b']) {
      if (qs.has(key)) { found = { key, data: dec(qs.get(key)) }; break; }
    }
    if (location.search) history.replaceState(null, '', location.pathname + location.hash);
    return found;
  }

  async function handleIncoming(inc) {
    if (!inc) return;
    const d = inc.data;
    if (!d || typeof d !== 'object') { toast('That code didn’t work. Try scanning it again.', 'bad'); return; }
    if (inc.key === 'm') return acceptMission(d);
    if (inc.key === 'c') return acceptCard(d);
    if (inc.key === 'v') return acceptVoting(d);
    if (inc.key === 'b') return acceptBallotLink(d);
  }

  async function acceptMission(d) {
    if (d.t !== 'm' || !d.g || !d.n) { toast('That mission code didn’t work.', 'bad'); return; }
    const me = getMe();
    const fresh = {
      v: 1, g: d.g, di: d.di || null, n: d.n, k: d.k || '',
      cards: d.c ? [d.c] : [], kills: 0, status: d.c ? 'alive' : 'spectator',
      handed: null, log: d.c && d.via ? [{ type: 'joined', who: d.via, at: Date.now() }] : [], at: Date.now(),
    };
    if (me && me.g === d.g && same(me.n, d.n)) {
      if (!d.c) {
        // Registration link for someone already set up: just pick up the voting token.
        if (!me.k && d.k) updateMe(m => { m.k = d.k; });
        toast(`You’re set up as ${me.n}.`, 'good');
        go(me.cards.length ? 'mission' : 'vote');
        return;
      }
      if (!me.cards.length) {
        updateMe(m => {
          m.cards = [d.c]; m.status = 'alive'; m.di = d.di || m.di; if (!m.k && d.k) m.k = d.k;
          if (d.via) m.log.push({ type: 'joined', who: d.via, at: Date.now() });
        });
        flash = { kind: 'mission' };
        go('mission');
        return;
      }
      if (d.di && me.di && d.di !== me.di) {
        // The host re-dealt: replace the old mission, keep the voting token.
        fresh.k = me.k || fresh.k;
        save('me', fresh);
        flash = { kind: 'redeal' };
        go('mission');
        return;
      }
      if (!me.k && d.k) updateMe(m => { m.k = d.k; });
      toast('You already have this mission.');
      go('mission');
      return;
    }
    if (me && me.g === d.g && !same(me.n, d.n)) {
      const ok = await ask({
        title: `This phone is set up for ${me.n}`,
        body: `This code belongs to ${d.n}. Only switch if this is your phone and you’re ${d.n}.`,
        buttons: [{ label: `Keep ${me.n}`, value: false }, { label: `Switch to ${d.n}`, value: true, kind: 'danger' }],
      });
      if (!ok) { go('mission'); return; }
    }
    save('me', fresh);
    save('ballot', null);
    flash = { kind: d.c ? 'mission' : 'registered' };
    go(d.c ? 'mission' : 'vote');
  }

  async function acceptCard(d) {
    if (d.t !== 'c' || !d.c || !d.f) { toast('That code didn’t work. Try scanning it again.', 'bad'); return; }
    const me = getMe();
    if (!me || me.g !== d.g || !me.cards.length) {
      await tell('Open your own mission first', 'This is a hand-over code, but this phone doesn’t have your mission. Open your own mission in this same browser, then scan this code again.');
      go('mission');
      return;
    }
    if (d.di && me.di && d.di !== me.di) { await tell('Old code', 'That code is from before the host re-dealt the missions, so it doesn’t count.'); return; }
    if (me.status !== 'alive') {
      await tell(me.status === 'won' ? 'You already won' : 'You’re out of the game', 'Only players who are still in can take over a mission.');
      return;
    }
    if (same(d.f, me.n)) { toast('That’s your own code. Show it to your assassin instead.', 'bad'); return; }
    if (me.cards.some(c => same(c.o, d.c.o) && same(c.t, d.c.t))) { toast('You already took over this mission.'); go('mission'); return; }
    const top = me.cards[me.cards.length - 1];
    if (!same(top.t, d.f)) {
      const ok = await ask({
        title: 'This isn’t your target’s code',
        body: `This code is from ${d.f}, but ${d.f} isn’t your current target. Only ${d.f}’s assassin should scan it.`,
        buttons: [{ label: 'Cancel', value: false }, { label: 'Take it anyway', value: true, kind: 'danger' }],
      });
      if (!ok) return;
    }
    updateMe(m => {
      m.cards.push(d.c);
      if (!d.lv) m.kills += 1;
      m.log.push({ type: d.lv ? 'inherit' : 'kill', who: d.f, at: Date.now() });
      if (same(d.c.t, m.n)) m.status = 'won';
    });
    flash = { kind: d.lv ? 'inherit' : 'kill', who: d.f };
    buzz([60, 40, 120]);
    go('mission');
  }

  function acceptVoting(d) {
    if (d.t !== 'v' || !d.g || !d.r || !Array.isArray(d.names)) { toast('That voting code didn’t work.', 'bad'); return; }
    save('vote', { g: d.g, r: d.r, names: d.names });
    const b = getBallot();
    if (!b || b.g !== d.g || b.r !== d.r) save('ballot', { g: d.g, r: d.r, voter: null, picks: {} });
    go('vote');
  }

  async function acceptBallotLink(d) {
    const res = recordBallot(d);
    if (res.ok) toast(res.msg, 'good');
    else await tell('Ballot not counted', res.msg);
    if (getHost()) pendingScroll = 'p-contest';
    go(getHost() ? 'host' : 'vote');
  }

  function recordBallot(d) {
    const h = getHost();
    if (!h) return { ok: false, msg: 'This is a ballot code, and only the host’s phone can count it. Show it to your host.' };
    if (!d || d.t !== 'b' || !d.n) return { ok: false, msg: 'That isn’t a ballot code.' };
    if (d.g !== h.g) return { ok: false, msg: 'This ballot is from a different party.' };
    if (!h.vote) return { ok: false, msg: 'Voting isn’t open on this phone yet.' };
    if (d.r !== h.vote.r) return { ok: false, msg: `${d.n}’s ballot is from an earlier round of voting. Ask them to open the new voting link.` };
    const guest = h.guests.find(x => same(x.n, d.n));
    const verified = !!(guest && d.k && d.k === guest.k);
    const picks = {};
    CATS.forEach((c, i) => {
      const p = (d.p || [])[i];
      if (p && !same(p, d.n)) picks[c.id] = String(p).slice(0, 40);
    });
    let count = 0;
    let replaced = false;
    updateHost(x => {
      const key = norm(d.n);
      replaced = !!x.vote.ballots[key];
      x.vote.ballots[key] = { n: d.n, picks, ok: verified, at: Date.now() };
      count = Object.keys(x.vote.ballots).length;
    });
    return { ok: true, msg: `${replaced ? 'Updated' : 'Counted'} ${d.n}’s ballot · ${count} in` };
  }

  // ---------- views ----------
  function catsHTML() {
    return `<ul class="cats">${CATS.map(c => `<li${c.grand ? ' class="grand"' : ''}>${esc(c.name)}${c.grand ? ' <span class="tag">Grand prize</span>' : ''}</li>`).join('')}</ul>`;
  }

  function renderRules() {
    return `
    <section class="hero">
      <p class="kicker">Saturday, October 31 · Doors at 7</p>
      <h1 class="title xl">Halloween Night</h1>
      <p class="lede">Two games run all night: Secret Assassin and the costume contest. Here’s how both work.</p>
    </section>

    <section class="rules" aria-labelledby="sa-h">
      <h2 class="h2" id="sa-h">Secret Assassin</h2>
      <p class="lede">Everyone gets a secret target and a weapon. Trick your target, take over their mission, and keep going. Most kills wins.</p>
      <ol class="steps">
        <li><b>Get your mission.</b> Your host shows you a QR code. Scan it with your phone camera and your mission opens on your phone. Keep it to yourself.</li>
        <li><b>Know your weapon.</b> It’s a word you have to trick your target into saying, or an action you have to trick them into doing.</li>
        <li><b>Keep it natural.</b> It has to happen in normal conversation. Asking them straight out doesn’t count.</li>
        <li><b>Make the kill.</b> When your target falls for it, quietly tell them they’re dead.</li>
        <li><b>Take their mission.</b> Your victim taps “I’ve been assassinated” and shows you a QR code. Scan it with your camera, and their target and weapon become yours.</li>
        <li><b>Stay dead.</b> Dead players keep partying but can’t make kills, and they never reveal who got them.</li>
        <li><b>Win.</b> At wind-down, whoever has the most kills wins. Take out everyone and you win on the spot.</li>
      </ol>
      <h3 class="h3">Good to know</h3>
      <ul class="notes">
        <li>Open every code in the same browser, so your phone remembers your mission.</li>
        <li>Leaving early? Tap “I’m leaving the party” on your mission so whoever had you can take over your target.</li>
        <li>Got here late? Any player who’s still in can bring you into the game from their phone.</li>
      </ul>
    </section>

    <section class="rules" aria-labelledby="cc-h">
      <h2 class="h2" id="cc-h">Costume contest</h2>
      <p class="lede">Walk the runway and introduce your character in 10 seconds. Then everyone votes by secret ballot.</p>
      ${catsHTML()}
      <ol class="steps">
        <li><b>Open your ballot.</b> When voting opens, scan the voting code or tap the link your host shares.</li>
        <li><b>Pick your favorites.</b> Choose one person per category. You can’t vote for yourself.</li>
        <li><b>Cast it.</b> Tap “Get my ballot code” and show it to your host. Changed your mind? Show a new code before the reveal.</li>
        <li><b>Watch the reveal.</b> Winners are announced one category at a time, with Best Overall last.</li>
      </ol>
    </section>
    <button type="button" class="btn ghost block share" data-act="shareSite">Share this site</button>
    <p class="foot">Running the party? <a href="#host">Open host tools</a></p>`;
  }

  function flashBanner(f) {
    if (!f) return '';
    const map = {
      mission: ['', 'Mission received. Reveal it when nobody’s looking.'],
      redeal: ['', 'The host re-dealt the missions. This is your new one.'],
      registered: ['', 'You’re registered for the costume contest.'],
      kill: ['kill', `Kill confirmed. ${f.who} is out, and their mission is now yours.`],
      inherit: ['', `${f.who} left the party. Their target is now yours, and it doesn’t count as a kill.`],
    };
    const [cls, msg] = map[f.kind] || ['', ''];
    return msg ? `<p class="banner ${cls}" role="status">${esc(msg)}</p>` : '';
  }

  function recordHTML(me) {
    if (!me.log || !me.log.length) return '';
    const line = e => ({
      kill: `Took out ${e.who}`,
      inherit: `Took over ${e.who}’s target when they left`,
      splice: `Brought ${e.who} into the game`,
      joined: `Joined the game through ${e.who}`,
      died: 'Was assassinated',
      left: 'Left the game',
      undo: 'Undid a hand-over',
    }[e.type] || '');
    const items = me.log.filter(line).map(e => `<li><span>${esc(line(e))}</span><time>${esc(timeOf(e.at))}</time></li>`).join('');
    return `<details class="record"><summary>My record</summary><ul>${items}</ul></details>`;
  }

  function dossierHTML(card) {
    const isWord = card.w[0] === 'w';
    return `
      <article class="dossier" data-revealed="false">
        <span class="stamp" aria-hidden="true">Classified</span>
        <div class="field">
          <span class="flabel">Target</span>
          <span class="fval big"><span class="rbars" aria-hidden="true"><span class="rbar w72"></span></span><span class="secret" aria-hidden="true">${esc(card.t)}</span><span class="sr">hidden</span></span>
        </div>
        <div class="field">
          <span class="flabel">Weapon · ${isWord ? 'a word' : 'an action'}</span>
          <span class="fval"><span class="rbars" aria-hidden="true"><span class="rbar"></span><span class="rbar w58"></span></span><span class="secret" aria-hidden="true">${esc(weaponText(card.w))}</span><span class="sr">hidden</span></span>
        </div>
        <button type="button" class="btn potion block" data-act="reveal" aria-pressed="false">Tap to reveal</button>
        <p class="paper-note">Hides again after 8 seconds. Make sure nobody’s looking.</p>
      </article>`;
  }

  function renderMission() {
    const me = getMe();
    const f = flash;
    flash = null;
    if (!me) {
      return `
      <section class="mission">
        <p class="kicker">Secret Assassin</p>
        <h1 class="title">No mission yet</h1>
        <div class="sealed" aria-hidden="true"><span class="stamp">Awaiting orders</span><span class="bar w80"></span><span class="bar w60"></span><span class="bar w70"></span></div>
        <p class="lede">When the game starts, your host shows you a QR code. Scan it with your phone camera and your secret mission opens here.</p>
        <p class="fine">Already scanned it? Make sure you’re in the same browser you opened your mission in.</p>
        <a class="btn ghost block" href="#rules">How the game works</a>
      </section>`;
    }
    const banner = flashBanner(f);
    const stats = (stateLabel, stateCls, stateNote) => `
      <div class="stats" role="group" aria-label="Your stats">
        <div><span class="num">${me.kills}</span><span class="lbl">${me.kills === 1 ? 'kill' : 'kills'}</span></div>
        <div><span class="num state ${stateCls}">${stateLabel}</span><span class="lbl">${stateNote}</span></div>
      </div>`;
    if (!me.cards.length) {
      return `${banner}
      <section class="mission">
        <p class="kicker">Secret Assassin · ${esc(me.n)}</p>
        <h1 class="title">You’re registered</h1>
        <p class="lede">You can vote in the costume contest. To join Secret Assassin, ask any player who’s still in the game to bring you in. They tap “Bring in a late arrival” on their phone, and you scan their code.</p>
        <a class="btn ghost block" href="#vote">Go to voting</a>
      </section>`;
    }
    const top = me.cards[me.cards.length - 1];
    if (me.status === 'alive') {
      return `${banner}
      <section class="mission">
        <div>
          <p class="kicker">Secret Assassin · Agent ${esc(me.n)}</p>
          <h1 class="title">Your mission</h1>
        </div>
        ${dossierHTML(top)}
        ${stats('In', 'alive', 'still in the game')}
        <button type="button" class="btn danger block" data-act="killed">I’ve been assassinated</button>
        <details class="more">
          <summary>More options</summary>
          <div class="more-body">
            <button type="button" class="btn ghost block" data-act="newcomer">Bring in a late arrival</button>
            <button type="button" class="btn ghost block" data-act="leaving">I’m leaving the party</button>
            ${recordHTML(me)}
          </div>
        </details>
      </section>`;
    }
    if (me.status === 'won') {
      return `${banner}
      <section class="mission">
        <p class="kicker">Secret Assassin · Agent ${esc(me.n)}</p>
        <h1 class="title">Last assassin standing</h1>
        <p class="lede">You took out everyone. Show this screen to your host to claim the win.</p>
        ${stats('Won', 'won', 'the whole game')}
        ${recordHTML(me)}
      </section>`;
    }
    const left = me.status === 'left';
    return `${banner}
      <section class="mission">
        <p class="kicker">Secret Assassin · Agent ${esc(me.n)}</p>
        <h1 class="title">${left ? 'You’ve left the game' : 'You’ve been assassinated'}</h1>
        <div class="closed" aria-hidden="true"><span class="stamp">${left ? 'Withdrawn' : 'Eliminated'}</span><span class="bar w80"></span><span class="bar w50"></span></div>
        <p class="lede">${left ? 'Thanks for playing. Your target has been passed on.' : 'Keep partying, and don’t reveal who got you. Your kills still count at wind-down.'}</p>
        ${stats('Out', 'dead', left ? 'left the party' : 'out of the game')}
        ${me.handed ? '<button type="button" class="btn ghost block" data-act="showHandover">Show my hand-over code again</button>' : ''}
        ${recordHTML(me)}
      </section>`;
  }

  function renderVote() {
    const vote = getVote();
    const me = getMe();
    if (!vote) {
      return `
      <section>
        <p class="kicker">Costume contest</p>
        <h1 class="title">Voting isn’t open yet</h1>
        <p class="lede">After the costume parade, your host shares a voting code or link. Open it and your ballot appears here.</p>
        ${catsHTML()}
      </section>`;
    }
    let b = getBallot();
    if (!b || b.g !== vote.g || b.r !== vote.r) { b = { g: vote.g, r: vote.r, voter: null, picks: {} }; save('ballot', b); }
    const myName = me && me.g === vote.g ? me.n : null;
    const voter = myName || b.voter;
    if (!voter) {
      return `
      <section class="ballot">
        <p class="kicker">Costume contest · Secret ballot</p>
        <h1 class="title">Who are you?</h1>
        <p class="lede">Pick your name so you can’t vote for yourself.</p>
        <div class="chips">${vote.names.map(n => `<button type="button" class="chip" data-act="iam" data-name="${esc(n)}">${esc(n)}</button>`).join('')}</div>
        <form data-form="iamOther" class="inline-form">
          <label for="iam-other">Not on the list?</label>
          <div class="row"><input id="iam-other" name="name" type="text" maxlength="28" autocomplete="off" placeholder="Your name"><button class="btn">Continue</button></div>
        </form>
      </section>`;
    }
    const others = vote.names.filter(n => !same(n, voter));
    const picked = CATS.filter(c => b.picks[c.id]).length;
    const h = getHost();
    const hostHere = !!(h && h.g === vote.g && h.vote && h.vote.r === vote.r);
    return `
      <section class="ballot">
        <p class="kicker">Costume contest · Secret ballot</p>
        <h1 class="title">Cast your votes</h1>
        <p class="lede">Voting as <b>${esc(voter)}</b>.${myName ? '' : ' <button type="button" class="linkish" data-act="changeVoter">Not you?</button>'} Pick one person per category.</p>
        ${CATS.map(c => `
          <fieldset class="cat">
            <legend>${esc(c.name)}${c.grand ? ' <span class="tag">Grand prize</span>' : ''}</legend>
            <div class="chips">${others.map(n => `<button type="button" class="chip" data-act="pick" data-cat="${c.id}" data-name="${esc(n)}" aria-pressed="${same(b.picks[c.id], n)}">${esc(n)}</button>`).join('')}</div>
          </fieldset>`).join('')}
        <div class="sticky-cta">
          <span class="progress" id="progress">${picked} of ${CATS.length} picked</span>
          ${hostHere
            ? `<button type="button" class="btn potion" data-act="castHere" id="cast-btn" ${picked ? '' : 'disabled'}>Count my ballot</button>`
            : `<button type="button" class="btn potion" data-act="ballotQR" id="cast-btn" ${picked ? '' : 'disabled'}>Get my ballot code</button>`}
        </div>
      </section>`;
  }

  function hostIntroHTML() {
    return `
      <section>
        <p class="kicker">Host tools</p>
        <h1 class="title">Run the games</h1>
        <p class="lede">Set up tonight’s guest list, deal Secret Assassin missions, and run the costume contest. Everything stays on this phone, so use the same phone and browser all night.</p>
        <button type="button" class="btn potion block" data-act="hostStart">Set up the party</button>
        <details class="cant">
          <summary>Restore from a backup</summary>
          <form data-form="restore" class="inline-form">
            <label for="restore-text">Paste your backup</label>
            <textarea id="restore-text" name="backup" rows="3"></textarea>
            <button class="btn">Restore</button>
          </form>
        </details>
      </section>`;
  }

  function renderHost() {
    const h = getHost();
    if (!h) return hostIntroHTML();
    const dealt = h.dealt;
    const inGame = n => !!(dealt && dealt.cards[n]);
    const players = h.guests.filter(g => g.p);

    const guestRows = h.guests.map(g => `
      <li>
        <span class="gname">${esc(g.n)}</span>
        <button type="button" class="toggle" data-act="togglePlays" data-name="${esc(g.n)}" aria-pressed="${g.p}" ${inGame(g.n) ? 'disabled' : ''}>${g.p ? 'Plays' : 'Votes only'}</button>
        <button type="button" class="iconbtn" data-act="removeGuest" data-name="${esc(g.n)}" aria-label="Remove ${esc(g.n)}" ${inGame(g.n) ? 'disabled' : ''}>×</button>
      </li>`).join('');

    const handed = dealt ? h.guests.filter(g => inGame(g.n) && g.given).length : 0;
    const handRows = h.guests.map(g => {
      let st;
      let cls;
      if (inGame(g.n)) { st = g.given ? 'Handed out' : 'Not yet'; cls = g.given ? 'ok' : 'todo'; }
      else if (!g.p) { st = 'Votes only'; cls = 'muted'; }
      else { st = 'Arrived late'; cls = 'warn'; }
      return `<li><span class="gname">${esc(g.n)}</span><span class="status ${cls}">${st}</span><button type="button" class="btn sm" data-act="showMission" data-name="${esc(g.n)}">Show code</button></li>`;
    }).join('');
    const lateCount = dealt ? h.guests.filter(g => g.p && !inGame(g.n)).length : 0;

    const missions = !dealt ? `
      <section class="panel" id="p-missions">
        <div class="phead"><h2>Secret Assassin</h2><span class="pill">${plural(players.length, 'player', 'players')}</span></div>
        <p class="muted">Deal once most guests have arrived. Everyone who plays gets one secret target, and the targets form a single loop. Anyone who arrives later can still join.</p>
        <button type="button" class="btn potion block" data-act="deal" ${players.length >= 3 ? '' : 'disabled'}>Deal missions</button>
        ${players.length < 3 ? '<p class="fine">Add at least 3 players to deal.</p>' : ''}
      </section>` : `
      <section class="panel" id="p-missions">
        <div class="phead"><h2>Secret Assassin</h2><span class="pill live">${handed} of ${Object.keys(dealt.cards).length} handed out</span></div>
        <p class="muted">Tap “Show code” and let that guest scan it. You never see who has whom.</p>
        <ul class="hlist">${handRows}</ul>
        ${lateCount ? '<p class="fine">Late arrivals get a voting code here. To join the game, any player who’s still in taps “Bring in a late arrival” on their phone.</p>' : ''}
        <details class="cant danger-zone">
          <summary>Re-deal missions</summary>
          <p class="fine">Everyone gets a new mission and has to scan a new code. Only do this before anyone has made a kill.</p>
          <button type="button" class="btn danger" data-act="redeal">Re-deal everyone</button>
        </details>
      </section>`;

    const v = h.vote;
    const ballots = v ? Object.values(v.ballots).sort((a, b) => a.at - b.at) : [];
    const voterRows = ballots.map(b => `
      <li><span class="gname">${esc(b.n)}</span>${b.ok ? '<span class="status ok">Checked</span>' : '<span class="status todo" title="This ballot didn’t come with the guest’s personal code">Unverified</span>'}
      <button type="button" class="iconbtn" data-act="removeBallot" data-name="${esc(b.n)}" aria-label="Remove ${esc(b.n)}’s ballot">×</button></li>`).join('');
    const contest = !v ? `
      <section class="panel" id="p-contest">
        <div class="phead"><h2>Costume contest</h2><span class="pill">Not open</span></div>
        <p class="muted">Open voting after the costume parade. Guests scan the voting code (or tap a link you text them), pick their favorites, and show you their ballot code.</p>
        <button type="button" class="btn potion block" data-act="openVoting" ${h.guests.length >= 2 ? '' : 'disabled'}>Open voting</button>
      </section>` : `
      <section class="panel" id="p-contest">
        <div class="phead"><h2>Costume contest</h2><span class="pill live">Voting open</span></div>
        <div class="btnrow">
          <button type="button" class="btn" data-act="showVoting">Show voting code</button>
          <button type="button" class="btn ghost" data-act="copyVoting">Copy voting link</button>
        </div>
        <button type="button" class="btn potion block mt" data-act="scan">Scan ballots</button>
        <p class="tally-line"><span class="bignum">${ballots.length}</span> <span>of ${h.guests.length} ballots in</span></p>
        ${ballots.length ? `<ul class="voters">${voterRows}</ul>` : '<p class="fine">No ballots yet. You can also scan ballot codes with your phone’s camera app; each one opens this page and counts itself.</p>'}
        <label class="switch"><input type="checkbox" data-change="spread" ${h.spread !== false ? 'checked' : ''}><span>One award per person</span></label>
        <p class="fine">If someone tops two categories, they keep the one with more votes and the other goes to the runner-up. Best Overall is decided first.</p>
        <button type="button" class="btn potion block mt" data-act="revealWinners" ${ballots.length ? '' : 'disabled'}>Reveal the winners</button>
        ${ballots.length ? `<details class="cant"><summary>Full tally</summary>${tallyTableHTML(h)}</details>` : ''}
        <details class="cant danger-zone">
          <summary>Reset voting</summary>
          <p class="fine">Clears every ballot and starts a new round. Guests have to open the new voting link.</p>
          <button type="button" class="btn danger" data-act="resetVotes">Clear all ballots</button>
        </details>
      </section>`;

    const wc = (h.words || []).length;
    const ac = (h.actions || []).length;
    return `
      <div class="host-head">
        <p class="kicker">Host tools · Only on this phone</p>
        <h1 class="title">Run the games</h1>
        <button type="button" class="btn ghost block" data-act="shareSite">Show the site’s QR code</button>
      </div>

      <section class="panel" id="p-guests">
        <div class="phead"><h2>Guests</h2><span class="pill">${h.guests.length}</span></div>
        <form data-form="addGuests" class="inline-form">
          <label for="g-names">Add names, one per line</label>
          <textarea id="g-names" name="names" rows="3" placeholder="Paste your guest list here"></textarea>
          <button class="btn block">Add guests</button>
        </form>
        ${h.guests.length ? `<ul class="glist">${guestRows}</ul>` : '<p class="fine">No guests yet.</p>'}
      </section>

      <details class="panel fold" id="p-weapons">
        <summary><h2>Weapons</h2><span class="pill">${wc} words · ${ac} actions</span></summary>
        <form data-form="weapons" class="inline-form">
          <label for="w-words">Words to trick them into saying</label>
          <textarea id="w-words" name="words" rows="8">${esc((h.words || []).join('\n'))}</textarea>
          <label for="w-actions">Actions, finishing “Get them to…”</label>
          <textarea id="w-actions" name="actions" rows="7">${esc((h.actions || []).join('\n'))}</textarea>
          <label for="w-mix">Hand out</label>
          <select id="w-mix" name="mix">
            <option value="both" ${h.mix === 'both' || !h.mix ? 'selected' : ''}>Words and actions</option>
            <option value="words" ${h.mix === 'words' ? 'selected' : ''}>Words only</option>
            <option value="actions" ${h.mix === 'actions' ? 'selected' : ''}>Actions only</option>
          </select>
          <div class="btnrow">
            <button class="btn">Save weapons</button>
            <button type="button" class="btn ghost" data-act="resetWeapons">Reset to defaults</button>
          </div>
          ${dealt ? '<p class="fine">Changes apply the next time you deal.</p>' : ''}
        </form>
      </details>

      ${missions}
      ${contest}

      <details class="panel fold" id="p-backup">
        <summary><h2>Backup</h2></summary>
        <p class="muted">Everything lives on this phone. Copy a backup after dealing and paste it somewhere safe, like Notes.</p>
        <button type="button" class="btn block" data-act="copyBackup">Copy backup</button>
        <form data-form="restore" class="inline-form">
          <label for="restore-text">Restore a backup</label>
          <textarea id="restore-text" name="backup" rows="2"></textarea>
          <button class="btn ghost block">Restore</button>
        </form>
        <button type="button" class="btn danger block mt" data-act="wipe">Start over</button>
      </details>`;
  }

  // ---------- costume contest math ----------
  function tally(h) {
    const out = {};
    CATS.forEach(c => { out[c.id] = {}; });
    Object.values((h.vote && h.vote.ballots) || {}).forEach(b => CATS.forEach(c => {
      const p = b.picks[c.id];
      if (!p) return;
      const k = norm(p);
      out[c.id][k] = out[c.id][k] || { n: p, v: 0 };
      out[c.id][k].v += 1;
    }));
    return out;
  }

  function awards(counts, spread) {
    const res = {};
    const taken = new Set();
    const list = cid => Object.entries(counts[cid]).map(([k, o]) => ({ k, n: o.n, v: o.v }))
      .sort((a, b) => b.v - a.v || a.n.localeCompare(b.n));
    const decide = cid => {
      const all = list(cid);
      if (!all.length) { res[cid] = { winners: [], votes: 0, note: '' }; return; }
      let pool = spread ? all.filter(e => !taken.has(e.k)) : all;
      if (!pool.length) pool = all;
      const top = pool[0].v;
      const winners = pool.filter(e => e.v === top);
      const skipped = spread ? all.filter(e => e.v > top && taken.has(e.k)).map(e => e.n) : [];
      if (winners.length === 1) taken.add(winners[0].k);
      res[cid] = {
        winners: winners.map(e => e.n),
        votes: top,
        note: skipped.length ? `${skipped.join(' and ')} also led this category but already won an award.` : '',
      };
    };
    decide('overall');
    const rest = CATS.map(c => c.id).filter(id => id !== 'overall');
    while (rest.length) {
      let bi = 0;
      let bv = -1;
      rest.forEach((cid, i) => {
        const pool = list(cid).filter(e => !spread || !taken.has(e.k));
        const v = pool.length ? pool[0].v : 0;
        if (v > bv) { bv = v; bi = i; }
      });
      decide(rest.splice(bi, 1)[0]);
    }
    return res;
  }

  function tallyTableHTML(h) {
    const counts = tally(h);
    const rows = new Map();
    CATS.forEach(c => Object.entries(counts[c.id]).forEach(([k, o]) => {
      if (!rows.has(k)) rows.set(k, { n: o.n, v: {}, total: 0 });
      rows.get(k).v[c.id] = o.v;
      rows.get(k).total += o.v;
    }));
    const sorted = Array.from(rows.values()).sort((a, b) => b.total - a.total || a.n.localeCompare(b.n));
    const short = { scary: 'Scary', funny: 'Funny', char: 'Char.', creative: 'Creat.', overall: 'Best' };
    return `<div class="scroll-x"><table class="tally">
      <thead><tr><th scope="col">Guest</th>${CATS.map(c => `<th scope="col" title="${esc(c.name)}">${short[c.id]}</th>`).join('')}</tr></thead>
      <tbody>${sorted.map(r => `<tr><th scope="row">${esc(r.n)}</th>${CATS.map(c => `<td>${r.v[c.id] || ''}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>`;
  }

  // ---------- reveal show ----------
  let rv = null;
  function openReveal() {
    const h = getHost();
    if (!h || !h.vote) return;
    rv = { i: 0, phase: 'intro', res: awards(tally(h), h.spread !== false) };
    openLayer('<div class="reveal" id="reveal"></div>', { label: 'Reveal the winners', cls: 'reveal-layer', onClose: () => { rv = null; } });
    drawReveal();
  }
  function drawReveal() {
    const el = $('#reveal');
    if (!el || !rv) return;
    const cid = REVEAL_ORDER[rv.i];
    const cat = CATS.find(c => c.id === cid);
    const r = rv.res[cid];
    const last = rv.i === REVEAL_ORDER.length - 1;
    let center;
    if (rv.phase === 'intro') {
      center = `<p class="r-and">And the ${cat.grand ? 'grand prize' : 'award'} for</p><h2 class="r-cat">${esc(cat.name)}</h2><p class="r-and">goes to…</p>`;
    } else if (rv.phase === 'drum') {
      center = `<h2 class="r-cat small">${esc(cat.name)}</h2><div class="drum" role="img" aria-label="Drumroll"><span></span><span></span><span></span></div>`;
    } else {
      let who;
      let sub;
      if (!r.winners.length) { who = 'No votes'; sub = 'Nobody picked anyone for this one.'; }
      else if (r.winners.length > 1) { who = r.winners.join(' & '); sub = `Tied at ${plural(r.votes, 'vote', 'votes')}. Cheer-off: the loudest applause wins!`; }
      else { who = r.winners[0]; sub = plural(r.votes, 'vote', 'votes'); }
      center = `<h2 class="r-cat small">${esc(cat.name)}</h2><p class="r-name" aria-live="assertive">${esc(who)}</p><p class="r-sub">${esc(sub)}</p>${r.note ? `<p class="r-note">${esc(r.note)}</p>` : ''}`;
    }
    const label = rv.phase === 'intro' ? 'Reveal' : rv.phase === 'shown' ? (last ? 'Finish' : 'Next award') : '';
    el.innerHTML = `
      <p class="kicker">Costume contest · ${rv.i + 1} of ${REVEAL_ORDER.length}</p>
      <div class="r-center">${center}</div>
      <div class="r-btns">
        ${label ? `<button type="button" class="btn potion big" data-act="rvNext">${label}</button>` : ''}
        <button type="button" class="btn ghost" data-act="close">Close</button>
      </div>`;
    const next = $('[data-act="rvNext"]', el);
    if (next) next.focus({ preventScroll: true });
  }
  function rvNext() {
    if (!rv) return;
    if (rv.phase === 'intro') {
      rv.phase = 'drum';
      drawReveal();
      const i = rv.i;
      setTimeout(() => { if (rv && rv.i === i && rv.phase === 'drum') { rv.phase = 'shown'; drawReveal(); } }, reduceMotion ? 700 : 2600);
    } else if (rv.phase === 'shown') {
      if (rv.i < REVEAL_ORDER.length - 1) { rv.i += 1; rv.phase = 'intro'; drawReveal(); } else closeLayer();
    }
  }

  // ---------- ballot scanner (host) ----------
  let scan = null;
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (window.jsQR) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('load failed'));
      document.head.appendChild(s);
    });
  }
  async function startScanner() {
    const layer = openLayer(`
      <div class="scan">
        <video id="scan-video" playsinline muted autoplay></video>
        <div class="frame" id="scan-frame"></div>
        <div class="bar">
          <p class="status-line" id="scan-status">Starting the camera…</p>
          <ul class="log" id="scan-log" aria-live="polite"></ul>
          <button type="button" class="btn potion block" data-act="close">Done scanning</button>
        </div>
      </div>`, { label: 'Scan ballots', cls: 'scan-layer', onClose: stopScanner });
    const status = $('#scan-status', layer);
    const video = $('#scan-video', layer);
    scan = { on: true, stream: null, timer: 0, last: '', lastAt: 0 };
    const cur = scan;
    try {
      cur.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    } catch (e) {
      status.textContent = 'The camera is blocked. Allow camera access for this site, or scan ballots with your phone’s camera app instead.';
      return;
    }
    if (!cur.on) { cur.stream.getTracks().forEach(t => t.stop()); return; }
    video.srcObject = cur.stream;
    try { await video.play(); } catch (e) { /* autoplay is allowed for muted video */ }
    let detector = null;
    if ('BarcodeDetector' in window) {
      try {
        const formats = await window.BarcodeDetector.getSupportedFormats();
        if (formats.includes('qr_code')) detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      } catch (e) { detector = null; }
    }
    if (!detector) {
      try { await loadScript('vendor/jsQR.min.js'); } catch (e) { status.textContent = 'The scanner couldn’t load. Check your connection and try again.'; return; }
    }
    status.textContent = 'Point the camera at a ballot code';
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const tick = async () => {
      if (!cur.on) return;
      if (video.readyState >= 2 && video.videoWidth) {
        let text = null;
        try {
          if (detector) {
            const codes = await detector.detect(video);
            if (codes.length) text = codes[0].rawValue;
          } else {
            const scale = Math.min(1, 720 / Math.max(video.videoWidth, video.videoHeight));
            canvas.width = Math.round(video.videoWidth * scale);
            canvas.height = Math.round(video.videoHeight * scale);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const hit = window.jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
            if (hit) text = hit.data;
          }
        } catch (e) { text = null; }
        if (text && (text !== cur.last || Date.now() - cur.lastAt > 4000)) {
          cur.last = text;
          cur.lastAt = Date.now();
          onScanned(text, layer);
        }
      }
      cur.timer = setTimeout(tick, 140);
    };
    tick();
  }
  function onScanned(text, layer) {
    let res;
    try {
      const u = new URL(text, location.href);
      const raw = u.searchParams.get('b');
      res = raw ? recordBallot(dec(raw)) : { ok: false, msg: 'That isn’t a ballot code.' };
    } catch (e) { res = { ok: false, msg: 'That isn’t a ballot code.' }; }
    const log = $('#scan-log', layer);
    const frame = $('#scan-frame', layer);
    if (log) {
      const li = document.createElement('li');
      li.className = res.ok ? 'ok' : 'bad';
      li.textContent = res.msg;
      log.prepend(li);
    }
    if (frame) {
      frame.classList.remove('hit', 'miss');
      void frame.offsetWidth;
      frame.classList.add(res.ok ? 'hit' : 'miss');
    }
    buzz(res.ok ? 50 : [30, 40, 30]);
  }
  function stopScanner() {
    if (!scan) return;
    scan.on = false;
    clearTimeout(scan.timer);
    if (scan.stream) scan.stream.getTracks().forEach(t => t.stop());
    scan = null;
    render();
  }

  // ---------- mission reveal ----------
  let revealTimer = 0;
  function setReveal(dossier, on) {
    if (!dossier) return;
    dossier.dataset.revealed = on ? 'true' : 'false';
    $$('.secret', dossier).forEach(r => r.setAttribute('aria-hidden', on ? 'false' : 'true'));
    $$('.sr', dossier).forEach(s => { s.textContent = on ? '' : 'hidden'; });
    const btn = $('[data-act="reveal"]', dossier);
    if (btn) { btn.textContent = on ? 'Hide' : 'Tap to reveal'; btn.setAttribute('aria-pressed', String(on)); }
    clearTimeout(revealTimer);
    if (on) revealTimer = setTimeout(() => setReveal(dossier, false), 8000);
  }

  // ---------- player actions ----------
  async function goOut(leaving) {
    const me = getMe();
    if (!me || me.status !== 'alive') return;
    const ok = await ask(leaving ? {
      title: 'Leaving the party?',
      body: 'You’ll pass your target to whoever had you, and you’ll be out of the game. This can’t be undone.',
      buttons: [{ label: 'Cancel', value: false }, { label: 'Yes, I’m leaving', value: true, kind: 'danger' }],
    } : {
      title: 'Did your assassin get you?',
      body: 'Your mission passes to them and you’re out of the game. This can’t be undone.',
      buttons: [{ label: 'Cancel', value: false }, { label: 'Yes, I’m out', value: true, kind: 'danger' }],
    });
    if (!ok) return;
    updateMe(m => {
      const top = m.cards[m.cards.length - 1];
      m.status = leaving ? 'left' : 'dead';
      m.handed = { c: top, lv: leaving ? 1 : 0, at: Date.now() };
      m.log.push({ type: leaving ? 'left' : 'died', at: Date.now() });
    });
    render();
    showHandover();
  }

  function showHandover() {
    const me = getMe();
    if (!me || !me.handed) return;
    const leaving = me.handed.lv === 1;
    const url = linkFor('c', { t: 'c', g: me.g, di: me.di, f: me.n, c: me.handed.c, lv: me.handed.lv });
    openQR({
      title: leaving ? 'Pass on your target' : 'Hand over your mission',
      body: leaving
        ? 'Before you go, show this to whoever had you as their target. They scan it with their phone camera and take over your target. It doesn’t count as a kill.'
        : 'Show this to your assassin. They scan it with their phone camera, and your target and weapon become theirs.',
      url,
      extra: '<p class="undo"><button type="button" class="linkish" data-act="undoOut">Tapped this by mistake? Undo</button></p>',
    });
  }

  async function undoOut() {
    const ok = await ask({
      title: 'Undo?',
      body: 'Only undo if nobody has scanned your code yet. Otherwise two people will end up with the same target.',
      buttons: [{ label: 'Keep it', value: false }, { label: 'Undo, I’m still in', value: true, kind: 'danger' }],
    });
    if (!ok) return;
    updateMe(m => { m.status = 'alive'; m.handed = null; m.log.push({ type: 'undo', at: Date.now() }); });
    closeAllLayers();
    render();
  }

  function newcomerDialog() {
    openLayer(`
      <h2 class="dlg-title">Bring in a late arrival</h2>
      <p class="dlg-body">They take over your current target and weapon. Then they become your new target, and you get a fresh weapon.</p>
      <form data-form="newcomer" class="inline-form">
        <label for="nc-name">Their name</label>
        <input id="nc-name" name="name" type="text" maxlength="28" autocomplete="off" required autofocus>
        <div class="dlg-btns"><button type="button" class="btn ghost" data-act="close">Cancel</button><button class="btn potion">Make their mission</button></div>
      </form>`, { label: 'Bring in a late arrival' });
  }

  function addNewcomer(rawName) {
    const name = cleanName(rawName);
    const me = getMe();
    if (!me || me.status !== 'alive' || !name) return;
    if (same(name, me.n)) { toast('Use their name, not yours.', 'bad'); return; }
    const top = me.cards[me.cards.length - 1];
    if (same(name, top.t) || me.cards.some(c => same(c.o, name))) { toast(`${name} is already in the game. Use a different name.`, 'bad'); return; }
    const theirs = { o: name, t: top.t, w: top.w };
    const mine = { o: me.n, t: name, w: freshWeapon(top.w) };
    updateMe(m => { m.cards.push(mine); m.log.push({ type: 'splice', who: name, at: Date.now() }); });
    closeAllLayers();
    render();
    openQR({
      title: `${name}, scan this`,
      body: 'Point your phone camera at the code. Your secret mission opens on your phone.',
      url: linkFor('m', { t: 'm', g: me.g, di: me.di, n: name, k: '', c: theirs, via: me.n }),
      copyLabel: 'Copy their link',
    });
  }

  // ---------- host actions ----------
  function newHost() {
    return {
      v: 1, g: rid(5), guests: [], words: DEFAULT_WORDS.slice(), actions: DEFAULT_ACTIONS.slice(),
      mix: 'both', dealt: null, vote: null, spread: true, at: Date.now(),
    };
  }

  function addGuests(text) {
    const names = String(text || '').split(/[\n,]+/).map(cleanName).filter(Boolean);
    if (!names.length) { toast('Type at least one name.', 'bad'); return; }
    const added = [];
    const skipped = [];
    updateHost(h => {
      names.forEach(n => {
        if (h.guests.some(g => same(g.n, n)) || added.some(a => same(a, n))) { skipped.push(n); return; }
        h.guests.push({ n, k: rid(6), p: true, given: false });
        added.push(n);
      });
    });
    render();
    const ta = $('#g-names');
    if (ta) ta.value = '';
    toast(`Added ${plural(added.length, 'guest', 'guests')}${skipped.length ? `. Skipped duplicates: ${skipped.join(', ')}` : ''}`, added.length ? 'good' : 'bad');
  }

  function showMissionQR(name) {
    const h = getHost();
    const g = h && h.guests.find(x => same(x.n, name));
    if (!g) return;
    const card = h.dealt && h.dealt.cards[g.n] ? h.dealt.cards[g.n] : null;
    const url = linkFor('m', { t: 'm', g: h.g, di: h.dealt ? h.dealt.id : null, n: g.n, k: g.k, c: card });
    openQR({
      title: `${g.n}, scan this`,
      body: card
        ? 'Point your phone camera at the code. Your secret mission opens on your phone.'
        : 'This registers you for the costume contest. To join Secret Assassin, ask any player who’s still in to bring you in.',
      url,
      copyLabel: 'Copy their link',
      primary: { label: card ? 'Done, they have it' : 'Done', act: 'markGiven', data: { name: g.n } },
      extra: `<p class="undo"><button type="button" class="linkish" data-act="openHere" data-name="${esc(g.n)}">This is me. Open it on this phone</button></p>`,
    });
  }

  function votingLink(h) {
    return linkFor('v', { t: 'v', g: h.g, r: h.vote.r, names: h.guests.map(x => x.n) });
  }
  function showVotingQR() {
    const h = getHost();
    if (!h || !h.vote) return;
    openQR({
      title: 'Voting is open',
      body: 'Scan to open your ballot. When you’re done, show your ballot code back to this phone.',
      url: votingLink(h),
      copyLabel: 'Copy voting link',
      extra: '<p class="undo"><button type="button" class="linkish" data-act="voteHere">Vote on this phone</button></p>',
    });
  }

  function ballotPayload() {
    const vote = getVote();
    const b = getBallot();
    const me = getMe();
    if (!vote || !b) return null;
    const voter = me && me.g === vote.g ? me.n : b.voter;
    if (!voter) return null;
    const k = me && me.g === vote.g && same(me.n, voter) ? me.k : '';
    return { t: 'b', g: vote.g, r: vote.r, n: voter, k, p: CATS.map(c => b.picks[c.id] || '') };
  }

  // ---------- event wiring ----------
  const actions = {
    close: () => closeLayer(),
    copy: el => copyText(el.dataset.text, el.dataset.label || 'Link'),
    shareSite: () => openQR({
      title: 'Share Halloween Night',
      body: 'Anyone can scan this to open the site and read the rules. Secret missions still come from the host.',
      url: BASE,
      copyLabel: 'Copy site link',
    }),
    reveal: el => { const d = el.closest('.dossier'); setReveal(d, d.dataset.revealed !== 'true'); },
    killed: () => goOut(false),
    leaving: () => goOut(true),
    showHandover: () => showHandover(),
    undoOut: () => undoOut(),
    newcomer: () => newcomerDialog(),

    iam: el => { const b = getBallot(); if (!b) return; b.voter = el.dataset.name; save('ballot', b); render(); },
    changeVoter: () => { const b = getBallot(); if (!b) return; b.voter = null; b.picks = {}; save('ballot', b); render(); },
    pick: el => {
      const b = getBallot();
      if (!b) return;
      const { cat, name } = el.dataset;
      b.picks[cat] = same(b.picks[cat], name) ? '' : name;
      save('ballot', b);
      $$(`.chip[data-cat="${cat}"]`).forEach(c => c.setAttribute('aria-pressed', String(same(b.picks[cat], c.dataset.name))));
      const picked = CATS.filter(c => b.picks[c.id]).length;
      const pr = $('#progress');
      if (pr) pr.textContent = `${picked} of ${CATS.length} picked`;
      const cast = $('#cast-btn');
      if (cast) cast.disabled = !picked;
    },
    ballotQR: () => {
      const p = ballotPayload();
      if (!p) return;
      openQR({
        title: 'Show this to your host',
        body: 'Your host scans it to count your votes. Changed your mind? Edit your picks and show the new code.',
        url: linkFor('b', p),
        copyLabel: 'Copy ballot link',
      });
    },
    castHere: () => {
      const p = ballotPayload();
      if (!p) return;
      const res = recordBallot(p);
      toast(res.msg, res.ok ? 'good' : 'bad');
    },

    hostStart: () => { if (!getHost()) save('host', newHost()); render(); },
    togglePlays: el => { updateHost(h => { const g = h.guests.find(x => same(x.n, el.dataset.name)); if (g && !(h.dealt && h.dealt.cards[g.n])) g.p = !g.p; }); render(); },
    removeGuest: el => { updateHost(h => { h.guests = h.guests.filter(x => !same(x.n, el.dataset.name) || (h.dealt && h.dealt.cards[x.n])); }); render(); },
    resetWeapons: async () => {
      const ok = await ask({ title: 'Reset the weapons?', body: 'This replaces your word and action lists with the defaults.', buttons: [{ label: 'Cancel', value: false }, { label: 'Reset', value: true }] });
      if (!ok) return;
      updateHost(h => { h.words = DEFAULT_WORDS.slice(); h.actions = DEFAULT_ACTIONS.slice(); h.mix = 'both'; });
      render();
      const fold = $('#p-weapons');
      if (fold) fold.open = true;
    },
    deal: async () => {
      const h = getHost();
      const n = h.guests.filter(g => g.p).length;
      const ok = await ask({ title: `Deal missions to ${plural(n, 'player', 'players')}?`, body: 'Do this once most guests have arrived. Anyone who shows up later can still join.', buttons: [{ label: 'Not yet', value: false }, { label: 'Deal missions', value: true }] });
      if (!ok) return;
      updateHost(x => { x.dealt = dealMissions(x); x.guests.forEach(g => { g.given = false; }); });
      render();
      toast('Missions dealt. Tap “Show code” to hand them out.', 'good');
      const p = $('#p-missions');
      if (p) p.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    },
    redeal: async () => {
      const ok = await ask({ title: 'Re-deal everyone?', body: 'Every player gets a new mission and has to scan a new code. Old codes stop working.', buttons: [{ label: 'Cancel', value: false }, { label: 'Re-deal', value: true, kind: 'danger' }] });
      if (!ok) return;
      updateHost(x => { x.dealt = dealMissions(x); x.guests.forEach(g => { g.given = false; }); });
      render();
      toast('New missions dealt.', 'good');
    },
    showMission: el => showMissionQR(el.dataset.name),
    markGiven: el => { updateHost(h => { const g = h.guests.find(x => same(x.n, el.dataset.name)); if (g) g.given = true; }); closeLayer(); render(); },
    openHere: async el => {
      const name = el.dataset.name;
      const ok = await ask({ title: `Open ${name}’s code on this phone?`, body: `Only do this if you’re ${name}. It sets up this phone as ${name}’s.`, buttons: [{ label: 'Cancel', value: false }, { label: `I’m ${name}`, value: true }] });
      if (!ok) return;
      const h = getHost();
      const g = h.guests.find(x => same(x.n, name));
      const card = h.dealt && h.dealt.cards[g.n] ? h.dealt.cards[g.n] : null;
      updateHost(x => { const gg = x.guests.find(y => same(y.n, name)); if (gg && card) gg.given = true; });
      closeAllLayers();
      await acceptMission({ t: 'm', g: h.g, di: h.dealt ? h.dealt.id : null, n: g.n, k: g.k, c: card });
    },
    openVoting: () => { updateHost(h => { h.vote = { r: rid(4), ballots: {}, at: Date.now() }; }); render(); showVotingQR(); },
    showVoting: () => showVotingQR(),
    copyVoting: () => { const h = getHost(); if (h && h.vote) copyText(votingLink(h), 'Voting link'); },
    voteHere: () => {
      const h = getHost();
      closeAllLayers();
      acceptVoting({ t: 'v', g: h.g, r: h.vote.r, names: h.guests.map(x => x.n) });
    },
    scan: () => startScanner(),
    removeBallot: async el => {
      const name = el.dataset.name;
      const ok = await ask({ title: `Remove ${name}’s ballot?`, body: 'They can show their code again to be counted.', buttons: [{ label: 'Cancel', value: false }, { label: 'Remove', value: true, kind: 'danger' }] });
      if (!ok) return;
      updateHost(h => { delete h.vote.ballots[norm(name)]; });
      render();
    },
    revealWinners: () => openReveal(),
    rvNext: () => rvNext(),
    resetVotes: async () => {
      const ok = await ask({ title: 'Clear all ballots?', body: 'Voting starts over with a new link. Guests have to open the new voting link.', buttons: [{ label: 'Cancel', value: false }, { label: 'Clear ballots', value: true, kind: 'danger' }] });
      if (!ok) return;
      updateHost(h => { h.vote = { r: rid(4), ballots: {}, at: Date.now() }; });
      render();
    },
    copyBackup: () => { const h = getHost(); if (h) copyText(`HN1:${enc(h)}`, 'Backup'); },
    wipe: async () => {
      const ok = await ask({ title: 'Start over?', body: 'This deletes the guest list, the missions and every ballot on this phone. Guests keep whatever is on their phones.', buttons: [{ label: 'Cancel', value: false }, { label: 'Delete everything', value: true, kind: 'danger' }] });
      if (!ok) return;
      save('host', null);
      render();
    },
  };

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const fn = actions[el.dataset.act];
    if (fn) { e.preventDefault(); fn(el, e); }
  });

  const forms = {
    addGuests: (f, fd) => addGuests(fd.get('names')),
    weapons: (f, fd) => {
      const lines = s => Array.from(new Set(String(s || '').split('\n').map(x => x.trim()).filter(Boolean)));
      updateHost(h => { h.words = lines(fd.get('words')); h.actions = lines(fd.get('actions')); h.mix = fd.get('mix') || 'both'; });
      toast('Weapons saved.', 'good');
      render();
    },
    newcomer: (f, fd) => addNewcomer(fd.get('name')),
    iamOther: (f, fd) => {
      const n = cleanName(fd.get('name'));
      const b = getBallot();
      if (!n || !b) return;
      b.voter = n;
      save('ballot', b);
      render();
    },
    restore: async (f, fd) => {
      const raw = String(fd.get('backup') || '').trim().replace(/^HN1:/, '');
      const obj = dec(raw);
      if (!obj || !obj.g || !Array.isArray(obj.guests)) { toast('That backup didn’t work. Copy the whole thing and try again.', 'bad'); return; }
      if (getHost()) {
        const ok = await ask({ title: 'Replace this setup?', body: 'The backup replaces the guest list, missions and ballots on this phone.', buttons: [{ label: 'Cancel', value: false }, { label: 'Replace', value: true, kind: 'danger' }] });
        if (!ok) return;
      }
      save('host', obj);
      toast('Backup restored.', 'good');
      go('host');
    },
  };
  document.addEventListener('submit', e => {
    const f = e.target.closest('form[data-form]');
    if (!f) return;
    e.preventDefault();
    const fn = forms[f.dataset.form];
    if (fn) fn(f, new FormData(f));
  });

  document.addEventListener('change', e => {
    const el = e.target.closest('[data-change]');
    if (!el) return;
    if (el.dataset.change === 'spread') updateHost(h => { h.spread = el.checked; });
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && layerStack.length && !scan) closeLayer();
  });

  // ---------- router ----------
  const VIEWS = { rules: renderRules, mission: renderMission, vote: renderVote, host: renderHost };
  function currentView() {
    const hsh = location.hash.replace('#', '');
    if (VIEWS[hsh]) return hsh;
    return getMe() ? 'mission' : 'rules';
  }
  function render() {
    const v = currentView();
    const openFolds = $$('details[open][id]').map(d => d.id);
    $('#view').innerHTML = VIEWS[v]();
    openFolds.forEach(id => { const d = document.getElementById(id); if (d) d.open = true; });
    $$('#tabs a').forEach(a => a.setAttribute('aria-current', a.dataset.tab === v ? 'page' : 'false'));
    $('#tab-host').hidden = !(getHost() || v === 'host');
    const me = getMe();
    const who = $('#who');
    who.hidden = !me;
    who.textContent = me ? me.n : '';
    $('#storage-warn').hidden = storageOK;
    document.title = { rules: 'Halloween Night', mission: 'My mission · Halloween Night', vote: 'Vote · Halloween Night', host: 'Host · Halloween Night' }[v];
    if (pendingScroll) {
      const el = document.getElementById(pendingScroll);
      pendingScroll = null;
      if (el) el.scrollIntoView({ block: 'start' });
    }
  }
  function go(v) {
    if (location.hash !== `#${v}`) location.hash = v;
    else render();
  }
  window.addEventListener('hashchange', () => {
    const keepScroll = !!pendingScroll;
    closeAllLayers();
    render();
    if (!keepScroll) window.scrollTo(0, 0);
  });

  // Another tab (for example a ballot opened from the camera app) changed the data.
  window.addEventListener('storage', e => {
    if (!e.key || !e.key.startsWith(NS)) return;
    const a = document.activeElement;
    if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
    if (!layerStack.length) render();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { const d = $('.dossier'); if (d) setReveal(d, false); }
    else if (!layerStack.length) {
      const a = document.activeElement;
      if (!(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) render();
    }
  });

  // ---------- start ----------
  const incoming = readIncoming();
  render();
  handleIncoming(incoming);
})();
