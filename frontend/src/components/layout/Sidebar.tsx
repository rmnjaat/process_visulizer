import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, List, GitBranch, Cpu, MemoryStick } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
}

const navItems: NavItem[] = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/processes', label: 'Processes', icon: List },
  { path: '/tree', label: 'Process Tree', icon: GitBranch },
  { path: '/cpu', label: 'CPU Cores', icon: Cpu },
  { path: '/memory', label: 'Memory', icon: MemoryStick },
];

export function Sidebar() {
  const [expanded, setExpanded] = useState(false);

  return (
    <aside
      className="flex flex-col h-screen border-r transition-all duration-200 shrink-0"
      style={{
        width: expanded ? 200 : 60,
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--bg-elevated)',
      }}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      <div
        className="flex items-center justify-center h-14 border-b text-lg font-bold"
        style={{ borderColor: 'var(--bg-elevated)', color: 'var(--color-primary)' }}
      >
        {expanded ? 'PV' : 'P'}
      </div>

      <nav className="flex flex-col gap-1 p-2 flex-1">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors no-underline"
            style={({ isActive }) => ({
              backgroundColor: isActive ? 'var(--color-primary)' : 'transparent',
              color: isActive ? '#fff' : 'var(--text-secondary)',
            })}
          >
            <item.icon size={18} className="shrink-0" />
            {expanded && <span className="whitespace-nowrap overflow-hidden">{item.label}</span>}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
