import React, { useRef, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Moon, Sun, LogOut, Building2, Globe, ChevronRight, X, User
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { cn } from '@/lib/utils';

export function SidebarUserMenu() {
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const email = user?.email ?? '';
  const name = user?.user_metadata?.full_name || email.split('@')[0] || 'משתמש';
  const initials = name.slice(0, 2).toUpperCase();

  const isRtl = i18n.dir() === 'rtl';
  const toggleLang = () => {
    const next = i18n.language === 'he' ? 'en' : 'he';
    i18n.changeLanguage(next);
  };

  return (
    <div className="relative">
      {/* Floating panel */}
      {open && (
        <div
          ref={panelRef}
          className="sidebar-user-panel absolute bottom-full mb-2 right-0 left-0 z-50 rounded-2xl border border-cyan-400/20 bg-[#0d1b2e] shadow-2xl overflow-hidden"
          style={{ minWidth: 220 }}
        >
          {/* Header */}
          <div className={cn(
            'flex items-center justify-between gap-3 px-4 py-3 border-b',
            'border-white/10',
            '.light & border-slate-100'
          )}>
            <div className="flex items-center gap-3 min-w-0">
              <div className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold',
                'bg-cyan-500/20 text-cyan-300 border border-cyan-400/30',
              )}>
                {initials}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate text-white sidebar-user-name">{name}</p>
                <p className="text-[11px] truncate text-white/50 sidebar-user-email">{email}</p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="sidebar-close-btn shrink-0 rounded-lg p-1 text-white/40 hover:text-white/80 transition-colors"
              style={{ background: 'transparent', border: 'none', boxShadow: 'none' }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Menu items */}
          <div className="py-2">
            {/* Dark/Light mode */}
            <button
              onClick={toggleTheme}
              className="sidebar-menu-item w-full flex items-center justify-between gap-3 px-4 py-2.5 text-sm transition-colors"
            >
              <div className="flex items-center gap-3">
                {theme === 'dark'
                  ? <Moon className="h-4 w-4 text-cyan-300" />
                  : <Sun className="h-4 w-4 text-amber-400" />
                }
                <span className="sidebar-menu-label">
                  {theme === 'dark' ? 'מצב כהה' : 'מצב בהיר'}
                </span>
              </div>
              {/* Toggle pill */}
              <div className={cn(
                'relative h-5 w-9 rounded-full transition-colors',
                theme === 'light' ? 'bg-cyan-500' : 'bg-white/20'
              )}>
                <div className={cn(
                  'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all',
                  theme === 'light' ? 'right-0.5' : 'left-0.5'
                )} />
              </div>
            </button>

            {/* Language toggle */}
            <button
              onClick={toggleLang}
              className="sidebar-menu-item w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors"
            >
              <Globe className="h-4 w-4 text-cyan-300 sidebar-menu-icon" />
              <span className="sidebar-menu-label flex-1 text-start">
                {i18n.language === 'he' ? 'שפה: עברית' : 'Language: English'}
              </span>
              <ChevronRight className="h-3.5 w-3.5 opacity-40 sidebar-menu-caret" />
            </button>

            <div className="my-1.5 mx-3 h-px bg-white/8 sidebar-divider" />

            {/* Org Settings */}
            <Link
              to="/admin/org-settings"
              onClick={() => setOpen(false)}
              className="sidebar-menu-item w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors"
            >
              <Building2 className="h-4 w-4 text-cyan-300 sidebar-menu-icon" />
              <span className="sidebar-menu-label flex-1">הגדרות ארגון</span>
              <ChevronRight className="h-3.5 w-3.5 opacity-40 sidebar-menu-caret" />
            </Link>

            <div className="my-1.5 mx-3 h-px bg-white/8 sidebar-divider" />

            {/* Logout */}
            <button
              onClick={() => { setOpen(false); signOut(); }}
              className="sidebar-logout-btn w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors"
            >
              <LogOut className="h-4 w-4 text-red-400" />
              <span>התנתקות</span>
            </button>
          </div>
        </div>
      )}

      {/* Trigger button */}
      <button
        ref={triggerRef}
        onClick={() => setOpen((p) => !p)}
        className={cn(
          'sidebar-trigger-btn w-full flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200',
          open
            ? 'bg-cyan-500/20 border border-cyan-400/40'
            : 'hover:bg-white/8 border border-transparent'
        )}
      >
        <div className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold',
          'bg-cyan-500/25 text-cyan-300 border border-cyan-400/30',
        )}>
          {initials}
        </div>
        <div className="min-w-0 flex-1 text-right">
          <p className="text-sm font-semibold leading-tight truncate text-white sidebar-trigger-name">{name}</p>
          <p className="text-[10px] truncate text-white/45 sidebar-trigger-email">{email}</p>
        </div>
        <ChevronRight className={cn(
          'h-4 w-4 text-white/40 transition-transform',
          open && 'rotate-[270deg]'
        )} />
      </button>
    </div>
  );
}
