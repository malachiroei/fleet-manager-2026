import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { Bot, X, Send, Loader2, Sparkles, ChevronDown } from 'lucide-react';
import { processFleetQuery } from '@/lib/aiQueryEngine';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

/** Context injected from the current page so the AI knows what the user is looking at. */
export interface AIChatContext {
  type?: 'vehicle' | 'driver' | 'general';
  vehicleLabel?: string;
  driverName?: string;
  vehicleId?: string;
  driverId?: string;
  /** Any additional key-value pairs from the page */
  [key: string]: unknown;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface AIChatAssistantProps {
  /** Optional context from the current page (vehicle/driver details, etc.) */
  context?: AIChatContext;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function formatTime(d: Date) {
  return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export function AIChatAssistant({ context }: AIChatAssistantProps) {
  const [open, setOpen]       = useState(false);
  const [input, setInput]     = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: `שלום! אני **Fleet AI**, עוזר חכם המחובר לנתוני הצי בזמן אמת.

אני יכול לעזור לך עם:
• פרטי רכב לפי לוחית רישוי
• מי הנהג של רכב
• קילומטראז' ומצב תחזוקה
• פרטי נהגים ומסמכים
• סטטיסטיקות כלליות על הצי

שאל אותי בעברית חופשית! 🚗`,
      timestamp: new Date(),
    },
  ]);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  // Scroll to bottom whenever messages change or panel opens
  useEffect(() => {
    if (open) {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
      inputRef.current?.focus();
    }
  }, [open, messages]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = {
      id:        Date.now().toString(),
      role:      'user',
      content:   text,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const reply = await processFleetQuery(text, context);

      const botMsg: Message = {
        id:        (Date.now() + 1).toString(),
        role:      'assistant',
        content:   reply,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, botMsg]);
    } catch (err) {
      console.error('[AIChatAssistant] send error:', err);
      setMessages(prev => [
        ...prev,
        { id: 'err-' + Date.now(), role: 'assistant', content: 'אירעה שגיאה. נסה שנית.', timestamp: new Date() },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const contextLabel =
    context?.vehicleLabel ? `רכב: ${context.vehicleLabel}` :
    context?.driverName   ? `נהג: ${context.driverName}`   :
    null;

  // ── Render message with light markdown (bold, links, newlines) ──
  const URL_RE = /(https?:\/\/[^\s)]+)/g;
  const renderContent = (content: string) => {
    return content.split('\n').map((line, i, arr) => {
      const parts = line.split(/\*\*(.+?)\*\*/g);
      return (
        <span key={i}>
          {parts.map((part, j) => {
            if (j % 2 === 1) {
              return <strong key={j} className="font-bold text-white">{part}</strong>;
            }
            if (URL_RE.test(part)) {
              URL_RE.lastIndex = 0;
              const chunks = part.split(URL_RE);
              return (
                <span key={j}>
                  {chunks.map((chunk, k) =>
                    chunk.match(/^https?:\/\//) ? (
                      <a key={k} href={chunk} target="_blank" rel="noopener noreferrer"
                         className="text-cyan-400 underline underline-offset-2 break-all hover:text-cyan-300">
                        🔗 פתח קובץ
                      </a>
                    ) : chunk,
                  )}
                </span>
              );
            }
            return part;
          })}
          {i < arr.length - 1 && <br />}
        </span>
      );
    });
  };

  return (
    <>
      {/* ── Floating Action Button ─────────────────────────────────────────── */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label={open ? 'סגור עוזר AI' : 'פתח עוזר AI'}
        className={`
          fixed bottom-6 left-5 z-50 h-14 w-14 rounded-full shadow-xl
          flex items-center justify-center transition-all duration-200
          ${open
            ? 'bg-slate-700 hover:bg-slate-600 shadow-slate-900/50'
            : 'bg-gradient-to-br from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 shadow-cyan-500/30'}
        `}
      >
        {open
          ? <ChevronDown className="h-6 w-6 text-white" />
          : <Bot className="h-6 w-6 text-white" />
        }
        {/* Unread indicator — shown when panel is closed and there are responses */}
        {!open && messages.length > 1 && (
          <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-cyan-400 border-2 border-[#020617] text-[9px] font-bold text-[#020617] flex items-center justify-center">
            AI
          </span>
        )}
      </button>

      {/* ── Chat Panel ────────────────────────────────────────────────────── */}
      <div
        className={`
          fixed bottom-24 left-5 z-50
          w-[22rem] sm:w-[26rem]
          flex flex-col
          rounded-2xl border border-white/10
          bg-[#0d1b2e]
          shadow-2xl shadow-black/60
          overflow-hidden
          transition-all duration-200 origin-bottom-left
          ${open ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-95 pointer-events-none'}
        `}
        style={{ maxHeight: '72vh' }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-cyan-900/40 to-blue-900/40 border-b border-white/10 shrink-0">
          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shrink-0 shadow-lg shadow-cyan-500/20">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm text-white leading-tight">Fleet AI Assistant</p>
            <p className="text-xs text-cyan-400/60 truncate">
              {contextLabel ?? 'מוכן לשאלות'}
            </p>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="text-white/30 hover:text-white/70 transition-colors p-1 rounded-lg hover:bg-white/5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
          {messages.map(msg => (
            <div
              key={msg.id}
              className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
            >
              {msg.role === 'assistant' && (
                <div className="h-7 w-7 rounded-full bg-gradient-to-br from-cyan-600 to-blue-700 flex items-center justify-center shrink-0 mt-0.5 shadow shadow-cyan-800/40">
                  <Bot className="h-3.5 w-3.5 text-white" />
                </div>
              )}
              <div className="flex flex-col gap-1 max-w-[82%]">
                <div
                  className={`
                    rounded-2xl px-3 py-2 text-sm leading-relaxed
                    ${msg.role === 'user'
                      ? 'bg-cyan-600 text-white rounded-tr-sm'
                      : 'bg-white/8 text-white/90 rounded-tl-sm border border-white/5'}
                  `}
                  dir="rtl"
                >
                  {renderContent(msg.content)}
                </div>
                <span className={`text-[10px] text-white/20 ${msg.role === 'user' ? 'text-left' : 'text-right'}`}>
                  {formatTime(msg.timestamp)}
                </span>
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {loading && (
            <div className="flex gap-2.5">
              <div className="h-7 w-7 rounded-full bg-gradient-to-br from-cyan-600 to-blue-700 flex items-center justify-center shrink-0">
                <Bot className="h-3.5 w-3.5 text-white" />
              </div>
              <div className="bg-white/8 border border-white/5 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-bounce [animation-delay:0ms]" />
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-bounce [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Context badge */}
        {context && (
          <div className="px-4 py-1.5 bg-cyan-950/40 border-t border-white/5 flex items-center gap-1.5">
            <span className="text-[10px] text-cyan-400/50 font-medium">קונטקסט פעיל:</span>
            <span className="text-[10px] text-cyan-300/60 truncate">{contextLabel}</span>
          </div>
        )}

        {/* Input area */}
        <div className="p-3 border-t border-white/10 bg-[#091423] shrink-0">
          <div className="flex gap-2 items-center">
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="שאל שאלה..."
              dir="rtl"
              disabled={loading}
              className="
                flex-1 bg-white/5 border border-white/10 rounded-xl
                px-3 py-2 text-sm text-white placeholder:text-white/25
                focus:outline-none focus:border-cyan-500/50 focus:bg-white/8
                disabled:opacity-50
                transition-colors
              "
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || loading}
              className="
                h-9 w-9 rounded-xl bg-cyan-600 hover:bg-cyan-500
                disabled:opacity-30 disabled:cursor-not-allowed
                flex items-center justify-center
                transition-colors shrink-0
              "
              aria-label="שלח"
            >
              {loading
                ? <Loader2 className="h-4 w-4 text-white animate-spin" />
                : <Send className="h-4 w-4 text-white" />
              }
            </button>
          </div>
          <p className="text-[10px] text-white/15 text-center mt-1.5 select-none">
            Fleet Manager AI · מחובר לנתוני Supabase בזמן אמת
          </p>
        </div>
      </div>
    </>
  );
}
