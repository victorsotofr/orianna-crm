'use client';

import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ContactStatusBadge } from '@/components/contact-status-badge';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { format } from 'date-fns';
import type { TeamMember } from '@/types/database';

interface EditableCellProps {
  contactId: string;
  field: string;
  value: string | null;
  type: 'text' | 'status' | 'owner' | 'date' | 'readonly-date';
  teamMembers?: TeamMember[];
  onUpdate: (contactId: string, field: string, value: string | null) => void;
}

const STATUS_OPTIONS = [
  { value: 'new', label: 'Nouveau' },
  { value: 'contacted', label: 'Contacté' },
  { value: 'replied', label: 'Répondu' },
  { value: 'qualified', label: 'Qualifié' },
  { value: 'unqualified', label: 'Non qualifié' },
  { value: 'do_not_contact', label: 'Ne pas contacter' },
];

export function EditableCell({ contactId, field, value, type, teamMembers, onUpdate }: EditableCellProps) {
  const [editing, setEditing] = useState(false);
  const [localValue, setLocalValue] = useState(value || '');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLocalValue(value || '');
  }, [value]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      if (type === 'text') {
        inputRef.current.select();
      }
    }
  }, [editing, type]);

  const save = async (newValue: string) => {
    const finalValue = newValue.trim() || null;
    if (finalValue === (value || null)) {
      setEditing(false);
      return;
    }

    // Optimistic update
    setLocalValue(newValue);
    setEditing(false);
    setSaving(true);

    try {
      const response = await fetch(`/api/contacts/${contactId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: finalValue }),
      });

      if (!response.ok) {
        throw new Error('Failed to save');
      }

      onUpdate(contactId, field, finalValue);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 600);
    } catch {
      // Revert
      setLocalValue(value || '');
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      save(localValue);
    } else if (e.key === 'Escape') {
      setLocalValue(value || '');
      setEditing(false);
    }
  };

  const feedbackClass = saving ? 'opacity-50 animate-pulse' : saveSuccess ? 'bg-green-100 dark:bg-green-900/30 transition-colors duration-300' : 'transition-colors duration-300';

  // Read-only date display
  if (type === 'readonly-date') {
    return (
      <span className="text-xs text-muted-foreground whitespace-nowrap px-1.5 py-1">
        {value ? format(new Date(value), 'dd/MM/yyyy') : '\u2014'}
      </span>
    );
  }

  // Date cell
  if (type === 'date') {
    if (editing) {
      return (
        <input
          ref={inputRef}
          type="date"
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          onBlur={() => save(localValue)}
          onKeyDown={handleKeyDown}
          className="h-7 w-[130px] text-xs border rounded px-1.5 bg-background"
        />
      );
    }
    return (
      <span
        className={`text-xs text-muted-foreground whitespace-nowrap px-1.5 py-1 cursor-pointer hover:bg-muted/50 rounded min-w-[60px] inline-block ${feedbackClass}`}
        onClick={() => setEditing(true)}
      >
        {value ? format(new Date(value), 'dd/MM/yyyy') : '\u2014'}
      </span>
    );
  }

  // Status select
  if (type === 'status') {
    if (editing) {
      return (
        <Select
          value={localValue || 'new'}
          onValueChange={(v) => {
            save(v);
          }}
          open={true}
          onOpenChange={(open) => {
            if (!open) setEditing(false);
          }}
        >
          <SelectTrigger className="h-7 text-xs w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    return (
      <div className={`cursor-pointer rounded ${feedbackClass}`} onClick={() => setEditing(true)}>
        <ContactStatusBadge status={value || 'new'} />
      </div>
    );
  }

  // Owner select
  if (type === 'owner') {
    const members = teamMembers || [];
    const member = members.find(m => m.user_id === value);
    const displayName = member?.display_name || member?.email?.split('@')[0] || null;

    if (editing) {
      return (
        <Select
          value={value || 'unassigned'}
          onValueChange={(v) => {
            save(v === 'unassigned' ? '' : v);
          }}
          open={true}
          onOpenChange={(open) => {
            if (!open) setEditing(false);
          }}
        >
          <SelectTrigger className="h-7 text-xs w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="unassigned">Non assigné</SelectItem>
            {members.map(m => (
              <SelectItem key={m.user_id} value={m.user_id}>
                {m.display_name || m.email.split('@')[0]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    return (
      <div className={`cursor-pointer rounded ${feedbackClass}`} onClick={() => setEditing(true)}>
        {displayName ? (
          <Badge variant="secondary" className="text-xs">{displayName}</Badge>
        ) : (
          <span className="text-xs text-muted-foreground">Non assigné</span>
        )}
      </div>
    );
  }

  // Text cell
  if (editing) {
    return (
      <Input
        ref={inputRef}
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={() => save(localValue)}
        onKeyDown={handleKeyDown}
        className="h-7 text-xs min-w-[80px]"
      />
    );
  }

  return (
    <span
      className={`text-xs px-1.5 py-1 cursor-pointer hover:bg-muted/50 rounded inline-block min-w-[40px] truncate max-w-[200px] ${feedbackClass}`}
      title={value || undefined}
      onClick={() => setEditing(true)}
    >
      {value || <span className="text-muted-foreground">&mdash;</span>}
    </span>
  );
}
