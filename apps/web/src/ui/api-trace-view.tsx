import type { ApiTraceStep } from '@ai-playground/core';

const label = (step: ApiTraceStep): string => {
  switch (step.kind) {
    case 'request':
      return `${step.method} ${step.url}`;
    case 'status':
      return `status: ${step.state}`;
    case 'poll':
      return `${step.method} ${step.url}`;
    case 'completed':
      return 'response';
  }
};

export function ApiTraceView({ trace }: { trace: ApiTraceStep[] }) {
  return (
    <ol className="flex flex-col gap-3">
      {trace.map((step, i) => (
        <li key={i}>
          <p className="font-mono text-xs text-muted">{label(step)}</p>
          {'body' in step || 'response' in step ? (
            <pre className="overflow-x-auto rounded-md border border-border bg-surface p-3 font-mono text-xs text-fg">
              {JSON.stringify('body' in step ? step.body : step.response, null, 2)}
            </pre>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
