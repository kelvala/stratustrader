#!/usr/bin/env node
// compute-breadth.mjs
// Fetch daily charts for a list of symbols and compute percent above/below SMA50 and SMA200.
import fs from 'fs/promises';
import path from 'path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const STOCK_CSV = path.join(ROOT, 'public', 'stock_data.csv');
const OUT_JSON = path.join(ROOT, 'public', 'breadth.json');

function parseCSV(text){ return text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean).map(l=>{ const p=l.split('|'); return { t:p[0].trim(), n:(p[1]||'').trim() }; }); }

function normalizeForYahoo(t){ return t.replace(/^\^/,'%5E').replace(/\./g,'-'); }

async function fetchChart(symbol){
  const s = encodeURIComponent(symbol);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${s}?range=1y&interval=1d&events=div%2Csplit`;
  try{
    const res = await fetch(url, { headers: { 'User-Agent':'Mozilla/5.0' } });
    if(!res.ok) return null;
    const j = await res.json();
    const r = j?.chart?.result?.[0];
    if(!r) return null;
    const q = r.indicators?.quote?.[0] || {};
    const closes = (q.close||[]).map(v=> Number.isFinite(v)? +v : NaN).filter(Number.isFinite);
    return closes;
  }catch(e){ return null; }
}

function sma(arr, p){ if(!Array.isArray(arr) || arr.length < p) return null; const out = []; let sum=0; for(let i=0;i<arr.length;i++){ sum += arr[i]; if(i>=p) sum -= arr[i-p]; if(i >= p-1) out.push(sum / p); } return out; }

async function main(){
  const csv = await fs.readFile(STOCK_CSV, 'utf-8');
  const list = parseCSV(csv).map(r=>r.t).filter(Boolean);
  const MAX = Number(process.env.BREADTH_MAX || 300); // cap to avoid excessive runtime
  const symbols = list.slice(0, MAX);
  console.log('symbols to process', symbols.length);

  const concurrency = Number(process.env.BREADTH_CONCURRENCY || 4);
  let idx = 0;
  const results = [];

  async function worker(){
    while(idx < symbols.length){
      const i = idx++; const raw = symbols[i]; const s = normalizeForYahoo(raw);
      try{
        const closes = await fetchChart(s);
        results.push({ symbol: raw, closes: closes || [] });
        console.log('fetched', raw, (closes||[]).length);
      }catch(e){ console.warn('err', raw, e); results.push({ symbol: raw, closes: [] }); }
    }
  }

  await Promise.all(Array.from({length:concurrency}).map(()=>worker()));

  // compute counts
  let sma50_above=0, sma50_below=0, sma50_counted=0;
  let sma200_above=0, sma200_below=0, sma200_counted=0;

  for(const r of results){
    const closes = r.closes || [];
    if(closes.length >= 50){
      const last50 = closes.slice(-50);
      const avg50 = last50.reduce((a,b)=>a+b,0)/last50.length;
      const last = closes[closes.length-1];
      if(Number.isFinite(last) && Number.isFinite(avg50)){
        if(last >= avg50) sma50_above++; else sma50_below++;
        sma50_counted++;
      }
    }
    if(closes.length >= 200){
      const last200 = closes.slice(-200);
      const avg200 = last200.reduce((a,b)=>a+b,0)/last200.length;
      const last = closes[closes.length-1];
      if(Number.isFinite(last) && Number.isFinite(avg200)){
        if(last >= avg200) sma200_above++; else sma200_below++;
        sma200_counted++;
      }
    }
  }

  const out = {
    t: Date.now(),
    sampleSize: symbols.length,
    sma50: { above: sma50_above, below: sma50_below, counted: sma50_counted, abovePct: sma50_counted? (sma50_above/sma50_counted*100):null, belowPct: sma50_counted? (sma50_below/sma50_counted*100):null },
    sma200: { above: sma200_above, below: sma200_below, counted: sma200_counted, abovePct: sma200_counted? (sma200_above/sma200_counted*100):null, belowPct: sma200_counted? (sma200_below/sma200_counted*100):null }
  };

  await fs.writeFile(OUT_JSON, JSON.stringify(out, null, 2), 'utf-8');
  console.log('wrote', OUT_JSON);
}

main().catch(e=>{ console.error(e); process.exit(1); });
