/**
 * Walk a Mile — admin-only UI (loaded from admin.html only)
 */
function getDB() {
  return WamDb.getSubmissions();
}

async function updateStatus(id, status) {
  if (!WamDb.isReady()) {
    alert('Walk a Mile could not update that right now. Try again in a moment.');
    return;
  }
  try {
    await WamDb.updateStatus(id, status);
    await WamDb.syncAll();
    refreshAdminFromServer();
  } catch (e) {
    alert(e.message || String(e));
  }
}

async function revealMystery(id) {
  const entry = getDB().find(function (s) {
    return s.id === id;
  });
  const suggested = (entry && entry.name) || '';
  const name = prompt('Who is the Mystery Miler? This name becomes public.', suggested);
  if (!name) return;
  if (!WamDb.isReady()) {
    alert('Walk a Mile could not update that right now. Try again in a moment.');
    return;
  }
  if (WamDb.votingOpen() && !confirm('Voting is still open. Reveal anyway?\n\nTip: close voting on the Campaign Controls tab first.')) {
    return;
  }
  // Matching the revealed name to the roster is what lets the scoreboard mark guesses
  // right or wrong. A name we can't match still reveals fine, it just can't be scored.
  const clean = name.trim();
  const flat = clean.toLowerCase().replace(/\s+/g, ' ');
  const member = (WamDb.getRoster() || []).find(function (p) {
    return p.name.toLowerCase().replace(/\s+/g, ' ') === flat;
  });
  if (!member && !confirm('“' + clean + '” is not on the department roster.\n\nThe reveal will still work, but guesses for this Mystery Miler cannot be scored by division. Continue?')) {
    return;
  }

  try {
    await WamDb.updateSubmissionDoc(id, { revealedName: clean }, 'archived', member ? member.id : undefined);
    await WamDb.syncAll();
    refreshAdminFromServer();
  } catch (e) {
    alert(e.message || String(e));
  }
}

/**
 * Mystery entries are public as soon as they are submitted, so removing one takes it off
 * the Mystery Mile page straight away. Guesses already cast against it stop counting.
 */
async function removeMystery(id) {
  const entry = getDB().find(function (s) {
    return s.id === id;
  });
  const who = (entry && entry.name) || 'this entry';
  if (!confirm('Remove ' + who + "'s Mystery Mile from the site?\n\nIt disappears from the Mystery Mile page right away. You can put it back later, and it frees up their one Mystery Mile for this quarter.")) {
    return;
  }
  await updateStatus(id, 'rejected');
}

async function restoreMystery(id) {
  await updateStatus(id, 'pending');
}

// ── CSV export ───────────────────────────────────────────────

/**
 * Excel decides a file is UTF-8 only if it starts with a byte-order mark; without it,
 * names like "Muñoz" arrive mangled. A Blob rather than a data: URL because the vote
 * export can be far larger than a URL is allowed to be.
 */
