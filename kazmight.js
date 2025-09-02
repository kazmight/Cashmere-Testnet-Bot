import 'dotenv/config';
import axios from 'axios';
import { ethers } from 'ethers';
import blessed from 'blessed';
import CryptoBotUI from './CryptoBotUI.js';

const ui = new CryptoBotUI({
  title: 'Cashmere CCTP Dashboard',
  mirrorConsole: false,
  menuItems: [
    '1) Sepolia ? L2 (Optimism / Arbitrum / Base / Unichain)',
    '2) L2 ? Sepolia',
    '3) Random Destination',
    '4) Exit'
  ]
});


const TAG_TO_TYPE = {
  SEND:      'bridge',    
  INFO:      'info',      
  GAS:       'gas',       
  PENDING:   'pending',   
  SUCCESS:   'success',   
  ERROR:     'error',     
  FAILED:    'failed',    
  WARNING:   'warning',   
  DONE:      'completed', 
};


const BR = (tag, msg) => {
  ui.log(TAG_TO_TYPE[tag] || 'info', String(msg));
};


const LOG = {
  send:    (m) => BR('SEND', m),
  info:    (m) => BR('INFO', m),
  gas:     (m) => BR('GAS', m),
  pending: (m) => BR('PENDING', m),
  success: (m) => BR('SUCCESS', m),
  error:   (m) => BR('ERROR', m),
  warn:    (m) => BR('WARNING', m),
  done:    (m) => BR('DONE', m),
};
;


const CHAINS = {
  sepolia: {
    label: "Ethereum Sepolia",
    chainId: 11155111,
    domain: 0,
    rpc: "https://eth-sepolia.public.blastapi.io",
    usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    bridge: "0xC42f6bcb48aFf823a7252e244FE499CF726b4Fa0",
    explorerTx: "https://sepolia.etherscan.io/tx/",
    nativeSymbol: "ETH"
  },
  optimism: {
    label: "Optimism Sepolia",
    chainId: 11155420,
    domain: 2,
    rpc: "https://optimism-sepolia.drpc.org",
    usdc: "0x5fd84259d66Cd46123540766Be93DFE6D43130D7",
    bridge: "0xf2474BdFDC5567c54dA34c499ef41E49c680Af73",
    explorerTx: "https://sepolia-optimistic.etherscan.io/tx/",
    nativeSymbol: "ETH"
  },
  arbitrum: {
    label: "Arbitrum Sepolia",
    chainId: 421614,
    domain: 3,
    rpc: "https://arbitrum-sepolia.drpc.org",
    usdc: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
    bridge: "0xf2474BdFDC5567c54dA34c499ef41E49c680Af73",
    explorerTx: "https://sepolia.arbiscan.io/tx/",
    nativeSymbol: "ETH"
  },
  base: {
    label: "Base Sepolia",
    chainId: 84532,
    domain: 6,
    rpc: "https://base-sepolia.drpc.org",
    usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    bridge: "0xf2474BdFDC5567c54dA34c499ef41E49c680Af73",
    explorerTx: "https://sepolia.basescan.org/tx/",
    nativeSymbol: "ETH"
  },
  unichain: {
    label: "Unichain Sepolia",
    chainId: 1301,
    domain: 10,
    rpc: "https://unichain-sepolia.drpc.org",
    usdc: "0x31d0220469e10c4E71834a79b1f276d740d3768F",
    bridge: "0x89f29A29c43F2817502E3DEEc5dF37D545865E32",
    explorerTx: "https://sepolia.uniscan.xyz/tx/",
    nativeSymbol: "ETH"
  },
};
const L2_KEYS = ["optimism", "arbitrum", "base", "unichain"];


const STATIC_FEE_USDC = "0.1";
const DEFAULT_FINALITY = 1000;
const DEFAULT_HOOKDATA = "0x00";
const PERMIT_DEADLINE_BUFFER_SEC = 6000;
const USDC_DECIMALS = 6;
const IS_NATIVE = true;

const toUSDC   = (x) => ethers.parseUnits(String(x), USDC_DECIMALS);
const fromUSDC = (bn) => ethers.formatUnits(bn ?? 0n, USDC_DECIMALS);
const pad32    = (addr) => ethers.zeroPadValue(addr, 32);
const gweiToWei = (g) => BigInt(Math.floor(Number(g))) * 10n ** 9n;
const weiToEth  = (w) => ethers.formatEther(w ?? 0n);

