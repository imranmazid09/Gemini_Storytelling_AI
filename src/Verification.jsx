import { useEffect, useState } from 'react';
export default function Verification({ id }) {
  const [receipt, setReceipt] = useState(null);
  const [error, setError] = useState('');
  const [match, setMatch] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    fetch(`/api/record?id=${id}`, { signal: controller.signal }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Receipt could not be loaded.');
      setReceipt(result);
    }).catch(failure => { if (failure.name !== 'AbortError') setError(failure.message); });
    return () => controller.abort();
  }, [id, reload]);
  const check = async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    setVerifiedPayload(null); setMatch('Checking record…');
    if (file.size > 2000000) { setMatch('This file is too large. Select the original StoryLab learning record.'); return; }
    try {
      const html = new DOMParser().parseFromString(await file.text(), 'text/html');
      const payload = JSON.parse(html.getElementById('storylab-record').textContent);
      const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(payload)));
      const digest = [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
      setMatch(digest === receipt.reportHash ? 'Match: the embedded learning record matches the tool-issued receipt. Visible formatting is not covered by this check; inspect the record data below.' : 'Mismatch: this embedded record does not match the tool-issued receipt.');
      if (digest === receipt.reportHash) {
        const digestOf = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))))].map(byte => byte.toString(16).padStart(2, '0')).join('');
        const comparisons = await Promise.all((payload.aiOutputs || []).map(async output => ({ action: output.action, inputHash: await digestOf(output.input), outputHash: await digestOf(output.output) })));
        const matched = receipt.serverActions.filter(call => comparisons.some(output => output.action === call.action && output.inputHash === call.inputHash && output.outputHash === call.outputHash)).length;
        setMatch(`Match: the embedded record matches the receipt. ${matched} of ${receipt.serverActions.length} server-confirmed AI calls also match retained input/output drafts. Browser edits remain self-reported. Inspect the verified record data below.`);
        setVerifiedPayload(payload);
      }
      else setVerifiedPayload(null);
    } catch { setMatch('Could not read this file. Select the original downloaded HTML learning record.'); setVerifiedPayload(null); }
  };
  const [verifiedPayload, setVerifiedPayload] = useState(null);
  return <main className="verification-page"><section className="panel"><p className="eyebrow">StoryLab Pro · By Dr Imran</p><h1>Learning record verification</h1><p>This page checks a receipt issued by the advertising storytelling tool.</p>{error ? <div role="alert">{error}<button className="secondary-button" onClick={() => setReload(value => value + 1)}>Try again</button></div> : !receipt ? <p role="status">Loading receipt…</p> : <><h2>Tool-issued receipt found</h2><p>Issued: {receipt.issuedAt}</p><p>Server-confirmed successful AI calls: {receipt.serverActions.length}</p><ul>{receipt.serverActions.map((call, index) => <li key={index}>{call.action} · {call.at}</li>)}</ul><p>{receipt.notice}</p><p>Receipt digest: <code>{receipt.reportHash}</code></p><label className="field"><span>Check the original downloaded HTML learning record (checked locally; the file is not uploaded)</span><input type="file" accept=".html" onChange={check} /></label><p role="status">{match}</p>{verifiedPayload && <details><summary>Inspect the verified record data</summary><pre>{JSON.stringify(verifiedPayload, null, 2)}</pre></details>}</>}<a href="/">Open StoryLab Pro</a></section></main>;
}
