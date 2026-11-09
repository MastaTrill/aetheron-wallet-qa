import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('./site/app.js', import.meta.url), 'utf8');
const flush = async () => { for (let i=0;i<8;i++) await new Promise(resolve => setImmediate(resolve)); };

async function scenario({origin='https://wallet-qa.aetrs.com', priorAccounts=[], response='reject'}) {
  const nodes = {};
  for (const id of ['origin','count','status','outcome','request','check']) {
    nodes[id] = { textContent:'', disabled:id==='request', handlers:{},
      addEventListener(kind, fn){ this.handlers[kind]=fn; } };
  }
  let accounts=[...priorAccounts];
  const calls=[];
  const request = async ({method}) => {
    calls.push(method);
    if (method === 'eth_accounts') return [...accounts];
    if (method === 'eth_requestAccounts') {
      if (response === 'reject') throw Object.assign(new Error('User rejected the request'),{code:4001});
      if (response === 'other-error') throw Object.assign(new Error('Request failed'),{code:-32000});
      accounts=['0x0000000000000000000000000000000000000001'];
      return [...accounts];
    }
    throw new Error('Unexpected wallet method: '+method);
  };
  const context={document:{getElementById:id=>nodes[id]},location:{origin},
    window:{ethereum:{request}},setTimeout:fn=>{fn();return 1;}};
  vm.runInNewContext(source,context,{filename:'site/app.js'});
  await flush();
  return {nodes,calls,accounts:()=>accounts,flush};
}

const denied=await scenario({});
assert.equal(denied.nodes.count.textContent,'0');
assert.equal(denied.nodes.request.disabled,false,'The explicit request button must be enabled only for unauthorised origin');
assert.match(denied.nodes.status.textContent,/No account access/);
await denied.nodes.request.handlers.click();
await denied.flush();
assert.match(denied.nodes.outcome.textContent,/PASS: MetaMask rejected account access \(4001\)/);
assert.match(denied.nodes.outcome.textContent,/zero authorized accounts/);
assert.deepEqual(denied.calls,['eth_accounts','eth_requestAccounts','eth_accounts']);
assert.equal(denied.nodes.request.disabled,false,'Rejection preserves a usable retry button');

const existing=await scenario({priorAccounts:['0x0000000000000000000000000000000000000001']});
assert.equal(existing.nodes.count.textContent,'1');
assert.equal(existing.nodes.request.disabled,true);
assert.match(existing.nodes.status.textContent,/already has account access/);
assert.deepEqual(existing.calls,['eth_accounts'],'Existing permission must not trigger another request');

const wrongOrigin=await scenario({origin:'https://untrusted.example'});
assert.equal(wrongOrigin.nodes.request.disabled,true);
assert.equal(wrongOrigin.nodes.check.disabled,true);
assert.deepEqual(wrongOrigin.calls,[]);
assert.match(wrongOrigin.nodes.status.textContent,/Wrong site origin/);

const genericError=await scenario({response:'other-error'});
await genericError.nodes.request.handlers.click();
await genericError.flush();
assert.doesNotMatch(genericError.nodes.outcome.textContent,/^PASS:/);
assert.equal(genericError.nodes.count.textContent,'0');

const granted=await scenario({response:'approve'});
await granted.nodes.request.handlers.click();
await granted.flush();
assert.match(granted.nodes.outcome.textContent,/NOT PASSED/);
assert.equal(granted.nodes.count.textContent,'1');

console.log('PASS: declined 4001 stays at zero accounts; existing authorization, wrong origin and non-rejection errors fail closed. No real wallet used.');