if (!process.env.PRIVATE_KEY) {
  BR('ERROR', 'PRIVATE_KEY missing in .env');
  process.exit(1);
}


const BRIDGE_ABI = [
  {
    inputs: [
      {
        components: [
          { type: "uint256", name: "amount" },
          { type: "uint256", name: "maxFee" },
          { type: "uint64",  name: "fee" },
          { type: "uint64",  name: "deadline" },
          { type: "uint64",  name: "gasDropAmount" },
          { type: "uint32",  name: "destinationDomain" },
          { type: "uint32",  name: "minFinalityThreshold" },
          { type: "bytes32", name: "recipient" },
          { type: "bytes32", name: "solanaOwner" },
          { type: "bool",    name: "isNative" },
          { type: "bytes",   name: "hookData" },
          { type: "bytes",   name: "signature" },
        ],
        name: "_params",
        type: "tuple",
      },
      {
        components: [
          { type: "uint256", name: "value" },
          { type: "uint256", name: "deadline" },
          { type: "bytes",   name: "signature" },
        ],
        name: "_permitParams",
        type: "tuple",
      },
    ],
    name: "transferV2WithPermit",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  { inputs: [{type:"uint256",name:"amount"},{type:"uint256",name:"staticFee"}], name:"getFee", outputs:[{type:"uint256"}], stateMutability:"view", type:"function" },
  {
    inputs: [],
    name: "state",
    outputs: [
      { type: "address", name: "signer" },
      { type: "uint32",  name: "nonce" },
      { type: "uint32",  name: "maxUSDCGasDrop" },
      { type: "uint16",  name: "feeBP" },
      { type: "bool",    name: "reentrancyLock" },
      { type: "bool",    name: "paused" },
      { type: "uint128", name: "maxNativeGasDrop" },
      { type: "uint128", name: "lastFeeWithdrawTimestamp" },
    ],
    stateMutability: "view",
    type: "function",
  },
];
const USDC_ABI = [
  { inputs: [], name: "name", outputs: [{ type: "string" }], stateMutability: "view", type: "function" },
  { inputs: [{ type: "address", name: "" }], name: "nonces", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [{ type: "address", name: "account" }], name: "balanceOf", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
];


function makeSigner(rpc) {
  const p = new ethers.JsonRpcProvider(rpc);
  return { provider: p, signer: new ethers.Wallet(process.env.PRIVATE_KEY, p) };
}
const PER_CHAIN = {};
for (const key of Object.keys(CHAINS)) {
  PER_CHAIN[key] = makeSigner(CHAINS[key].rpc);
}


const quoteUrl = (localDomain, destinationDomain) =>
  `https://gas.cashmere.exchange/getEcdsaSig_native?localDomain=${localDomain}&destinationDomain=${destinationDomain}&isNative=true&isV2=true`;
const feeUrl = (localDomain, destinationDomain) =>
  `https://app.cashmere.exchange/.netlify/functions/get-burn-fees?localDomain=${localDomain}&destinationDomain=${destinationDomain}&threshold=${DEFAULT_FINALITY}`;

async function safeGetJson(url) {
  const { data } = await axios.get(url, { timeout: 20000 });
  return data;
}
async function getRouteQuoteFull(localDomain, destinationDomain) {
  const q = await safeGetJson(quoteUrl(localDomain, destinationDomain));
  if (!q?.signature) throw new Error("Quote: signature not found");

  let feeU64    = q?.feeU64 ?? q?.fee ?? null;
  let minFinal  = q?.minFinalityThreshold ?? q?.minFinality ?? DEFAULT_FINALITY;
  let hookData  = q?.hookData ?? DEFAULT_HOOKDATA;
  let deadlineR = q?.deadline ?? q?.expireAt ?? q?.expiry ?? q?.expiration ?? q?.params?.deadline ?? null;
  if (deadlineR == null) throw new Error("Quote: route deadline not found.");

  if (feeU64 == null) {
    const f = await safeGetJson(feeUrl(localDomain, destinationDomain));
    feeU64 = f?.feeU64 ?? f?.burnFee ?? f?.nativeFee ?? f?.fee ?? null;
  }
  if (feeU64 == null) throw new Error("Cannot determine feeU64 from quote/burn-fees.");

  return {
    signature: String(q.signature),
    feeU64: BigInt(String(feeU64)),      
    minFinalityThreshold: Number(minFinal),
    hookData: String(hookData),
    routeDeadline: Number(deadlineR),    
  };
}


async function signPermitOnChain({ chainKey, owner, spender, amount, deadline }) {
  const { signer } = PER_CHAIN[chainKey];
  const usdcAddr = CHAINS[chainKey].usdc;
  const usdc = new ethers.Contract(usdcAddr, USDC_ABI, signer);
  const tokenName = await usdc.name();
  const nonce = await usdc.nonces(owner);
  const net = await signer.provider.getNetwork();

  const mkDomain = (version) => ({
    name: tokenName, version, chainId: Number(net.chainId), verifyingContract: usdcAddr,
  });
  const types = {
    Permit: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  };
  const message = { owner, spender, value: amount, nonce, deadline };

  try {
    const sig = await signer.signTypedData(mkDomain("2"), types, message);
    return { sig, nonce, version: "2" };
  } catch {
    const sig = await signer.signTypedData(mkDomain("1"), types, message);
    return { sig, nonce, version: "1" };
  }
}


async function readMaxNativeGasDrop(chainKey) {
  const { provider } = PER_CHAIN[chainKey];
  const bridge = new ethers.Contract(CHAINS[chainKey].bridge, BRIDGE_ABI, provider);
  const s = await bridge.state();
  return BigInt(s.maxNativeGasDrop.toString());
}
async function usdcBalance(chainKey, address) {
  const provider = PER_CHAIN[chainKey].provider;
  const usdcAddr = CHAINS[chainKey].usdc;
  const usdc = new ethers.Contract(usdcAddr, USDC_ABI, provider);
  return await usdc.balanceOf(address);
}
function sampleRandom(arr, k) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.max(0, Math.min(k, copy.length)));
}
function parseCsvSelection(s, validKeys) {
  const x = (s || "").trim().toLowerCase();
  if (x === "all") return [...validKeys];
  if (x === "random") return ["__RANDOM__"];
  const parts = x.split(",").map(v => v.trim()).filter(Boolean);
  const filtered = parts.filter(p => validKeys.includes(p));
  if (filtered.length === 0) throw new Error("Empty/invalid selection.");
  return [...new Set(filtered)];
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));


