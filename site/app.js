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
  const diagnostic = document.getElementById('diagnostic');
  const events = [];
  let observedProvider = null;
  const record = (name, value) => {
    // Counts, numeric error codes and event names only. Never addresses.
    events.push(name + ': ' + String(value));
    if (events.length > 18) events.shift();
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
    requestButton.disabled = !validOrigin || list.length !== 0;
    status.textContent = list.length === 0
      ? 'No account access is currently authorized for this origin.'
      : 'This origin already has account access. Do not claim a first-time rejection test.';
    return list.length;
  };

  if (!validOrigin) {
    authorizedCount.textContent = 'Not available';
    requestButton.disabled = true;
    checkButton.disabled = true;
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

  requestButton.addEventListener('click', async () => {
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
          outcome.textContent = 'NOT PASSED: One or more accounts are authorized for this origin.';
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
          outcome.textContent = 'NOT PASSED: One or more accounts are authorized for this origin.';
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
