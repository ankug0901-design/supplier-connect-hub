import { useState } from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { Option } from '@/lib/tickets';

export function SearchSelect({ options, value, onChange, placeholder, fallbackLabel, label, disabled }: { options: Option[]; value: string | null; onChange: (v: string | null, o?: Option) => void; placeholder: string; fallbackLabel?: string; label: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const current = options.find(o => o.value === value);
  return (
    <div className="flex gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" role="combobox" aria-label={label} disabled={disabled} className="w-full justify-between font-normal">
            <span className={cn('truncate', !value && 'text-muted-foreground')}>{current?.label || (value ? fallbackLabel || value : placeholder)}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder={`Search ${label.toLowerCase()}…`} />
            <CommandList>
              <CommandEmpty>No results.</CommandEmpty>
              <CommandGroup>
                {options.slice(0, 300).map(o => (
                  <CommandItem key={o.value} value={`${o.label} ${o.sub || ''} ${o.value}`} onSelect={() => { onChange(o.value, o); setOpen(false); }}>
                    <Check className={cn('mr-2 h-4 w-4', value === o.value ? 'opacity-100' : 'opacity-0')} />
                    <span className="truncate">{o.label}</span>{o.sub && <span className="ml-auto truncate pl-2 text-xs text-muted-foreground">{o.sub}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {value && !disabled && <Button type="button" variant="ghost" size="icon" aria-label={`Clear ${label}`} onClick={() => onChange(null)}><X className="h-4 w-4" /></Button>}
    </div>
  );
}
