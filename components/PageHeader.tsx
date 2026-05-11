import { ReactNode } from 'react';

interface Props {
  title: string;
  subtitle: string;
  actions?: ReactNode;
  sticky?: boolean;
}

export default function PageHeader({ title, subtitle, actions, sticky }: Props) {
  const inner = (
    <div className="flex items-center justify-between gap-4">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
        <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );

  if (sticky) {
    return (
      <header className="sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-8 py-4">
          {inner}
        </div>
      </header>
    );
  }

  return <div className="mb-6">{inner}</div>;
}
