/* Aetheron isolated first-time permission rejection QA. No signing or transaction APIs. */
(() => {
  'use strict';

  const expectedOrigin = 'https://wallet-qa.aetrs.com';
  const originLabel = document.getElementById('origin');
  const authorizedCount = document.getElementById('count');
  const status = document.getElementById('status');
  const outcome = document.getElementById('outcome');
  const requestButton = document.getElementById('request');
  const checkButton = document.getElementById('check');
  const revokeButton = document.getElementById('revoke');
  const diagnostic = document.getElementById('diagnostic');
  const events = [];
  let observedProvider = null;
  let requestAttempted = false;
  let lastPointerKind = 'unobserved';
  let clickCount = 0;
  requestButton.addEventListener('pointerdown', event => {
    lastPointerKind = ['touch','mouse','pen'].includes(event.pointerType) ? event.pointerType : 'other';
    record('request pointer', lastPointerKind + ' trusted=' + Boolean(event.isTrusted));
  });
  const record = (name, value) => {
    // Counts, numeric error codes and event names only. Never addresses.
    events.push(name + ': ' + String(value));
    if (events.length > 36) events.shift();
    diagnostic.textContent = events.join('\n');
  };
  const errorCode = error => {
    const raw = error && (error.rpcCode ?? error.code);
    return typeof raw === 'number' && Number.isFinite(raw) ? String(raw) :
      typeof raw === 'string' && /^-?[0-9]+$/.test(raw) ? raw : 'unknown';
  };
  const watchProvider = p => {
    if (observedProvider === p || typeof p.on !== 'function') return;
    observedProvider = p;
    p.on('accountsChanged', accounts => {
      record('accountsChanged count', Array.isArray(accounts) ? accounts.length : 'unknown');
    });
  };
  originLabel.textContent = location.origin;

  const validOrigin = location.origin === expectedOrigin;
  const provider = () => {
    if (!window.ethereum || typeof window.ethereum.request !== 'function') {
      throw new Error('MetaMask provider unavailable. Unlock MetaMask and retry.');
    }
    return window.ethereum;
  };
  const queryAccounts = async () => {
    const p = provider();
    watchProvider(p);
    const list = await p.request({ method: 'eth_accounts' });
    if (!Array.isArray(list)) throw new Error('Unexpected account response');
    authorizedCount.textContent = String(list.length);
    record('eth_accounts count', list.length);
    requestButton.disabled = !validOrigin || list.length !== 0 || requestAttempted;
    revokeButton.disabled = !validOrigin || list.length === 0;
    status.textContent = list.length === 0
      ? 'No account access is currently authorized for this origin.'
      : 'This origin already has account access. Do not claim a first-time rejection test.';
    return list.length;
  };

  if (!validOrigin) {
    authorizedCount.textContent = 'Not available';
    requestButton.disabled = true;
    checkButton.disabled = true;
    revokeButton.disabled = true;
    status.textContent = 'Wrong site origin. This QA control only runs on wallet-qa.aetrs.com.';
    return;
  }

  checkButton.addEventListener('click', async () => {
    try {
      await queryAccounts();
      outcome.textContent = 'Existing permission checked. No new access requested.';
    } catch (error) {
      status.textContent = String(error.message || error);
    }
  });

  revokeButton.addEventListener('click', async () => {
    requestAttempted = true;
    requestButton.disabled = true;
    revokeButton.disabled = true;
    outcome.textContent = 'Revoking account access for this QA hostname only.';
    try {
      await provider().request({ method: 'wallet_revokePermissions', params: [{eth_accounts:{}}] });
      record('wallet_revokePermissions', 'requested for eth_accounts');
      const count = await queryAccounts();
      if (count !== 0) {
        outcome.textContent = 'NOT VERIFIED: QA hostname still has account access.';
      } else {
        outcome.textContent = 'QA site disconnected. Zero authorized accounts.';
      }
    } catch (error) {
      record('revoke RPC error code', errorCode(error));
      outcome.textContent = 'QA revocation failed or is unsupported. Use MetaMask site permissions to disconnect this origin.';
    }
  });

  const revokeUnexpectedGrant = async (phase) => {
    record('unexpected grant mitigation', phase);
    try {
      await provider().request({ method: 'wallet_revokePermissions', params: [{eth_accounts:{}}] });
      record('mitigation revoke RPC', 'returned');
      const count = await queryAccounts();
      record('mitigation readback count', count);
      return count === 0;
    } catch (error) {
      record('mitigation error code', errorCode(error));
      return false;
    }
  };

  requestButton.addEventListener('click', async event => {
    clickCount += 1;
    record('request click', '#' + clickCount + ' trusted=' + Boolean(event?.isTrusted) + ' pointer=' + lastPointerKind);
    if (requestAttempted) {
      record('duplicate request blocked', clickCount);
      return;
    }
    requestAttempted = true; // One permission request per page load, no accidental second click.
    requestButton.disabled = true;
    record('before request count', authorizedCount.textContent);
    outcome.textContent = 'Waiting for MetaMask. Choose Cancel / Reject to test refusal.';
    let requestResult = 'pending';
    try {
      const list = await provider().request({ method: 'eth_requestAccounts' });
      requestResult = 'resolved count=' + (Array.isArray(list) ? list.length : 'unexpected');
      outcome.textContent = 'Account request resolved, not rejected. Rejection test NOT PASSED.';
    } catch (error) {
      requestResult = 'rejected code=' + errorCode(error);
      outcome.textContent = error && Number(error.code) === 4001
        ? 'PASS: MetaMask rejected account access (4001).'
        : 'Request ended with a non-4001 error. Rejection test NOT VERIFIED.';
    } finally {
      record('eth_requestAccounts promise', requestResult);
      try {
        const count = await queryAccounts();
        record('immediate post-request count', count);
        if (count !== 0) {
          outcome.textContent = 'NOT PASSED: MetaMask authorized an account after the connection request.';
          const revoked = await revokeUnexpectedGrant('immediate post-request');
          outcome.textContent = revoked
            ? 'NOT PASSED: Account access was unexpectedly granted, then automatically revoked for this QA site.'
            : 'NOT PASSED: Account authorized and automatic QA-only revocation was not confirmed. Disconnect this QA site manually.';
        } else if (outcome.textContent.startsWith('PASS:')) {
          outcome.textContent += ' Follow-up read confirms zero authorized accounts.';
        }
      } catch (error) {
        record('immediate read error code', errorCode(error));
        outcome.textContent += ' Follow-up account check could not be completed.';
      }
      // Catch delayed permission commits without any new access request.
      await new Promise(resolve => setTimeout(resolve, 1200));
      try {
        const delayed = await queryAccounts();
        record('1200ms post-request count', delayed);
        if (delayed !== 0) {
          const revoked = await revokeUnexpectedGrant('1200ms delayed read');
          outcome.textContent = revoked
            ? 'NOT PASSED: Delayed account access was automatically revoked for this QA site.'
            : 'NOT PASSED: Delayed QA-site account access remains. Use Disconnect this QA site.';
        }
      } catch (error) {
        record('delayed read error code', errorCode(error));
        if (outcome.textContent.startsWith('PASS:')) {
          outcome.textContent = 'NOT VERIFIED: delayed read-only authorization check failed.';
        }
      }
    }
  });

  const initial = async () => {
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        await queryAccounts();
        return;
      } catch (error) {
        if (attempt === 7) {
          status.textContent = 'MetaMask unavailable. Unlock MetaMask and tap Check existing access.';
          authorizedCount.textContent = 'Unavailable';
          return;
        }
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
  };
  initial();
})();