async function uiAsk(label, initial = '') {
  return new Promise((resolve) => {
    const prompt = blessed.prompt({
      parent: ui.screen,
      border: 'line',
      keys: true,
      tags: true,
      mouse: true,
      width: '60%',
      height: 7,
      top: 'center',
      left: 'center',
      label: ' Input ',
      style: {
        border: { fg: ui.opts.colors.primary },
        fg: ui.opts.colors.text,
        bg: ui.opts.colors.background
      }
    });
    prompt.readInput(label + ' ', initial, (err, value) => {
      try { prompt.destroy(); } catch(_) {}
      ui.render();
      resolve((value ?? '').trim());
    });
    ui.render();
  });
}


async function refreshWalletAndTokens() {
  const addr = (await PER_CHAIN.sepolia.signer.getAddress());
  const gasData = await PER_CHAIN.sepolia.provider.getFeeData();
  const gasGwei = gasData.gasPrice ? Number(gasData.gasPrice) / 1e9 : 0;
  const nonce = await PER_CHAIN.sepolia.provider.getTransactionCount(addr);

  const nativeBalWei = await PER_CHAIN.sepolia.provider.getBalance(addr);
  ui.setNativeSymbol(CHAINS.sepolia.nativeSymbol);
  ui.updateWallet({
    address: addr,
    nativeBalance: `${ethers.formatEther(nativeBalWei)} ${CHAINS.sepolia.nativeSymbol}`,
    network: CHAINS.sepolia.label,
    gasPrice: `${gasGwei.toFixed(2)} Gwei`,
    nonce
  });
  ui.updateStats({ currentGasPrice: gasGwei });

  const tokenRows = [];
  for (const key of ["sepolia", ...L2_KEYS]) {
    try {
      const bal = await usdcBalance(key, addr);
      tokenRows.push({ enabled: true, name: CHAINS[key].label, symbol: 'USDC', balance: fromUSDC(bal) });
    } catch {
      tokenRows.push({ enabled: true, name: CHAINS[key].label, symbol: 'USDC', balance: '-' });
    }
  }
  ui.setTokens(tokenRows);
}


