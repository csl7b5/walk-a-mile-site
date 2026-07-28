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
  try {
    await WamDb.updateSubmissionDoc(id, { revealedName: name.trim() }, 'archived');
    await WamDb.syncAll();
    refreshAdminFromServer();
  } catch (e) {
    alert(e.message || String(e));
  }
}

function exportData() {
  const db = getDB();
  const csv = ['Type,Name,Role,Campus,Theme,Status,Date,...Answers'].concat(
    db.map(function (s) {
      return [s.type, s.name || 'Anonymous', s.role, s.campus, s.theme || 'Mystery', s.status, s.submittedAt, ...(s.answers || [])]
        .map(function (v) {
          return '"' + String(v || '').replace(/"/g, '""') + '"';
        })
        .join(',');
    })
  ).join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  a.download = 'walk-a-mile-submissions.csv';
  a.click();
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
    banner.textContent = 'Campaign settings are unavailable. Make sure the latest database migrations have been applied.';
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
  if (!s) return;
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
    setCfgMsg('cfgQuarterMsg', 'Saved. The voting ballot now covers ' + label + '.', 'ok');
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
      const statusBadge = {
        pending: '<span class="chip chip-amber">Pending</span>',
        featured: '<span class="chip chip-green">Featured</span>',
        archived: '<span class="chip chip-gray">Archived</span>',
        rejected: '<span class="chip chip-red">Rejected</span>',
      }[s.status] || '';
      let actions = '';
      if (s.type === 'conv') {
        if (s.status !== 'featured') actions += '<button class="action-pill ap-feature" onclick="void updateStatus(\'' + s.id + '\',\'featured\')">⭐ Feature</button>';
        if (s.status !== 'archived') actions += '<button class="action-pill ap-archive" onclick="void updateStatus(\'' + s.id + '\',\'archived\')">📦 Archive</button>';
        if (s.status !== 'rejected') actions += '<button class="action-pill ap-reject" onclick="void updateStatus(\'' + s.id + '\',\'rejected\')">✕ Reject</button>';
      } else {
        if (s.status !== 'featured')
          actions +=
            '<button class="action-pill ap-feature" onclick="void updateStatus(\'' + s.id + '\',\'featured\')">⭐ Set as the Live Mystery</button>';
        if (s.status !== 'archived') actions += '<button class="action-pill ap-archive" onclick="void revealMystery(\'' + s.id + '\')">🎉 Reveal</button>';
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
