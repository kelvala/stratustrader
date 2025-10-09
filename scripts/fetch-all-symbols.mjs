#!/usr/bin/env node
// Fetch US stock symbols and merge into public/stock_data.csv without duplicates.
// Primary sources: Nasdaq Trader (nasdaqlisted.txt, otherlisted.txt). Skips Test Issue symbols.
// Fallback: ensure list + Yahoo autocomplete to fetch names for specific tickers.

import fs from 'fs';
import path from 'path';
import https from 'https';

const root = process.cwd();
const csvPath = path.join(root, 'public', 'stock_data.csv');
const bakPath = path.join(root, 'public', `stock_data.csv.bak`);

function fetchText(url){
  return new Promise((resolve,reject)=>{
    https.get(url, res=>{
      if(res.statusCode!==200){ res.resume(); return reject(new Error('HTTP '+res.statusCode+' '+url)); }
      let d=''; res.setEncoding('utf8'); res.on('data', c=>d+=c); res.on('end', ()=>resolve(d));
    }).on('error',reject);
  });
}
function fetchJSON(url){
  return new Promise((resolve,reject)=>{
    https.get(url, res=>{
      if(res.statusCode!==200){ res.resume(); return reject(new Error('HTTP '+res.statusCode+' '+url)); }
      let d=''; res.setEncoding('utf8'); res.on('data', c=>d+=c); res.on('end', ()=>{ try{ resolve(JSON.parse(d)); }catch(e){ reject(e); } });
    }).on('error',reject);
  });
}

async function fetchYahooAutocomplete(query){
  const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&lang=en-US&region=US&quotesCount=5&newsCount=0`;
  try{ return await fetchJSON(url); }catch{ return { quotes: [] }; }
}

async function loadCurrentCSV(){
  try{ const txt = fs.readFileSync(csvPath,'utf8'); const lines = txt.split(/\r?\n/).filter(Boolean); let start=0; if(/^\s*symbol\s*(\||,)/i.test(lines[0]||'')) start=1; const out=[]; for(let i=start;i<lines.length;i++){ const line=lines[i]; const d=line.includes('|')?'|':','; const parts=line.split(d); const sym=(parts[0]||'').trim().toUpperCase(); const name=parts.slice(1).join(' ').replace(/\s*\|\s*/g,' ').trim(); if(sym) out.push([sym,name]); } return out; }catch{ return []; }
}

function writeCSV(rows){
  const header = 'symbol|name\n';
  const body = rows.map(r=>`${r[0]}|${r[1]||''}`).join('\n')+'\n';
  // backup current
  try{ if(fs.existsSync(csvPath)) fs.copyFileSync(csvPath, bakPath); }catch{}
  fs.writeFileSync(csvPath, header+body, 'utf8');
  console.log('Wrote', rows.length, 'symbols to', csvPath);
}

const NASDAQ_TRADER = [
  'https://ftp.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt',
  'https://ftp.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt'
];

function normalizeSym(sym){
  return String(sym||'').trim().toUpperCase().replace(/\./g,'-');
}

function dedupeMerge(base, more){
  const m = new Map(base.map(([s,n])=>[normalizeSym(s), n||'']));
  for(const [s0,n0] of more){
    const s=normalizeSym(s0); if(!s) continue;
    const newName = (n0||'').trim();
    if(!m.has(s)){
      m.set(s, newName);
    } else {
      const cur = (m.get(s)||'').trim();
      // Update if current is empty and newName is non-empty, or if newName is longer (assume more descriptive)
      if((!cur && newName) || (newName && newName.length>cur.length)){
        m.set(s, newName);
      }
    }
  }
  return Array.from(m.entries()).map(([s,n])=>[s,n]).sort((a,b)=> a[0].localeCompare(b[0]));
}

function parseNasdaqTrader(text){
  const lines = text.split(/\r?\n/).filter(Boolean);
  if(!lines.length) return [];
  const header = lines[0].split('|');
  const idxSym = header.findIndex(h=>/^(symbol|act symbol)$/i.test(h));
  const idxName= header.findIndex(h=>/^security name$/i.test(h));
  const idxTest= header.findIndex(h=>/^test issue$/i.test(h));
  const out=[];
  for(let i=1;i<lines.length;i++){
    const L = lines[i];
    if(/file creation time/i.test(L)) continue;
    const parts = L.split('|');
    const sym = parts[idxSym]||''; const name = parts[idxName]||''; const test = (parts[idxTest]||'').trim().toUpperCase()==='Y';
    if(!sym || test) continue;
    out.push([sym, name]);
  }
  return out;
}

async function run(){
  const base = await loadCurrentCSV();
  let merged = base;
  // Fetch Nasdaq Trader files
  for(const url of NASDAQ_TRADER){
    try{
      console.log('Fetching', url);
      const txt = await fetchText(url);
      const pairs = parseNasdaqTrader(txt);
      merged = dedupeMerge(merged, pairs);
      console.log('Merged, count=', merged.length);
    }catch(e){ console.warn('Source failed', url, e.message); }
  }
  // Ensure critical user-specified tickers present
  const ensureSyms = ['UURAF','UUUU','OKLO','BTC-USD','ETH-USD','DOGE-USD'];
  const ensureNameMap = {
    'UURAF':'Uranium Royalty Corp.',
    'UUUU':'Energy Fuels Inc.',
    'OKLO':'Oklo Inc.',
    'BTC-USD':'Bitcoin USD',
    'ETH-USD':'Ethereum USD',
    'DOGE-USD':'Dogecoin USD'
  };
  // Try to enrich names via Yahoo
  const ensurePairs = [];
  for(const s of ensureSyms){
    const S = normalizeSym(s);
    const has = merged.find(([x])=>x===S);
    if(has){ ensurePairs.push([S, has[1] || ensureNameMap[S] || '']); continue; }
    try{
      const j = await fetchYahooAutocomplete(S);
      const q = (j.quotes||[]).find(r=> (r.symbol||'').toUpperCase()===S);
      const nm = q?.shortname || q?.longname || q?.longName || ensureNameMap[S] || '';
      ensurePairs.push([S, nm]);
    }catch{ ensurePairs.push([S, ensureNameMap[S] || '']); }
  }
  merged = dedupeMerge(merged, ensurePairs);
  writeCSV(merged);
}

run().catch(e=>{ console.error(e); process.exit(1); });
