import { Sun, Moon } from 'lucide-react';
import { useThemeStore } from '../../stores/themeStore';

export function ThemeToggle() {
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);

  return (
    <button
      onClick={toggleTheme}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
      className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors duration-200 cursor-pointer border-none outline-none"
      style={{
        backgroundColor: 'var(--bg-elevated)',
        color: 'var(--text-secondary)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = 'var(--text-primary)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = 'var(--text-secondary)';
      }}
    >
      {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
