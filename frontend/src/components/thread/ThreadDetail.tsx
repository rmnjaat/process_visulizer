import type { ThreadInfo } from '../../types/thread';
import { ThreadBadge } from '../badges/ThreadBadge';
import { StateBadge } from '../common/StateBadge';
import { formatPercent, formatNumber, formatBytes } from '../../utils/format';

interface ThreadDetailProps {
  thread: ThreadInfo;
}

function Value({ children, na }: { children?: React.ReactNode; na?: boolean }) {
  if (na) {
    return (
      <span className="text-sm font-mono italic" style={{ color: 'var(--text-muted)' }}>
        N/A
      </span>
    );
  }
  return (
    <span className="text-sm font-mono" style={{ color: 'var(--text-primary)' }}>
      {children}
    </span>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
      {children}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-lg p-4"
      style={{ backgroundColor: 'var(--bg-elevated)' }}
    >
      <h3
        className="text-xs font-semibold uppercase tracking-wide mt-0 mb-3"
        style={{ color: 'var(--text-muted)' }}
      >
        {title}
      </h3>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export function ThreadDetail({ thread }: ThreadDetailProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <ThreadBadge />
        <span className="text-sm font-mono" style={{ color: 'var(--text-secondary)' }}>
          TID {thread.tid}
        </span>
      </div>

      {/* Identity */}
      <Section title="Identity">
        <Field label="TID">
          <Value>{thread.tid}</Value>
        </Field>
        <Field label="Parent PID">
          <Value>{thread.pid}</Value>
        </Field>
        <Field label="Name">
          <Value>{thread.name || 'unnamed'}</Value>
        </Field>
        <Field label="State">
          {thread.state === 'unknown' ? (
            <Value na />
          ) : (
            <StateBadge state={thread.state} />
          )}
        </Field>
        <Field label="Running on">
          <Value na={thread.core_id === null}>
            {thread.core_id !== null ? `Core ${thread.core_id}` : null}
          </Value>
        </Field>
      </Section>

      {/* CPU */}
      <Section title="CPU">
        <Field label="CPU %">
          <Value>{formatPercent(thread.cpu_percent)}</Value>
        </Field>
        <Field label="User Time">
          <Value>{thread.cpu_time_user.toFixed(2)}s</Value>
        </Field>
        <Field label="System Time">
          <Value>{thread.cpu_time_system.toFixed(2)}s</Value>
        </Field>
        <Field label="Priority">
          <Value na={thread.priority === 0}>
            {thread.priority !== 0 ? thread.priority : null}
          </Value>
        </Field>
        <Field label="Nice">
          <Value na={thread.nice === 0}>
            {thread.nice !== 0 ? thread.nice : null}
          </Value>
        </Field>
      </Section>

      {/* Context Switches */}
      <Section title="Context Switches">
        <Field label="Voluntary">
          <Value na={thread.voluntary_ctx_switches === 0}>
            {thread.voluntary_ctx_switches !== 0
              ? formatNumber(thread.voluntary_ctx_switches)
              : null}
          </Value>
        </Field>
        <Field label="Involuntary">
          <Value na={thread.involuntary_ctx_switches === 0}>
            {thread.involuntary_ctx_switches !== 0
              ? formatNumber(thread.involuntary_ctx_switches)
              : null}
          </Value>
        </Field>
      </Section>

      {/* Stack */}
      <Section title="Stack">
        <Field label="Stack Size">
          <Value na={thread.stack_size_bytes === 0}>
            {thread.stack_size_bytes !== 0
              ? formatBytes(thread.stack_size_bytes)
              : null}
          </Value>
        </Field>
      </Section>

      {/* Info note */}
      <div
        className="rounded-lg p-3 text-xs leading-relaxed"
        style={{
          backgroundColor: 'var(--bg-elevated)',
          color: 'var(--text-muted)',
        }}
      >
        Threads share memory with their parent process. Memory metrics (RSS, VMS)
        are shown at the process level. Some thread details are unavailable on
        macOS.
      </div>
    </div>
  );
}
