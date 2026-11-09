import { useState } from 'react';
import { X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

export function TagInput({ value, onChange, disabled }: { value: string[]; onChange: (tags: string[]) => void; disabled?: boolean }) {
  const [draft, setDraft] = useState('');
  const add = () => { const t = draft.trim().replace(/,$/, ''); if (t && !value.includes(t)) onChange([...value, t]); setDraft(''); };
  return (
    <div className="space-y-2">
      {value.length > 0 && <div className="flex flex-wrap gap-1.5">{value.map(t => (
        <Badge key={t} variant="secondary" className="gap-1 rounded-full">{t}{!disabled && <button type="button" aria-label={`Remove tag ${t}`} onClick={() => onChange(value.filter(x => x !== t))}><X className="h-3 w-3" /></button>}</Badge>
      ))}</div>}
      {!disabled && <Input aria-label="Add tag" value={draft} placeholder="Type a tag and press Enter" onChange={e => setDraft(e.target.value)} onBlur={add} onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } }} />}
    </div>
  );
}