function downloadCSV(filename, rows) {
  const body = rows
    .map(function (row) {
      return row
        .map(function (v) {
          if (v === null || v === undefined) return '';
          const s = String(v);
          // A leading =, +, - or @ is executed as a formula when the file is opened.
          const safe = /^[=+\-@]/.test(s) ? "'" + s : s;
          return '"' + safe.replace(/"/g, '""') + '"';
        })
        .join(',');
    })
    .join('\r\n');

  const blob = new Blob(['\uFEFF' + body], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () {
    URL.revokeObjectURL(url);
  }, 1000);
}

function stamp() {
  const d = new Date();
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

function exportData() {
  const db = getDB();
  const rows = [['Type', 'Mile number', 'Name', 'Role', 'Campus', 'Theme', 'Status',
                 'Submitted', 'Revealed as', 'Answer 1', 'Answer 2', 'Answer 3']];
  db.forEach(function (s) {
    const a = s.answers || [];
    rows.push([
      s.type === 'myst' ? 'Mystery Mile' : 'Conventional Mile',
      s.mileNumber || '',
      s.type === 'myst' ? 'Anonymous' : s.name || '',
      s.role || '',
      s.campus || '',
      s.theme || (s.type === 'myst' ? 'Mystery · Set #' + (s.promptSet || '?') : ''),
      s.status || '',
      s.submittedAt || '',
      s.revealedName || '',
      a[0] || '', a[1] || '', a[2] || '',
    ]);
  });
  downloadCSV('walk-a-mile-submissions-' + stamp() + '.csv', rows);
}

/** One row per guess: who guessed, their division, what they guessed, and if it was right. */
async function exportVotes() {
  const data = await WamDb.getVoteExport();
  if (data.length === 0) {
    alert('No guesses have been cast yet, so there is nothing to export.');
    return;
  }
  const rows = [['Quarter', 'Mystery Miler', 'Revealed', 'Voter', 'Voter on roster',
                 'Voter division', 'Guess', 'Guess on roster', 'Correct', 'Guessed at']];
  data.forEach(function (r) {
    rows.push([
      r.quarter, r.mystery_miler, r.mystery_revealed ? 'Yes' : 'No',
      r.voter_name, r.voter_on_roster ? 'Yes' : 'No', r.voter_division,
      r.guess, r.guess_on_roster ? 'Yes' : 'No',
      // Null means the entry has nobody linked, so correctness is unknown rather than false.
      r.is_correct === null ? 'Not scored' : r.is_correct ? 'Yes' : 'No',
      r.guessed_at,
    ]);
  });
  downloadCSV('walk-a-mile-guesses-' + stamp() + '.csv', rows);
}

/** The division totals as shown on screen, one row per Mystery Miler per division. */
async function exportScoreboard() {
  const data = await WamDb.getDivisionScoreboard();
  if (data.length === 0) {
    alert('No guesses have been cast yet, so there is nothing to export.');
    return;
  }
  const rows = [['Mystery Miler', 'Linked to roster', 'Division', 'Correct guesses',
                 'Total guesses', 'Accuracy %']];
  data.forEach(function (r) {
    const votes = Number(r.votes);
    rows.push([
      r.mystery_name, r.mystery_linked ? 'Yes' : 'No', r.division_name,
      r.correct_votes, votes, votes ? Math.round((Number(r.correct_votes) / votes) * 100) : 0,
    ]);
  });
  downloadCSV('walk-a-mile-scoreboard-' + stamp() + '.csv', rows);
}

async function exportWriteIns() {
  const data = await WamDb.getWriteInVotes();
  if (data.length === 0) {
    alert('Nobody has written in a name that is not on the roster.');
    return;
  }
  const rows = [['Typed name', 'Guesses', 'Similar name already on roster']];
  data.forEach(function (r) {
    rows.push([r.typed_name, r.votes, r.suggested_member_name || '']);
  });
  downloadCSV('walk-a-mile-write-ins-' + stamp() + '.csv', rows);
}

function showAdminTab(id) {
  document.querySelectorAll('.admin-panel').forEach(function (p) {
    p.classList.remove('on');
  });
  document.querySelectorAll('.admin-tab').forEach(function (t) {
    t.classList.remove('act');
  });
  document.getElementById('apanel-' + id).classList.add('on');
  document.getElementById('atab-' + id).classList.add('act');
  if (id === 'admins') void buildAdminRoster();
  if (id === 'campaign') buildCampaignPanel();
  if (id === 'scoring') void buildScoringPanel();
}

// ── Campaign controls ────────────────────────────────────────

function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toDateInput(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

function fromDateInput(value, endOfDay) {
  if (!value) return null;
  const d = new Date(value + (endOfDay ? 'T23:59:59.999' : 'T00:00:00'));
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function setCfgMsg(elId, text, kind) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = text || '';
  el.className = 'cfg-msg' + (kind ? ' ' + kind : '');
  if (text) {
    setTimeout(function () {
      if (el.textContent === text) el.textContent = '';
    }, 6000);
  }
}

function buildCampaignPanel() {
  const s = WamDb.getSettings();
  const banner = document.getElementById('cfgBanner');
  const swSub = document.getElementById('swSubmissions');
  const swVote = document.getElementById('swVoting');
  if (!banner || !swSub || !swVote) return;

  if (!s) {
    banner.innerHTML =
      '<strong style="color:var(--red)">Controls unavailable.</strong> ' +
      esc(WamDb.getSettingsError() || 'The campaign settings could not be loaded.');
    swSub.disabled = true;
    swVote.disabled = true;
    return;
  }

  swSub.disabled = false;
  swVote.disabled = false;
  swSub.classList.toggle('on', s.submissionsOpen);
  swVote.classList.toggle('on', s.votingOpen);
  swSub.setAttribute('aria-pressed', String(s.submissionsOpen));
  swVote.setAttribute('aria-pressed', String(s.votingOpen));

  const chip = function (label, open) {
    return (
      '<span class="chip ' + (open ? 'chip-green' : 'chip-gray') + '">' + label + ': ' + (open ? 'Open' : 'Closed') + '</span>'
    );
  };
  const updated = s.updatedAt
    ? ' · last changed ' + new Date(s.updatedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) + (s.updatedBy ? ' by ' + esc(s.updatedBy) : '')
    : '';
  banner.innerHTML =
    '<strong>' + esc(s.quarterLabel || 'Current quarter') + '</strong>' +
    chip('Submissions', s.submissionsOpen) +
    chip('Voting', s.votingOpen) +
    '<span style="color:var(--text-muted)">' + updated + '</span>';

  const lbl = document.getElementById('cfgQuarterLabel');
  const st = document.getElementById('cfgQuarterStart');
  const en = document.getElementById('cfgQuarterEnd');
  if (lbl && document.activeElement !== lbl) lbl.value = s.quarterLabel || '';
  if (st && document.activeElement !== st) st.value = toDateInput(s.quarterStartsAt);
  if (en && document.activeElement !== en) en.value = toDateInput(s.quarterEndsAt);
}

async function toggleCampaignFlag(key) {
  const s = WamDb.getSettings();
  if (!s) {
    alert(WamDb.getSettingsError() || 'The campaign settings could not be loaded, so this switch cannot be changed yet.');
    return;
  }
  const next = !s[key];
  if (key === 'submissionsOpen' && !next && !confirm('Close story submissions? Nobody will be able to submit until you reopen them.')) return;
  if (key === 'votingOpen' && !next && !confirm('Close Mystery Mile voting? Existing results stay visible.')) return;
  try {
    await WamDb.updateSettings({ [key]: next });
    buildCampaignPanel();
  } catch (e) {
    alert(e.message || String(e));
    buildCampaignPanel();
  }
}

async function saveCampaignQuarter() {
  const label = document.getElementById('cfgQuarterLabel').value.trim();
  const startsAt = fromDateInput(document.getElementById('cfgQuarterStart').value, false);
  const endsAt = fromDateInput(document.getElementById('cfgQuarterEnd').value, true);
  if (!label) {
    setCfgMsg('cfgQuarterMsg', 'Give the quarter a name, for example "Q3 2026".', 'err');
    return;
  }
  if (!startsAt || !endsAt) {
    setCfgMsg('cfgQuarterMsg', 'Pick both a start and an end date.', 'err');
    return;
  }
  if (new Date(endsAt) <= new Date(startsAt)) {
    setCfgMsg('cfgQuarterMsg', 'The end date has to come after the start date.', 'err');
    return;
  }
  try {
    await WamDb.updateSettings({ quarterLabel: label, quarterStartsAt: startsAt, quarterEndsAt: endsAt });
    await WamDb.syncAll();
    buildCampaignPanel();
    setCfgMsg('cfgQuarterMsg', 'Saved. The Mystery Mile board now covers ' + label + '.', 'ok');
  } catch (e) {
    setCfgMsg('cfgQuarterMsg', e.message || String(e), 'err');
  }
}

function fillNextQuarter() {
  const s = WamDb.getSettings();
  // Roll forward from the end of the configured quarter, or from today on first run.
  const anchor = s && s.quarterEndsAt ? new Date(s.quarterEndsAt) : new Date();
  const start = new Date(anchor.getFullYear(), Math.floor(anchor.getMonth() / 3) * 3, 1);
  if (s && s.quarterEndsAt) start.setMonth(start.getMonth() + 3);
  const end = new Date(start.getFullYear(), start.getMonth() + 3, 0);
  document.getElementById('cfgQuarterLabel').value = 'Q' + (Math.floor(start.getMonth() / 3) + 1) + ' ' + start.getFullYear();
  document.getElementById('cfgQuarterStart').value = toDateInput(start);
  document.getElementById('cfgQuarterEnd').value = toDateInput(end);
  setCfgMsg('cfgQuarterMsg', 'Prefilled — review the dates, then Save quarter.', 'ok');
}

// ── Administrator roster ─────────────────────────────────────

async function buildAdminRoster() {
  const wrap = document.getElementById('adminRosterWrap');
  if (!wrap) return;
  const link = document.getElementById('supabaseUsersLink');
  if (link && window.WAM_SUPABASE && window.WAM_SUPABASE.url) {
    const ref = String(window.WAM_SUPABASE.url).replace(/^https?:\/\//, '').split('.')[0];
    if (ref) link.href = 'https://supabase.com/dashboard/project/' + ref + '/auth/users';
  }
  let rows;
  try {
    rows = await WamDb.listAdmins();
  } catch (e) {
    wrap.innerHTML = '<div class="empty-state"><p>' + esc(e.message || String(e)) + '</p></div>';
    return;
  }
  const me = (await WamDb.currentAdminEmail()).toLowerCase();
  if (!rows.length) {
    wrap.innerHTML = '<div class="empty-state"><span class="empty-state-icon">👥</span><p>No administrators on the list yet.</p></div>';
    return;
  }
  wrap.innerHTML =
    '<table class="sub-table"><thead><tr><th>Name</th><th>Email</th><th>Added</th><th>Actions</th></tr></thead><tbody>' +
    rows
      .map(function (a) {
        const isMe = String(a.email || '').toLowerCase() === me;
        const added = a.created_at
          ? new Date(a.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          : '—';
        return (
          '<tr>' +
          '<td class="td-name">' + esc(a.display_name || '—') + (isMe ? ' <span class="chip chip-navy">You</span>' : '') + '</td>' +
          '<td style="font-family:\'DM Mono\',monospace;font-size:11.5px">' + esc(a.email) + '</td>' +
          '<td style="font-size:11.5px;color:var(--text-muted)">' + added + '</td>' +
          '<td><div class="td-actions">' +
          (isMe
            ? '<span style="font-size:11px;color:var(--text-muted)">Sign in as another admin to remove yourself</span>'
            : '<button class="action-pill ap-reject" onclick="void removeAdminUser(\'' + esc(a.email) + '\')">✕ Remove</button>') +
          '</div></td>' +
          '</tr>'
        );
      })
      .join('') +
    '</tbody></table>';
}

async function addAdminUser() {
  const emailEl = document.getElementById('newAdminEmail');
  const nameEl = document.getElementById('newAdminName');
  try {
    await WamDb.addAdmin(emailEl.value, nameEl.value);
    const added = emailEl.value.trim().toLowerCase();
    emailEl.value = '';
    nameEl.value = '';
    await buildAdminRoster();
    setCfgMsg('adminRosterMsg', 'Added ' + added + '. Now invite them in Supabase Auth so they can sign in.', 'ok');
  } catch (e) {
    setCfgMsg('adminRosterMsg', e.message || String(e), 'err');
  }
}

async function removeAdminUser(email) {
  if (!confirm('Remove ' + email + " from the administrator list?\n\nThey lose dashboard access immediately. Their Supabase login still exists — delete it separately if they should not be able to sign in at all.")) return;
  try {
    await WamDb.removeAdmin(email);
    await buildAdminRoster();
    setCfgMsg('adminRosterMsg', 'Removed ' + email + '.', 'ok');
  } catch (e) {
    setCfgMsg('adminRosterMsg', e.message || String(e), 'err');
  }
}

// ── Divisions & scoring ──────────────────────────────────────

async function buildScoringPanel() {
  await Promise.all([buildScoreboard(), buildWriteIns(), buildDivisionList()]);
}

/**
 * Correct guesses per division, per Mystery Miler. A guess counts as correct when it
 * names the roster member the entry is linked to, so an entry with no link scores
 * nobody — that case is called out rather than silently reported as zero.
 */
async function buildScoreboard() {
  const wrap = document.getElementById('scoreboardWrap');
  if (!wrap) return;
  const rows = await WamDb.getDivisionScoreboard();
  if (rows.length === 0) {
    wrap.innerHTML = '<div class="empty-state"><span class="empty-state-icon">🗳</span><p>No guesses have been cast yet.</p></div>';
    return;
  }

  const byMystery = {};
  rows.forEach(function (r) {
    const key = r.mystery_id;
    byMystery[key] = byMystery[key] || { name: r.mystery_name, linked: r.mystery_linked, rows: [] };
    byMystery[key].rows.push(r);
  });

  // Division totals across the whole quarter, which is what gets announced.
  const overall = {};
  rows.forEach(function (r) {
    const d = r.division_name;
    overall[d] = overall[d] || { votes: 0, correct: 0 };
    overall[d].votes += Number(r.votes);
    overall[d].correct += Number(r.correct_votes);
  });
  const leaderboard = Object.keys(overall)
    .map(function (d) { return { division: d, votes: overall[d].votes, correct: overall[d].correct }; })
    .sort(function (a, b) { return b.correct - a.correct || b.votes - a.votes; });

  let html =
    '<div class="cfg-card"><h3>This quarter by division</h3>' +
    '<p class="cfg-sub">Every guess cast this quarter, and how many of them were right.</p>' +
    '<table class="sub-table"><thead><tr><th>Division</th><th>Correct</th><th>Guesses</th><th>Accuracy</th></tr></thead><tbody>' +
    leaderboard
      .map(function (l, i) {
        const pct = l.votes ? Math.round((l.correct / l.votes) * 100) : 0;
        return (
          '<tr><td class="td-name">' + (i === 0 && l.correct > 0 ? '🏆 ' : '') + esc(l.division) +
          '</td><td>' + l.correct + '</td><td>' + l.votes + '</td><td>' + pct + '%</td></tr>'
        );
      })
      .join('') +
    '</tbody></table></div>';

  Object.keys(byMystery).forEach(function (id) {
    const m = byMystery[id];
    const sorted = m.rows.slice().sort(function (a, b) {
      return Number(b.correct_votes) - Number(a.correct_votes) || Number(b.votes) - Number(a.votes);
    });
    html +=
      '<div class="cfg-card"><h3>' + esc(m.name) + '</h3>' +
      (m.linked
        ? '<p class="cfg-sub">Guesses for this Mystery Miler, by the voter\'s division.</p>'
        : '<div class="cfg-note" style="margin-bottom:14px;"><p>⚠️ This entry is not linked to anyone on the department roster, so no guess can be counted as correct. Open the entry on the Mystery Mile tab and use <em>Reveal</em> to set who it was, or add them to the roster.</p></div>') +
      '<table class="sub-table"><thead><tr><th>Division</th><th>Correct</th><th>Guesses</th></tr></thead><tbody>' +
      sorted
        .map(function (r) {
          return (
            '<tr><td class="td-name">' + esc(r.division_name) + '</td><td>' +
            r.correct_votes + '</td><td>' + r.votes + '</td></tr>'
          );
        })
        .join('') +
      '</tbody></table></div>';
  });

  wrap.innerHTML = html;
}

/** Names people typed that aren't on the roster, for the quarterly reconcile. */
async function buildWriteIns() {
  const wrap = document.getElementById('writeInWrap');
  if (!wrap) return;
  const rows = await WamDb.getWriteInVotes();
  if (rows.length === 0) {
    wrap.innerHTML = '<p class="cfg-sub">Nobody has written in a name that isn\'t on the roster.</p>';
    return;
  }
  wrap.innerHTML =
    '<table class="sub-table"><thead><tr><th>Typed name</th><th>Guesses</th><th>Status</th></tr></thead><tbody>' +
    rows
      .map(function (r) {
        const matched = r.suggested_member_id
          ? '<span class="chip chip-amber">Roster has ' + esc(r.suggested_member_name) + '</span>'
          : '<span class="chip chip-gray">Not on the roster</span>';
        return (
          '<tr><td class="td-name">' + esc(r.typed_name) + '</td><td>' + r.votes +
          '</td><td>' + matched + '</td></tr>'
        );
      })
      .join('') +
    '</tbody></table>';
}

async function buildDivisionList() {
  const wrap = document.getElementById('divisionWrap');
  if (!wrap) return;
  const divs = WamDb.getDivisions() || [];
  wrap.innerHTML =
    (divs.length === 0
      ? '<p class="cfg-sub">No divisions yet.</p>'
      : '<table class="sub-table"><thead><tr><th>Division</th><th>Actions</th></tr></thead><tbody>' +
        divs
          .map(function (d) {
            return (
              '<tr><td class="td-name">' + esc(d.name) + '</td><td><div class="td-actions">' +
              '<button class="action-pill ap-view" onclick="void renameDivision(\'' + esc(d.id) + '\',\'' + esc(d.name).replace(/'/g, "\\'") + '\')">✎ Rename</button>' +
              '<button class="action-pill ap-reject" onclick="void retireDivision(\'' + esc(d.id) + '\',\'' + esc(d.name).replace(/'/g, "\\'") + '\')">✕ Retire</button>' +
              '</div></td></tr>'
            );
          })
          .join('') +
        '</tbody></table>');
}

async function addDivision() {
  const input = document.getElementById('newDivisionName');
  const name = input ? input.value.trim() : '';
  if (!name) {
    setCfgMsg('divisionMsg', 'Type a division name first.', 'err');
    return;
  }
  try {
    await WamDb.addDivision(name);
    if (input) input.value = '';
    setCfgMsg('divisionMsg', 'Added ' + name + '.', 'ok');
    await WamDb.syncMystery();
    await buildDivisionList();
  } catch (e) {
    setCfgMsg('divisionMsg', e.message || String(e), 'err');
  }
}

async function renameDivision(id, current) {
  const name = prompt('Rename this division. Guesses already recorded against it keep counting.', current);
  if (!name || !name.trim() || name.trim() === current) return;
  try {
    await WamDb.renameDivision(id, name.trim());
    await WamDb.syncMystery();
    await buildDivisionList();
    setCfgMsg('divisionMsg', 'Renamed to ' + name.trim() + '.', 'ok');
  } catch (e) {
    setCfgMsg('divisionMsg', e.message || String(e), 'err');
  }
}

async function retireDivision(id, name) {
  if (!confirm('Retire ' + name + '?\n\nIt disappears from the voter\'s division picker. Guesses already cast against it are kept and still show on the scoreboard.')) {
    return;
  }
  try {
    await WamDb.retireDivision(id);
    await WamDb.syncMystery();
    await buildDivisionList();
    setCfgMsg('divisionMsg', 'Retired ' + name + '.', 'ok');
  } catch (e) {
    setCfgMsg('divisionMsg', e.message || String(e), 'err');
  }
}

function buildAdminTables() {
  const db = getDB();
  const pending = db.filter(function (s) {
    return s.status === 'pending';
  });
  const featured = db.filter(function (s) {
    return s.status === 'featured';
  });
  const mysteries = db.filter(function (s) {
    return s.type === 'myst';
  });

  document.getElementById('as-total').textContent = db.length;
  document.getElementById('as-pending').textContent = pending.length;
  document.getElementById('as-featured').textContent = featured.length;
  document.getElementById('as-conv').textContent = db.filter(function (s) {
    return s.type === 'conv';
  }).length;
  document.getElementById('as-myst').textContent = mysteries.length;
  document.getElementById('pendingBadge').textContent = pending.length;
  document.getElementById('featuredBadge').textContent = featured.length;
  document.getElementById('mystBadge').textContent = mysteries.length;

  buildSubTable('pendingTableWrap', pending, 'pending');
  buildSubTable('featuredTableWrap', featured, 'featured');
  buildSubTable('mystTableWrap', mysteries, 'myst');
  buildSubTable('allTableWrap', db, 'all');
  buildCampaignPanel();
}

function buildSubTable(containerId, items) {
  const wrap = document.getElementById(containerId);
  if (!wrap) return;
  if (items.length === 0) {
    wrap.innerHTML = '<div class="empty-state"><span class="empty-state-icon">📋</span><p>Nothing here yet.</p></div>';
    return;
  }
  const rows = items
    .map(function (s) {
      const date = new Date(s.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const typeBadge =
        s.type === 'conv'
          ? '<span class="chip chip-navy">Conventional</span>'
          : '<span class="chip chip-gold">Mystery</span>';
      // Mystery entries go public the moment they are submitted, so "Pending" would
      // read as "not live yet" and mislead. Their statuses get their own wording.
      const statusBadge =
        (s.type === 'myst'
          ? {
              pending: '<span class="chip chip-green">On display</span>',
              featured: '<span class="chip chip-green">On display</span>',
              archived: '<span class="chip chip-gray">Revealed</span>',
              rejected: '<span class="chip chip-red">Removed</span>',
            }
          : {
              pending: '<span class="chip chip-amber">Pending</span>',
              featured: '<span class="chip chip-green">Featured</span>',
              archived: '<span class="chip chip-gray">Archived</span>',
              rejected: '<span class="chip chip-red">Rejected</span>',
            })[s.status] || '';
      let actions = '';
      if (s.type === 'conv') {
        if (s.status !== 'featured') actions += '<button class="action-pill ap-feature" onclick="void updateStatus(\'' + s.id + '\',\'featured\')">⭐ Feature</button>';
        if (s.status !== 'archived') actions += '<button class="action-pill ap-archive" onclick="void updateStatus(\'' + s.id + '\',\'archived\')">📦 Archive</button>';
        if (s.status !== 'rejected') actions += '<button class="action-pill ap-reject" onclick="void updateStatus(\'' + s.id + '\',\'rejected\')">✕ Reject</button>';
      } else {
        if (s.status === 'rejected') {
          actions += '<button class="action-pill ap-feature" onclick="void restoreMystery(\'' + s.id + '\')">↩ Put back on display</button>';
        } else {
          if (s.status !== 'archived') actions += '<button class="action-pill ap-archive" onclick="void revealMystery(\'' + s.id + '\')">🎉 Reveal</button>';
          actions += '<button class="action-pill ap-reject" onclick="void removeMystery(\'' + s.id + '\')">✕ Remove</button>';
        }
      }
      actions += '<button class="action-pill ap-view" onclick="openAdminModal(\'' + s.id + '\')">👁 View</button>';
      return (
        '<tr>' +
        '<td class="td-name">' +
        (s.type === 'myst' ? '[Anonymous]' : s.name) +
        '</td>' +
        '<td>' +
        s.role +
        '</td>' +
        '<td><div class="td-theme">' +
        (s.theme || 'Mystery · Set #' + (s.promptSet || '?')) +
        '</div></td>' +
        '<td>' +
        typeBadge +
        ' ' +
        statusBadge +
        '</td>' +
        '<td style="font-family:\'DM Mono\',monospace;font-size:11px;color:var(--text-muted)">' +
        date +
        '</td>' +
        '<td><div class="td-actions">' +
        actions +
        '</div></td>' +
        '</tr>'
      );
    })
    .join('');
  wrap.innerHTML =
    '<table class="sub-table"><thead><tr><th>Name</th><th>Role</th><th>Theme</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead><tbody>' +
    rows +
    '</tbody></table>';
}

function openAdminModal(id) {
  const s = getDB().find(function (x) {
    return x.id === id;
  });
  if (!s) return;
  document.getElementById('mm-mile').textContent = 'Mile #' + (s.mileNumber || '—');
  document.getElementById('mm-name').textContent = s.name || '[Anonymous]';
  document.getElementById('mm-meta').textContent = s.role + ' · ' + (s.campus || '');
  document.getElementById('mm-theme').textContent = s.theme || '';
  const qa = document.getElementById('mm-qa');
  if (s.questions && s.answers) {
    qa.innerHTML = s.questions
      .map(function (q, i) {
        return (
          '<div class="modal-qa"><div class="modal-q">' +
          q +
          '</div><div class="modal-a">' +
          (s.answers[i] || '—') +
          '</div></div>'
        );
      })
      .join('');
  } else {
    qa.innerHTML = (s.answers || [])
      .map(function (a, i) {
        return (
          '<div class="modal-qa"><div class="modal-q">Question ' +
          (i + 1) +
          '</div><div class="modal-a">' +
          (a || '—') +
          '</div></div>'
        );
      })
      .join('');
  }
  document.getElementById('storyModal').classList.add('on');
}

function closeModal(e) {
  if (!e || e.target === document.getElementById('storyModal')) document.getElementById('storyModal').classList.remove('on');
}

async function adminSignIn() {
  const errEl = document.getElementById('adminAuthErr');
  if (errEl) errEl.textContent = '';
  const email = document.getElementById('adminEmailInp').value.trim();
  const password = document.getElementById('adminPassInp').value;
  try {
    await WamDb.signInAdmin(email, password);
    if (WamDb.isReady()) await WamDb.syncAll();
    refreshAdminFromServer();
  } catch (e) {
    if (errEl) errEl.textContent = e.message || String(e);
  }
}

async function adminSignOut() {
  await WamDb.signOutAdmin();
  if (WamDb.isReady()) await WamDb.syncAll();
  refreshAdminFromServer();
}

function refreshAdminFromServer() {
  if (WamDb.isReady()) {
    WamDb.syncAll()
      .then(function () {
        if (WamDb.isAdminUser()) buildAdminTables();
      })
      .catch(function (e) {
        console.error(e);
      });
  }
}

window.addEventListener('wam-db-refresh', function () {
  if (WamDb.isAdminUser()) buildAdminTables();
});

(async function bootAdmin() {
  await WamDb.init();
  try {
    if (WamDb.isReady()) {
      await WamDb.refreshAdminGate();
      await WamDb.syncAll();
    }
  } catch (e) {
    console.error(e);
  }
  WamDb.updateAdminPanels();
  if (WamDb.isAdminUser()) buildAdminTables();
})();