async function sendOnce({ sourceKey, destKey, amountUser, recipient, delaySec, gasDropWei }) {
  const source = CHAINS[sourceKey];
  const dest = CHAINS[destKey];
  const { signer } = PER_CHAIN[sourceKey];
  const sender = (await signer.getAddress()).toLowerCase();
  const toAddr = (recipient || sender).toLowerCase();

  const amount = toUSDC(amountUser);
  const staticFee = toUSDC(STATIC_FEE_USDC);

  BR('SEND', `from ${source.label} to ${dest.label}`);
  BR('INFO', `amount ${amountUser} USDC to ${toAddr}`);

  
  const beforeSrc = await usdcBalance(sourceKey, sender);
  const beforeDst = await usdcBalance(destKey, toAddr);
  BR('INFO', `${source.label} balance before: ${fromUSDC(beforeSrc)} USDC`);
  BR('INFO', `${dest.label} balance before : ${fromUSDC(beforeDst)} USDC`);

  
  const quote = await getRouteQuoteFull(source.domain, dest.domain);
  const feeNative = quote.feeU64;
  const txValueWei = feeNative + BigInt(gasDropWei ?? 0n);
  BR('GAS', `fee(native) ${weiToEth(feeNative)} ${source.nativeSymbol} | gasDrop ${weiToEth(gasDropWei)} ${source.nativeSymbol} | msg.value ${weiToEth(txValueWei)} ${source.nativeSymbol}`);

  
  const permitDeadline = quote.routeDeadline + PERMIT_DEADLINE_BUFFER_SEC;
  const { sig: permitSig } = await signPermitOnChain({
    chainKey: sourceKey, owner: sender, spender: source.bridge, amount, deadline: permitDeadline,
  });

  
  const bridge = new ethers.Contract(source.bridge, BRIDGE_ABI, signer);
  const maxFee = await bridge.getFee(amount, staticFee);

  const params = {
    amount,
    maxFee,
    fee: quote.feeU64,
    deadline: quote.routeDeadline,
    gasDropAmount: BigInt(gasDropWei ?? 0n),
    destinationDomain: dest.domain,
    minFinalityThreshold: Number(quote.minFinalityThreshold),
    recipient: pad32(toAddr),
    solanaOwner: ethers.ZeroHash,
    isNative: IS_NATIVE,
    hookData: quote.hookData,
    signature: quote.signature,
  };
  const permitParams = { value: amount, deadline: permitDeadline, signature: permitSig };

  
  try {
    await (await bridge.getFunction("transferV2WithPermit")).staticCall(params, permitParams, { value: txValueWei });
  } catch (e) {
    throw new Error(`staticCall failed: ${e?.shortMessage || e?.reason || e?.message || String(e)}`);
  }

  
  const stopTimer = ui.startTimer('Waiting confirmation');
  ui.updateStats({ pendingTx: (ui.pendingTx || 0) + 1 });
  const tx = await bridge.transferV2WithPermit(params, permitParams, { value: txValueWei });
  const txHash = tx.hash;
  BR('PENDING', `tx ${txHash}`);
  BR('INFO', `${source.explorerTx}${txHash}`);

  const rc = await tx.wait();
  stopTimer();
  ui.updateStats({
    pendingTx: Math.max(0, (ui.pendingTx || 0) - 1),
    transactionCount: (ui.transactionCount || 0) + 1
  });
  BR('SUCCESS', `mined ${rc.hash}`);
  BR('INFO', `${source.explorerTx}${rc.hash}`);

  
  const afterSrc = await usdcBalance(sourceKey, sender);
  const afterDst = await usdcBalance(destKey, toAddr);
  BR('INFO', `${source.label} balance after : ${fromUSDC(afterSrc)} USDC`);
  BR('INFO', `${dest.label} balance after  : ${fromUSDC(afterDst)} USDC`);

  
  if (delaySec > 0) await ui.countdown(delaySec * 1000, 'TX delay');
}


