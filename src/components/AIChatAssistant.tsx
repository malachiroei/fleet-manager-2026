import { useState, useRef, useEffect, KeyboardEvent, ChangeEvent } from 'react';
import { Bot, X, Send, Loader2, Sparkles, ChevronDown, Paperclip, ArrowUpRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { processFleetQuery } from '@/lib/aiQueryEngine';
import {
  detectFlowIntent,
  initFlow,
  currentField,
  advanceFlow,
  handleConfirmation,
  buildSummary,
  executeFlow,
  type FlowState,
} from '@/lib/botFlowEngine';

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Types
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/** Context injected from the current page so the AI knows what the user is looking at. */
export interface AIChatContext {
  type?: 'vehicle' | 'driver' | 'general';
  vehicleLabel?: string;
  driverName?: string;
  vehicleId?: string;
  driverId?: string;
  [key: string]: unknown;
}

interface MessageAction {
  label: string;
  href: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  action?: MessageAction;
}

interface AIChatAssistantProps {
  context?: AIChatContext;
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Helpers
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function formatTime(d: Date) {
  return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

const WELCOME_MSG = `×©×œ×•×! ×× ×™ **Fleet AI**, ×¢×•×–×¨ ×—×›× ×”×ž×—×•×‘×¨ ×œ× ×ª×•× ×™ ×”×¦×™ ×‘×–×ž×Ÿ ××ž×ª.

×× ×™ ×™×›×•×œ ×œ×¢×–×•×¨ ×œ×š ×¢×:
â€¢ ×¤×¨×˜×™ ×¨×›×‘ ×œ×¤×™ ×œ×•×—×™×ª ×¨×™×©×•×™
â€¢ ×ž×™ ×”× ×”×’ ×©×œ ×¨×›×‘ / ×¨×›×‘×™× ×œ×œ× × ×”×’
â€¢ ×§×™×œ×•×ž×˜×¨××–' ×•×ž×¦×‘ ×ª×—×–×•×§×”
â€¢ ×©××œ×•×ª ×¢×œ **× ×•×”×œ 04-05-001** (× ×–×§, ××—×¨×™×•×ª, ×”×©×ª×ª×¤×•×ª ×¢×¦×ž×™×ª)
â€¢ **×”×§×ž×ª × ×”×’ ×—×“×©** â€” ×›×ª×•×‘ "×”×§× × ×”×’"
â€¢ **×”×§×ž×ª ×¨×›×‘ ×—×“×©** â€” ×›×ª×•×‘ "×”×§× ×¨×›×‘"

×©××œ ××•×ª×™ ×‘×¢×‘×¨×™×ª ×—×•×¤×©×™×ª! ðŸš—`;

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Component
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function AIChatAssistant({ context }: AIChatAssistantProps) {
  const navigate = useNavigate();

  const [open, setOpen]               = useState(false);
  const [input, setInput]             = useState('');
  const [loading, setLoading]         = useState(false);
  const [messages, setMessages]       = useState<Message[]>([
    { id: 'welcome', role: 'assistant', content: WELCOME_MSG, timestamp: new Date() },
  ]);

  // Flow state
  const [flowState, setFlowState]                 = useState<FlowState | null>(null);
  const [awaitingConfirm, setAwaitingConfirm]     = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);
  const fileRef   = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
      inputRef.current?.focus();
    }
  }, [open, messages]);

  // â”€â”€ Add messages â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const addBot = (content: string, action?: MessageAction) =>
    setMessages(prev => [...prev, { id: 'bot-' + Date.now(), role: 'assistant', content, timestamp: new Date(), action }]);

  const addUser = (content: string) =>
    setMessages(prev => [...prev, { id: 'usr-' + Date.now(), role: 'user', content, timestamp: new Date() }]);

  // â”€â”€ File picked during a flow step â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleFilePicked = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!flowState || !file) return;
    addUser(`ðŸ“Ž ${file.name}`);

    const { nextState, prompt, showSummary, cancelled } = advanceFlow(flowState, file.name, file);

    if (cancelled) { setFlowState(null); addBot('×”×¤×¢×•×œ×” ×‘×•×˜×œ×”. ×›×™×¦×“ ××•×›×œ ×œ×¢×–×•×¨?'); return; }
    setFlowState(nextState);
    if (showSummary) { setAwaitingConfirm(true); addBot(buildSummary(nextState)); }
    else if (prompt) addBot(prompt);
    e.target.value = '';
  };

  // â”€â”€ Main send handler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');

    // CASE 1: Collecting flow fields
    if (flowState && !awaitingConfirm) {
      addUser(text);
      const { nextState, prompt, error, showSummary, cancelled } = advanceFlow(flowState, text);

      if (cancelled) { setFlowState(null); addBot('×”×¤×¢×•×œ×” ×‘×•×˜×œ×”. ×›×™×¦×“ ××•×›×œ ×œ×¢×–×•×¨?'); return; }
      if (error)     { addBot(`âš ï¸ ${error}`); return; }
      setFlowState(nextState);
      if (showSummary) { setAwaitingConfirm(true); addBot(buildSummary(nextState)); return; }
      if (prompt) addBot(prompt);
      return;
    }

    // CASE 2: Awaiting ×›×Ÿ / ×œ× confirmation
    if (flowState && awaitingConfirm) {
      const answer = handleConfirmation(text);
      addUser(text);

      if (answer === 'no') {
        setFlowState(null); setAwaitingConfirm(false);
        addBot('×”×¤×¢×•×œ×” ×‘×•×˜×œ×”. × ×™×ª×Ÿ ×œ×”×ª×—×™×œ ×ž×—×“×© ×‘×›×œ ×¢×ª.');
        return;
      }
      if (answer === 'invalid') {
        addBot('× × ×œ×›×ª×•×‘ **×›×Ÿ** ×œ××™×©×•×¨ ×©×ž×™×¨×”, ××• **×œ×** ×œ×‘×™×˜×•×œ.');
        return;
      }

      // Execute!
      setAwaitingConfirm(false);
      setLoading(true);
      addBot('â³ ×©×•×ž×¨ × ×ª×•× ×™×...');

      const result = await executeFlow(flowState);
      setLoading(false);
      setFlowState(null);

      if (!result.success) {
        addBot(`âŒ ×©×’×™××” ×‘×©×ž×™×¨×”: ${result.error ?? '×©×’×™××” ×œ× ×™×“×•×¢×”'}`);
        return;
      }

      const isDriver = result.entityType === 'create_driver';
      const path     = isDriver ? `/drivers/${result.entityId}` : `/vehicles/${result.entityId}`;
      const label    = isDriver ? '×¦×¤×” ×‘×›×¨×˜×™×¡ ×”× ×”×’ ×”×—×“×©' : '×¦×¤×” ×‘×›×¨×˜×™×¡ ×”×¨×›×‘ ×”×—×“×©';
      const emoji    = isDriver ? 'ðŸ‘¤' : 'ðŸš—';

      addBot(
        `${emoji} **×”×”×§×ž×” ×”×•×©×œ×ž×” ×‘×”×¦×œ×—×”!**\n×”× ×ª×•× ×™× × ×©×ž×¨×• ×‘×ž×¢×¨×›×ª. ×œ×—×¥ ×¢×œ ×”×›×¤×ª×•×¨ ×œ×ž×˜×” ×œ×¦×¤×™×™×”.`,
        { label, href: path },
      );
      return;
    }

    // CASE 3: Detect new flow intent
    const flowType = detectFlowIntent(text);
    if (flowType) {
      addUser(text);
      const newFlow = initFlow(flowType);
      const first   = currentField(newFlow);
      setFlowState(newFlow);
      const intro = flowType === 'create_driver'
        ? 'ðŸ‘¤ **×”×§×ž×ª × ×”×’ ×—×“×©** â€” ×××¡×•×£ ×›×ž×” ×¤×¨×˜×™×.\n×‘×›×œ ×©×œ×‘ × ×™×ª×Ÿ ×œ×›×ª×•×‘ **"×‘×™×˜×•×œ"** ×œ×¢×¦×™×¨×”.\n\n'
        : 'ðŸš— **×”×§×ž×ª ×¨×›×‘ ×—×“×©** â€” ×××¡×•×£ ×›×ž×” ×¤×¨×˜×™×.\n×‘×›×œ ×©×œ×‘ × ×™×ª×Ÿ ×œ×›×ª×•×‘ **"×‘×™×˜×•×œ"** ×œ×¢×¦×™×¨×”.\n\n';
      addBot(intro + first.prompt);
      return;
    }

    // CASE 4: Normal AI query
    addUser(text);
    setLoading(true);
    try {
      const reply = await processFleetQuery(text, context);
      addBot(reply);
    } catch {
      addBot('××™×¨×¢×” ×©×’×™××”. × ×¡×” ×©× ×™×ª.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const contextLabel =
    context?.vehicleLabel ? `×¨×›×‘: ${context.vehicleLabel}` :
    context?.driverName   ? `× ×”×’: ${context.driverName}`   :
    null;

  // Is current flow step expecting a file?
  const currentStepIsFile =
    flowState && !awaitingConfirm && currentField(flowState)?.inputType === 'file';

  // Flow progress
  const flowProgress = flowState
    ? { current: flowState.stepIndex, total: flowState.type === 'create_driver' ? 8 : 7, label: flowState.type === 'create_driver' ? '×”×§×ž×ª × ×”×’' : '×”×§×ž×ª ×¨×›×‘' }
    : null;

  // â”€â”€ Render message text â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const URL_RE = /(https?:\/\/[^\s)]+)/g;
  const renderContent = (content: string) =>
    content.split('\n').map((line, i, arr) => {
      const parts = line.split(/\*\*(.+?)\*\*/g);
      return (
        <span key={i}>
          {parts.map((part, j) => {
            if (j % 2 === 1) return <strong key={j} className="font-bold">{part}</strong>;
            URL_RE.lastIndex = 0;
            if (URL_RE.test(part)) {
              URL_RE.lastIndex = 0;
              const chunks = part.split(URL_RE);
              return (
                <span key={j}>
                  {chunks.map((chunk, k) =>
                    chunk.match(/^https?:\/\//) ? (
                      <a key={k} href={chunk} target="_blank" rel="noopener noreferrer"
                         className="text-cyan-400 underline underline-offset-2 break-all hover:text-cyan-300">
                        ðŸ”— ×¤×ª×— ×§×•×‘×¥
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

  return (
    <>
      {/* â”€â”€ FAB â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label={open ? '×¡×’×•×¨ ×¢×•×–×¨ AI' : '×¤×ª×— ×¢×•×–×¨ AI'}
        className={`
          fixed bottom-[6.75rem] left-5 z-50 h-14 w-14 rounded-full shadow-xl
          flex items-center justify-center transition-all duration-200
          ${open
            ? 'bg-slate-700 hover:bg-slate-600 shadow-slate-900/50'
            : 'bg-gradient-to-br from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 shadow-cyan-500/30'}
        `}
      >
        {open ? <ChevronDown className="h-6 w-6 text-white" /> : <Bot className="h-6 w-6 text-white" />}
        {!open && messages.length > 1 && (
          <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-cyan-400 border-2 border-[#020617] text-[9px] font-bold text-[#020617] flex items-center justify-center">
            AI
          </span>
        )}
      </button>

      {/* â”€â”€ Chat Panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div
        className={`
          fixed bottom-[11.25rem] left-5 z-50
          w-[22rem] sm:w-[26rem]
          flex flex-col
          rounded-2xl border border-white/10
          bg-[#0d1b2e]
          shadow-2xl shadow-black/60
          overflow-hidden
          transition-all duration-200 origin-bottom-left
          ${open ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-95 pointer-events-none'}
        `}
        style={{ maxHeight: '76vh' }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-cyan-900/40 to-blue-900/40 border-b border-white/10 shrink-0">
          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shrink-0 shadow-lg shadow-cyan-500/20">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm text-white leading-tight">Fleet AI Assistant</p>
            <p className="text-xs text-cyan-400/60 truncate">
              {flowProgress
                ? `${flowProgress.label} Â· ×©×œ×‘ ${Math.min(flowProgress.current + 1, flowProgress.total)} / ${flowProgress.total}`
                : contextLabel ?? '×ž×•×›×Ÿ ×œ×©××œ×•×ª'}
            </p>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="text-white/30 hover:text-white/70 transition-colors p-1 rounded-lg hover:bg-white/5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Progress bar during flow */}
        {flowProgress && (
          <div className="h-1 bg-white/5 shrink-0">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-500"
              style={{ width: `${Math.min(100, (flowProgress.current / flowProgress.total) * 100)}%` }}
            />
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
          {messages.map(msg => (
            <div key={msg.id} className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
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

                {/* Action button */}
                {msg.action && (
                  <button
                    onClick={() => { navigate(msg.action!.href); setOpen(false); }}
                    className="
                      mt-1 flex items-center gap-1.5 px-3 py-1.5 rounded-xl
                      bg-gradient-to-r from-cyan-600 to-blue-600
                      hover:from-cyan-500 hover:to-blue-500
                      text-white text-xs font-bold
                      shadow shadow-cyan-900/40 transition-all duration-150
                      self-start
                    "
                    dir="rtl"
                  >
                    <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />
                    {msg.action.label}
                  </button>
                )}

                <span className={`text-[10px] text-white/20 ${msg.role === 'user' ? 'text-left' : 'text-right'}`}>
                  {formatTime(msg.timestamp)}
                </span>
              </div>
            </div>
          ))}

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
        {context && !flowProgress && (
          <div className="px-4 py-1.5 bg-cyan-950/40 border-t border-white/5 flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] text-cyan-400/50 font-medium">×§×•× ×˜×§×¡×˜ ×¤×¢×™×œ:</span>
            <span className="text-[10px] text-cyan-300/60 truncate">{contextLabel}</span>
          </div>
        )}

        {/* Input area */}
        <div className="p-3 border-t border-white/10 bg-[#091423] shrink-0">
          {/* File upload shown only during file-type flow steps */}
          {currentStepIsFile && (
            <div className="mb-2 flex justify-center">
              <label
                htmlFor="bot-file-input"
                className="
                  flex items-center gap-2 px-4 py-2 rounded-xl
                  bg-cyan-600/20 border border-cyan-500/40 text-cyan-300
                  text-xs font-bold cursor-pointer
                  hover:bg-cyan-600/30 hover:border-cyan-500/60
                  transition-colors
                "
              >
                <Paperclip className="h-3.5 w-3.5" />
                ×¦×¨×£ ×§×•×‘×¥ / ×ª×ž×•× ×”
              </label>
              <input
                id="bot-file-input"
                ref={fileRef}
                type="file"
                accept="image/*,.pdf"
                className="hidden"
                onChange={handleFilePicked}
              />
            </div>
          )}

          <div className="flex gap-2 items-center">
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                awaitingConfirm     ? '×›×ª×•×‘ "×›×Ÿ" ×œ××™×©×•×¨ ××• "×œ×" ×œ×‘×™×˜×•×œ...' :
                currentStepIsFile   ? '××• ×›×ª×•×‘ "×“×œ×’" ×œ×“×™×œ×•×’...' :
                '×©××œ ×©××œ×”...'
              }
              dir="rtl"
              disabled={loading}
              className="
                flex-1 bg-white/5 border border-white/10 rounded-xl
                px-3 py-2 text-sm text-white placeholder:text-white/25
                focus:outline-none focus:border-cyan-500/50 focus:bg-white/8
                disabled:opacity-50 transition-colors
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
              aria-label="×©×œ×—"
            >
              {loading
                ? <Loader2 className="h-4 w-4 text-white animate-spin" />
                : <Send className="h-4 w-4 text-white" />
              }
            </button>
          </div>
          <p className="text-[10px] text-white/15 text-center mt-1.5 select-none">
            Fleet Manager AI Â· ×ž×—×•×‘×¨ ×œ× ×ª×•× ×™ Supabase ×‘×–×ž×Ÿ ××ž×ª
          </p>
        </div>
      </div>
    </>
  );
}
