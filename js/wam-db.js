/**
 * Walk a Mile — Supabase data layer (global WamDb)
 * Expects: window.WAM_SUPABASE, window.supabase from CDN UMD build.
 * Set publishableKey (sb_publishable_...) or legacy anonKey — both work as createClient()'s api key.
 */
(function () {
  const VOTER_KEY = 'wam_voter_key_v1';
  const DOC_MAX_CLIENT = 590000;

  let client = null;
  let submissions = [];
  let settings = null;
  let activeMystery = null;
  let ballot = [];
  let votesView = { tally: {}, total: 0, current_vote: null };
  let adminSessionOk = false;
  let connectionError = null;

  function logErr(...args) {
    console.error('[WamDb]', ...args);
  }

  /**
   * A paused or unreachable Supabase project surfaces as a fetch failure rather
   * than a Postgres error, so it needs its own message — "check your connection"
   * sends people down the wrong path when the backend is simply asleep.
   */
  function describeConnectionFailure(err) {
    const msg = (err && (err.message || err.error_description)) || String(err || '');
    if (/failed to fetch|networkerror|load failed|fetch failed/i.test(msg)) {
      return 'Walk a Mile cannot reach its database right now. If the site has been quiet for a while the database may have paused — it usually wakes up within a minute. Please refresh.';
    }
    if (/JWT|api key|invalid.*key/i.test(msg)) {
      return 'Walk a Mile is misconfigured (database credentials were rejected). Please contact the campaign administrator.';
    }
    return msg || 'Walk a Mile could not reach its database.';
  }

  function noteFailure(err, context) {
    connectionError = describeConnectionFailure(err);
    logErr(context || 'request failed', err);
  }

  function mapRow(row) {
    if (!row) return null;
    const d = row.doc && typeof row.doc === 'object' ? row.doc : {};
    return {
      ...d,
      id: row.id,
      submittedAt: row.submitted_at,
      status: row.status,
    };
  }

  function mapSettings(row) {
    if (!row) return null;
    return {
      quarterLabel: row.quarter_label || '',
      quarterStartsAt: row.quarter_starts_at,
      quarterEndsAt: row.quarter_ends_at,
      submissionsOpen: !!row.submissions_open,
      votingOpen: !!row.voting_open,
      updatedAt: row.updated_at,
      updatedBy: row.updated_by || '',
    };
  }

  function getVoterKey() {
    try {
      let k = localStorage.getItem(VOTER_KEY);
      if (!k) {
        k =
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : 'vk_' + String(Date.now()) + '_' + Math.random().toString(36).slice(2);
        localStorage.setItem(VOTER_KEY, k);
      }
      return k;
    } catch {
      return 'vk_anon_' + String(Date.now()) + Math.random().toString(36).slice(2);
    }
  }

  function fireRefresh() {
    window.dispatchEvent(new CustomEvent('wam-db-refresh'));
  }

  function dataUrlToBlob(dataUrl) {
    const i = dataUrl.indexOf(',');
    if (i === -1) throw new Error('Invalid image data');
    const meta = dataUrl.slice(0, i);
    const b64 = dataUrl.slice(i + 1);
    const mime = meta.match(/data:([^;]+)/);
    const type = mime ? mime[1] : 'image/jpeg';
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let c = 0; c < binary.length; c++) bytes[c] = binary.charCodeAt(c);
    return new Blob([bytes], { type });
  }

  function extForMime(mime) {
    if (mime === 'image/png') return 'png';
    if (mime === 'image/webp') return 'webp';
    if (mime === 'image/gif') return 'gif';
    return 'jpg';
  }

  async function uploadPhotoDataUrl(dataUrl) {
    const blob = dataUrlToBlob(dataUrl);
    const path = crypto.randomUUID() + '.' + extForMime(blob.type || 'image/jpeg');
    const { error } = await client.storage.from('mile-photos').upload(path, blob, {
      contentType: blob.type || 'image/jpeg',
      upsert: true,
    });
    if (error) throw error;
    const { data } = client.storage.from('mile-photos').getPublicUrl(path);
    return data.publicUrl;
  }

  const WamDb = {
    async init() {
      const cfg = window.WAM_SUPABASE;
      const apiKey = cfg && (cfg.publishableKey || cfg.anonKey);
      const supa = window.supabase;
      if (!cfg || !cfg.url || !apiKey) {
        connectionError = 'Walk a Mile is missing its database configuration.';
        logErr('Missing window.WAM_SUPABASE (url + publishableKey or anonKey).');
        return;
      }
      if (!supa || typeof supa.createClient !== 'function') {
        connectionError = 'Walk a Mile could not load its database library.';
        logErr('Supabase JS client not loaded from CDN.');
        return;
      }
      client = supa.createClient(cfg.url, apiKey);
    },

    get client() {
      return client;
    },

    isReady() {
      return !!client;
    },

    getSubmissions() {
      return submissions;
    },

    getSettings() {
      return settings;
    },

    getActiveMystery() {
      return activeMystery;
    },

    getBallot() {
      return ballot;
    },

    getVotes() {
      return votesView;
    },

    getConnectionError() {
      return connectionError;
    },

    submissionsOpen() {
      return !!(settings && settings.submissionsOpen);
    },

    votingOpen() {
      return !!(settings && settings.votingOpen);
    },

    isAdminUser() {
      return adminSessionOk;
    },

    async refreshAdminGate() {
      adminSessionOk = false;
      if (!client) return false;
      const {
        data: { session },
      } = await client.auth.getSession();
      if (!session || !session.user || !session.user.email) return false;
      // Stored emails are normalized to lowercase by the migration, so match on that
      // rather than ilike — an underscore in an address is a wildcard to ilike.
      const email = String(session.user.email).toLowerCase();
      const { data, error } = await client
        .from('app_admins')
        .select('email')
        .eq('email', email)
        .maybeSingle();
      if (error || !data) return false;
      adminSessionOk = true;
      return true;
    },

    updateAdminPanels() {
      const box = document.getElementById('adminAuthBox');
      const dash = document.getElementById('adminDashboardBody');
      const shell = document.getElementById('adminLoginShell');
      const headerBar = document.getElementById('adminHeaderBar');
      const emailEl = document.getElementById('adminEmailInp');
      const passEl = document.getElementById('adminPassInp');
      const inBtn = document.getElementById('adminSignInBtn');
      const outBtn = document.getElementById('adminSignOutBtn');
      const statEl = document.getElementById('adminAuthStatus');
      const exBtn = document.getElementById('adminExportBtn');
      if (!box) return;

      function clearAdminDashboardDom() {
        ['pendingTableWrap', 'featuredTableWrap', 'mystTableWrap', 'allTableWrap', 'adminRosterWrap'].forEach(function (wid) {
          const w = document.getElementById(wid);
          if (w) w.innerHTML = '';
        });
        ['as-total', 'as-pending', 'as-featured', 'as-conv', 'as-myst', 'pendingBadge', 'featuredBadge', 'mystBadge'].forEach(
          function (id) {
            const el = document.getElementById(id);
            if (el) el.textContent = '0';
          }
        );
      }

      if (!client) {
        if (headerBar) headerBar.classList.remove('admin-header-visible');
        const pageAdmin0 = document.getElementById('page-admin');
        if (pageAdmin0) pageAdmin0.classList.remove('admin-logged-in');
        box.style.display = 'flex';
        if (shell) shell.style.display = 'flex';
        if (dash) {
          dash.hidden = true;
          dash.classList.remove('admin-dashboard-visible');
        }
        if (statEl) statEl.textContent = connectionError || 'Walk a Mile could not connect. Check your site configuration.';
        if (exBtn) exBtn.style.visibility = 'hidden';
        if (inBtn) inBtn.disabled = true;
        if (outBtn) outBtn.style.display = 'none';
        clearAdminDashboardDom();
        return;
      }

      const showDash = adminSessionOk;
      const pageAdmin = document.getElementById('page-admin');
      if (pageAdmin) {
        if (showDash) pageAdmin.classList.add('admin-logged-in');
        else pageAdmin.classList.remove('admin-logged-in');
      }
      if (headerBar) {
        if (showDash) headerBar.classList.add('admin-header-visible');
        else headerBar.classList.remove('admin-header-visible');
      }
      box.style.display = 'flex';
      if (shell) shell.style.display = showDash ? 'none' : 'flex';
      if (dash) {
        dash.hidden = !showDash;
        if (showDash) dash.classList.add('admin-dashboard-visible');
        else dash.classList.remove('admin-dashboard-visible');
      }
      if (statEl) statEl.textContent = showDash ? '' : connectionError || '';

      if (!showDash) clearAdminDashboardDom();

      if (exBtn) exBtn.style.visibility = showDash ? 'visible' : 'hidden';
      if (inBtn) inBtn.disabled = showDash;
      if (outBtn) outBtn.style.display = showDash ? 'inline-flex' : 'none';
      if (emailEl && !showDash) emailEl.focus();
      if (passEl && showDash) passEl.value = '';
    },

    async signInAdmin(email, password) {
      if (!client) throw new Error(connectionError || 'Database not initialized.');
      const ae = document.getElementById('adminAuthErr');
      if (ae) ae.textContent = '';
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const ok = await WamDb.refreshAdminGate();
      if (!ok) {
        await client.auth.signOut();
        throw new Error('This account is not authorized for admin access.');
      }
      WamDb.updateAdminPanels();
    },

    async signOutAdmin() {
      if (!client) return;
      await client.auth.signOut();
      adminSessionOk = false;
      WamDb.updateAdminPanels();
    },

    async currentAdminEmail() {
      if (!client) return '';
      const {
        data: { session },
      } = await client.auth.getSession();
      return (session && session.user && session.user.email) || '';
    },

    // ── Campaign settings ──────────────────────────────────

    async syncSettings() {
      if (!client) return null;
      const { data, error } = await client.from('campaign_settings').select('*').eq('id', 1).maybeSingle();
      if (error) throw error;
      settings = mapSettings(data);
      return settings;
    },

    async updateSettings(patch) {
      if (!client) throw new Error(connectionError || 'Database not initialized.');
      const row = {};
      if (patch.quarterLabel !== undefined) row.quarter_label = patch.quarterLabel;
      if (patch.quarterStartsAt !== undefined) row.quarter_starts_at = patch.quarterStartsAt;
      if (patch.quarterEndsAt !== undefined) row.quarter_ends_at = patch.quarterEndsAt;
      if (patch.submissionsOpen !== undefined) row.submissions_open = !!patch.submissionsOpen;
      if (patch.votingOpen !== undefined) row.voting_open = !!patch.votingOpen;
      const { data, error } = await client.from('campaign_settings').update(row).eq('id', 1).select('*').maybeSingle();
      if (error) throw error;
      settings = mapSettings(data);
      return settings;
    },

    // ── Admin roster ───────────────────────────────────────

    async listAdmins() {
      if (!client) throw new Error(connectionError || 'Database not initialized.');
      const { data, error } = await client.from('app_admins').select('*').order('email');
      if (error) throw error;
      return data || [];
    },

    async addAdmin(email, displayName) {
      if (!client) throw new Error(connectionError || 'Database not initialized.');
      const clean = String(email || '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw new Error('Enter a valid email address.');
      const { error } = await client
        .from('app_admins')
        .insert({ email: clean, display_name: String(displayName || '').trim() || null, added_by: await WamDb.currentAdminEmail() });
      if (error) {
        if (error.code === '23505') throw new Error('That email is already an administrator.');
        throw error;
      }
    },

    async removeAdmin(email) {
      if (!client) throw new Error(connectionError || 'Database not initialized.');
      const { error } = await client.from('app_admins').delete().eq('email', String(email || '').trim().toLowerCase());
      if (error) throw error;
    },

    // ── Sync ───────────────────────────────────────────────

    async syncAll() {
      if (!client) {
        submissions = [];
        settings = null;
        activeMystery = null;
        ballot = [];
        votesView = { tally: {}, total: 0, current_vote: null };
        return;
      }

      try {
        const { data, error } = await client
          .from('submissions')
          .select('*')
          .order('submitted_at', { ascending: false });
        if (error) throw error;
        submissions = (data || []).map(mapRow);
        connectionError = null;
      } catch (e) {
        noteFailure(e, 'syncAll/submissions');
        throw e;
      }

      // Settings and the mystery views are non-fatal: a failure here should not
      // blank the archive that already loaded.
      try {
        await WamDb.syncSettings();
      } catch (e) {
        logErr('syncAll/settings', e);
      }
      try {
        await WamDb.syncMystery();
      } catch (e) {
        logErr('syncAll/mystery', e);
      }
    },

    async syncMystery() {
      if (!client) {
        activeMystery = null;
        ballot = [];
        votesView = { tally: {}, total: 0, current_vote: null };
        return;
      }

      const { data: mystRows, error: mystErr } = await client.rpc('get_active_mystery');
      if (mystErr) throw mystErr;
      const m = Array.isArray(mystRows) ? mystRows[0] : mystRows;
      activeMystery = m
        ? {
            ref: m.ref,
            promptSet: m.prompt_set,
            promptQuestions: m.prompt_questions || [],
            answers: m.answers || [],
            photo: m.photo || null,
            submittedAt: m.submitted_at,
          }
        : null;

      const { data: ballotRows, error: ballotErr } = await client.rpc('get_mystery_ballot');
      if (ballotErr) throw ballotErr;
      ballot = ballotRows || [];

      await WamDb.syncVotesForActiveMystery();
    },

    async syncVotesForActiveMystery() {
      if (!client || !activeMystery) {
        votesView = { tally: {}, total: 0, current_vote: null };
        return;
      }
      const { data, error } = await client.rpc('get_mystery_votes', {
        p_ref: activeMystery.ref,
        p_voter_key: getVoterKey(),
      });
      if (error) {
        logErr('syncVotesForActiveMystery', error);
        votesView = { tally: {}, total: 0, current_vote: null };
        return;
      }
      votesView = {
        tally: (data && data.tally) || {},
        total: (data && data.total) || 0,
        current_vote: (data && data.current_vote) || null,
      };
    },

    // ── Submissions ────────────────────────────────────────

    async addSubmission(sub) {
      if (!client) throw new Error(connectionError || 'Database not initialized.');
      if (!WamDb.submissionsOpen()) {
        throw new Error('Submissions are closed right now. Watch for the next round to open.');
      }
      const doc = Object.assign({}, sub);
      let photoData = null;
      if (doc.type === 'myst' && doc.photo && String(doc.photo).startsWith('data:')) {
        photoData = doc.photo;
        delete doc.photo;
      }
      const serialized = JSON.stringify(doc);
      if (serialized.length > DOC_MAX_CLIENT) {
        throw new Error('Your story is too large to submit. Please shorten text or use a smaller photo.');
      }

      if (photoData) {
        doc.photo = await uploadPhotoDataUrl(photoData);
      }

      // Mile numbers are assigned by a database trigger so concurrent submissions
      // cannot collide.
      const insertPayload = {
        status: 'pending',
        doc,
      };

      const { data, error } = await client.from('submissions').insert(insertPayload).select('*').single();
      if (error) {
        // RLS rejects inserts while the submission window is closed.
        if (error.code === '42501') {
          throw new Error('Submissions are closed right now. Watch for the next round to open.');
        }
        throw error;
      }
      const mapped = mapRow(data);
      submissions.unshift(mapped);

      void WamDb.syncMystery()
        .then(function () {
          fireRefresh();
        })
        .catch(function (e) {
          logErr('post-insert mystery sync', e);
        });

      return mapped;
    },

    async updateStatus(id, status) {
      if (!client) throw new Error(connectionError || 'Database not initialized.');
      const { error } = await client.from('submissions').update({ status: status }).eq('id', id);
      if (error) throw error;
      const local = submissions.find(function (s) {
        return s.id === id;
      });
      if (local) local.status = status;
    },

    async updateSubmissionDoc(id, patch, status) {
      if (!client) throw new Error(connectionError || 'Database not initialized.');
      const { data: row, error: fetchErr } = await client.from('submissions').select('*').eq('id', id).single();
      if (fetchErr) throw fetchErr;
      const nextDoc = Object.assign({}, row.doc || {}, patch);
      const upd = { doc: nextDoc };
      if (status !== undefined) upd.status = status;
      const { error } = await client.from('submissions').update(upd).eq('id', id);
      if (error) throw error;
      const local = submissions.find(function (s) {
        return s.id === id;
      });
      if (local) {
        Object.assign(local, patch);
        if (status !== undefined) local.status = status;
      }
    },

    // ── Voting ─────────────────────────────────────────────

    async castVote(choiceSubmissionId) {
      if (!client) throw new Error(connectionError || 'Database not initialized.');
      if (!activeMystery) throw new Error('There is no active Mystery Mile to vote on.');
      const { data, error } = await client.rpc('cast_mystery_vote', {
        p_ref: activeMystery.ref,
        p_choice: choiceSubmissionId,
        p_voter_key: getVoterKey(),
      });
      if (error) throw new Error(error.message || 'Your vote could not be recorded.');
      votesView = {
        tally: (data && data.tally) || {},
        total: (data && data.total) || 0,
        current_vote: (data && data.current_vote) || null,
      };
    },

    /** Admin-only: resolve a ballot entry id to its display name for the reveal. */
    ballotNameFor(id) {
      const hit = (ballot || []).find(function (b) {
        return b.id === id;
      });
      return hit ? hit.name : null;
    },
  };

  window.WamDb = WamDb;
})();