async function runSepoliaToL2() {
  const amountUser = Number(await uiAsk('USDC amount per tx (e.g., 1000):', '1000'));
  if (!Number.isFinite(amountUser) || amountUser <= 0) return BR('ERROR','Invalid amount');

  const delaySec = Math.max(0, Number(await uiAsk('Delay between tx (s, e.g., 5):', '5')) || 0);
  const rounds = Number(await uiAsk('Number of rounds (e.g., 1):', '1'));
  if (!Number.isInteger(rounds) || rounds <= 0) return BR('ERROR','Invalid rounds');

  const gasGwei = Number(await uiAsk('Gas drop in native (gwei, 0 for none):', '0')) || 0;
  const gasDropWei = gweiToWei(gasGwei);

  const sel = (await uiAsk(`Destinations: 'all', 'random', or CSV (optimism,arbitrum,base,unichain):`, 'all')).toLowerCase();
  let selected;
  try { selected = parseCsvSelection(sel, L2_KEYS); }
  catch (e) { return BR('ERROR', e.message || 'Invalid selection'); }

  let randomCount = 0;
  if (selected[0] === '__RANDOM__') {
    randomCount = Math.max(1, Math.min(4, Number(await uiAsk('How many random chains per round (1-4):', '2')) || 1));
  }

  ui.setActive(true);
  await refreshWalletAndTokens();

  const account = (await PER_CHAIN.sepolia.signer.getAddress());
  for (let r = 1; r <= rounds; r++) {
    BR('INFO', `Round ${r}/${rounds}`);
    const targets = selected[0] === '__RANDOM__' ? sampleRandom(L2_KEYS, randomCount) : selected;
    BR('INFO', `Targets: ${targets.join(', ')}`);
    for (const destKey of targets) {
      try {
        try {
          const lim = await readMaxNativeGasDrop('sepolia');
          if (lim > 0n && gasDropWei > lim) BR('WARNING', `gasDrop ${weiToEth(gasDropWei)} ETH > maxNativeGasDrop ${weiToEth(lim)} ETH`);
        } catch {}
        await sendOnce({ sourceKey: 'sepolia', destKey, amountUser, recipient: account, delaySec, gasDropWei });
      } catch (e) {
        ui.updateStats({ failedTx: (ui.failedTx || 0) + 1 });
        BR('ERROR', `${CHAINS.sepolia.label} ? ${CHAINS[destKey].label}: ${e?.shortMessage || e?.reason || e?.message || String(e)}`);
      }
    }
  }
  ui.setActive(false);
  await refreshWalletAndTokens();
  BR('SUCCESS', 'All rounds completed');
}

async function runL2ToSepolia() {
  const amountUser = Number(await uiAsk('USDC amount per tx (e.g., 1000):', '1000'));
  if (!Number.isFinite(amountUser) || amountUser <= 0) return BR('ERROR','Invalid amount');

  const delaySec = Math.max(0, Number(await uiAsk('Delay between tx (s, e.g., 5):', '5')) || 0);
  const rounds = Number(await uiAsk('Number of rounds (e.g., 1):', '1'));
  if (!Number.isInteger(rounds) || rounds <= 0) return BR('ERROR','Invalid rounds');

  const gasGwei = Number(await uiAsk('Gas drop in native (gwei, 0 for none):', '0')) || 0;
  const gasDropWei = gweiToWei(gasGwei);

  const sel = (await uiAsk(`Sources: 'all', 'random', or CSV (optimism,arbitrum,base,unichain):`, 'all')).toLowerCase();
  let selected;
  try { selected = parseCsvSelection(sel, L2_KEYS); }
  catch (e) { return BR('ERROR', e.message || 'Invalid selection'); }

  let randomCount = 0;
  if (selected[0] === '__RANDOM__') {
    randomCount = Math.max(1, Math.min(4, Number(await uiAsk('How many random chains per round (1-4):', '2')) || 1));
  }

  ui.setActive(true);
  await refreshWalletAndTokens();

  const account = (await PER_CHAIN.sepolia.signer.getAddress());
  for (let r = 1; r <= rounds; r++) {
    BR('INFO', `Round ${r}/${rounds}`);
    const sources = selected[0] === '__RANDOM__' ? sampleRandom(L2_KEYS, randomCount) : selected;
    BR('INFO', `Sources: ${sources.join(', ')}`);
    for (const sourceKey of sources) {
      try {
        try {
          const lim = await readMaxNativeGasDrop(sourceKey);
          if (lim > 0n && gasDropWei > lim) BR('WARNING', `gasDrop ${weiToEth(gasDropWei)} ETH > maxNativeGasDrop ${weiToEth(lim)} ETH on ${CHAINS[sourceKey].label}`);
        } catch {}
        await sendOnce({ sourceKey, destKey: 'sepolia', amountUser, recipient: account, delaySec, gasDropWei });
      } catch (e) {
        ui.updateStats({ failedTx: (ui.failedTx || 0) + 1 });
        BR('ERROR', `${CHAINS[sourceKey].label} ? ${CHAINS.sepolia.label}: ${e?.shortMessage || e?.reason || e?.message || String(e)}`);
      }
    }
  }
  ui.setActive(false);
  await refreshWalletAndTokens();
  BR('SUCCESS', 'All rounds completed');
}

