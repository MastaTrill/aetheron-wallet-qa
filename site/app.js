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
  originLabel.textContent = location.origin;

  const validOrigin = location.origin === expectedOrigin;
  const provider = () => {
    if (!window.ethereum || typeof window.ethereum.request !== 'function') {
      throw new Error('MetaMask provider unavailable. Unlock MetaMask and retry.');
    }
    return window.ethereum;
  };
  const queryAccounts = async () => {
    const list = await provider().request({ method: 'eth_accounts' });
    if (!Array.isArray(list)) throw new Error('Unexpected account response');
    authorizedCount.textContent = String(list.length);
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
    outcome.textContent = 'Waiting for MetaMask. Choose Cancel / Reject to test refusal.';
    try {
      const list = await provider().request({ method: 'eth_requestAccounts' });
      authorizedCount.textContent = String(Array.isArray(list) ? list.length : 0);
      outcome.textContent = 'Account access was granted, not rejected. Rejection test NOT PASSED.';
    } catch (error) {
      outcome.textContent = error && Number(error.code) === 4001
        ? 'PASS: MetaMask rejected account access (4001).'
        : 'Request ended with an error, but rejection is not verified: ' + String(error.message || error);
    } finally {
      try {
        const count = await queryAccounts();
        if (count !== 0) {
          outcome.textContent = 'NOT PASSED: One or more accounts are authorized for this origin.';
        } else if (outcome.textContent.startsWith('PASS:')) {
          outcome.textContent += ' Follow-up read confirms zero authorized accounts.';
        }
      } catch(error) {
        outcome.textContent += ' Follow-up account check could not be completed.';
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
