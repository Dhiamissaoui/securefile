import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

export default function CopyButton({ value, label = 'Copier', className = '' }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value || '');
    } catch {
      const area = document.createElement('textarea');
      area.value = value || '';
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <button type="button" className={`copy-btn ${className}`} onClick={copy}>
      {copied ? <Check size={13} /> : <Copy size={13} />}
      {copied ? 'Copié' : label}
    </button>
  );
}