async function runRandomBothWays() {
  const dir = (await uiAsk("Direction: 'a' = Sepolia ? random L2 | 'b' = random L2 ? Sepolia", 'a')).toLowerCase();
  if (!['a','b'].includes(dir)) return BR('ERROR','Invalid choice');

  const amountUser = Number(await uiAsk('USDC amount per tx (e.g., 1000):', '1000'));
  if (!Number.isFinite(amountUser) || amountUser <= 0) return BR('ERROR','Invalid amount');

  const delaySec = Math.max(0, Number(await uiAsk('Delay between tx (s, e.g., 5):', '5')) || 0);
  const rounds = Number(await uiAsk('Number of rounds (e.g., 1):', '1'));
  if (!Number.isInteger(rounds) || rounds <= 0) return BR('ERROR','Invalid rounds');

  const gasGwei = Number(await uiAsk('Gas drop in native (gwei, 0 for none):', '0')) || 0;
  const gasDropWei = gweiToWei(gasGwei);

  const rc = Math.max(1, Math.min(4, Number(await uiAsk('How many random chains per round (1-4):', '2')) || 1));

  ui.setActive(true);
  await refreshWalletAndTokens();

  const account = (await PER_CHAIN.sepolia.signer.getAddress());
  for (let r = 1; r <= rounds; r++) {
    BR('INFO', `Round ${r}/${rounds}`);
    const picks = sampleRandom(L2_KEYS, rc);
    BR('INFO', `Random picks: ${picks.join(', ')}`);

    if (dir === 'a') {
      for (const destKey of picks) {
        try {
          try {
            const lim = await readMaxNativeGasDrop('sepolia');
            if (lim > 0n && gasDropWei > lim) BR('WARNING', `gasDrop ${weiToEth(gasDropWei)} ETH > maxNativeGasDrop ${weiToEth(lim)} ETH (Sepolia)`);
          } catch {}
          await sendOnce({ sourceKey:'sepolia', destKey, amountUser, recipient: account, delaySec, gasDropWei });
        } catch (e) {
          ui.updateStats({ failedTx: (ui.failedTx || 0) + 1 });
          BR('ERROR', `${CHAINS.sepolia.label} ? ${CHAINS[destKey].label}: ${e?.shortMessage || e?.reason || e?.message || String(e)}`);
        }
      }
    } else {
      for (const sourceKey of picks) {
        try {
          try {
            const lim = await readMaxNativeGasDrop(sourceKey);
            if (lim > 0n && gasDropWei > lim) BR('WARNING', `gasDrop ${weiToEth(gasDropWei)} ETH > maxNativeGasDrop ${weiToEth(lim)} ETH on ${CHAINS[sourceKey].label}`);
          } catch {}
          await sendOnce({ sourceKey, destKey:'sepolia', amountUser, recipient: account, delaySec, gasDropWei });
        } catch (e) {
          ui.updateStats({ failedTx: (ui.failedTx || 0) + 1 });
          BR('ERROR', `${CHAINS[sourceKey].label} ? ${CHAINS.sepolia.label}: ${e?.shortMessage || e?.reason || e?.message || String(e)}`);
        }
      }
    }
  }

  ui.setActive(false);
  await refreshWalletAndTokens();
  BR('SUCCESS', 'All rounds completed');
}


ui.on('menu:select', async (label) => {
  try {
    if (label.startsWith('1)')) {
      await runSepoliaToL2();
    } else if (label.startsWith('2)')) {
      await runL2ToSepolia();
    } else if (label.startsWith('3)')) {
      await runRandomBothWays();
    } else if (label.startsWith('4)')) {
      ui.destroy(0);
      return;
    } else {
      BR('ERROR','Unknown menu item');
    }
  } catch (e) {
    ui.updateStats({ failedTx: (ui.failedTx || 0) + 1 });
    BR('ERROR', e?.message || String(e));
  } finally {
    
    await refreshWalletAndTokens();
    ui.setActive(false);
    ui.render();
  }
});


let pollId;
(async () => {
  try {
    await refreshWalletAndTokens();
    BR('INFO', 'Ready. Select a transaction mode from the menu.');

    
    pollId = setInterval(async () => {
      try { await refreshWalletAndTokens(); } catch {}
    }, 15000);

    process.on('exit', () => { try { clearInterval(pollId); } catch {} });
  } catch (e) {
    BR('ERROR', e?.message || String(e));
  }
})();
