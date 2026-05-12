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
  let votesView = { tally: {}, current_vote: null };
  let adminSessionOk = false;

  function logErr(...args) {
    console.error('[WamDb]', ...args);
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
      return 'vk_anon_' + String(Date.now());
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
        logErr('Missing window.WAM_SUPABASE (url + publishableKey or anonKey).');
        return;
      }
      if (!supa || typeof supa.createClient !== 'function') {
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

    getVotes() {
      return votesView;
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
      const email = session.user.email;
      const { data, error } = await client.from('app_admins').select('email').eq('email', email).maybeSingle();
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
        ['pendingTableWrap', 'featuredTableWrap', 'mystTableWrap', 'allTableWrap'].forEach(function (wid) {
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
        if (statEl) statEl.textContent = 'Walk a Mile could not connect. Check your site configuration.';
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
      if (statEl) statEl.textContent = '';

      if (!showDash) clearAdminDashboardDom();

      if (exBtn) exBtn.style.visibility = showDash ? 'visible' : 'hidden';
      if (inBtn) inBtn.disabled = showDash;
      if (outBtn) outBtn.style.display = showDash ? 'inline-flex' : 'none';
      if (emailEl && !showDash) emailEl.focus();
      if (passEl && showDash) passEl.value = '';
    },

    async signInAdmin(email, password) {
      if (!client) throw new Error('Database not initialized.');
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

    async syncAll() {
      if (!client) {
        submissions = [];
        votesView = { tally: {}, current_vote: null };
        return;
      }
      const { data, error } = await client
        .from('submissions')
        .select('*')
        .order('submitted_at', { ascending: false });
      if (error) throw error;
      submissions = (data || []).map(mapRow);
      await WamDb.syncVotesForActiveMystery();
    },

    async syncVotesForActiveMystery() {
      if (!client) {
        votesView = { tally: {}, current_vote: null };
        return;
      }
      const activeMyst = submissions.find(function (s) {
        return s.type === 'myst' && s.status === 'featured';
      });
      if (!activeMyst) {
        votesView = { tally: {}, current_vote: null };
        return;
      }
      const { data: rows, error } = await client
        .from('mystery_votes')
        .select('*')
        .eq('mystery_submission_id', activeMyst.id);
      if (error) {
        logErr('syncVotesForActiveMystery', error);
        votesView = { tally: {}, current_vote: null };
        return;
      }
      const tally = {};
      (rows || []).forEach(function (v) {
        const id = v.choice_submission_id;
        tally[id] = (tally[id] || 0) + 1;
      });
      const vk = getVoterKey();
      const mine = (rows || []).find(function (v) {
        return v.voter_key === vk;
      });
      votesView = {
        tally,
        current_vote: mine ? mine.choice_submission_id : null,
      };
    },

    async addSubmission(sub) {
      if (!client) throw new Error('Database not initialized.');
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

      const convCount = submissions.filter(function (s) {
        return s.type === 'conv';
      }).length;
      if (doc.type === 'conv') doc.mileNumber = convCount + 1;

      const insertPayload = {
        status: 'pending',
        doc,
      };

      const { data, error } = await client.from('submissions').insert(insertPayload).select('*').single();
      if (error) throw error;
      const mapped = mapRow(data);
      submissions.unshift(mapped);

      void WamDb.syncVotesForActiveMystery()
        .then(function () {
          fireRefresh();
        })
        .catch(function (e) {
          logErr('post-insert vote sync', e);
        });

      return mapped;
    },

    async updateStatus(id, status) {
      if (!client) throw new Error('Database not initialized.');
      const { error } = await client.from('submissions').update({ status: status }).eq('id', id);
      if (error) throw error;
      const local = submissions.find(function (s) {
        return s.id === id;
      });
      if (local) local.status = status;
    },

    async updateSubmissionDoc(id, patch, status) {
      if (!client) throw new Error('Database not initialized.');
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

    async castVote(choiceSubmissionId) {
      if (!client) throw new Error('Database not initialized.');
      const activeMyst = submissions.find(function (s) {
        return s.type === 'myst' && s.status === 'featured';
      });
      if (!activeMyst) throw new Error('No active Mystery Mile to vote on.');
      const vk = getVoterKey();
      const { error } = await client.from('mystery_votes').upsert(
        {
          mystery_submission_id: activeMyst.id,
          choice_submission_id: choiceSubmissionId,
          voter_key: vk,
        },
        { onConflict: 'mystery_submission_id,voter_key' }
      );
      if (error) throw error;
      await WamDb.syncVotesForActiveMystery();
    },
  };

  window.WamDb = WamDb;
})();
