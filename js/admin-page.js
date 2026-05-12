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
  const name = prompt('Who is the Mystery Miler? Enter their name for the reveal:');
  if (!name) return;
  if (!WamDb.isReady()) {
    alert('Walk a Mile could not update that right now. Try again in a moment.');
    return;
  }
  try {
    await WamDb.updateSubmissionDoc(id, { revealedName: name }, 'archived');
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
            '<button class="action-pill ap-feature" onclick="void updateStatus(\'' + s.id + '\',\'featured\')">⭐ Set as This Month\'s Mystery</button>';
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
