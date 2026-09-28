import React, { useState, useRef, useEffect } from 'react';
import {
  MessageSquare,
  X,
  Send,
  Sparkles,
  Bot,
  ExternalLink,
  HelpCircle,
  ShieldCheck,
  RotateCcw
} from 'lucide-react';
import { UserProfile } from '../types/index.js';

interface Message {
  id: string;
  sender: 'user' | 'agent' | 'support';
  sender_name?: string;
  text: string;
  time: string;
  showWhatsAppLink?: boolean;
}

interface LiveSupportChatProps {
  user?: UserProfile | null;
  isOpen?: boolean;
  onClose?: () => void;
  onOpen?: () => void;
}

export const LiveSupportChat: React.FC<LiveSupportChatProps> = ({
  user,
  isOpen: controlledIsOpen,
  onClose: controlledOnClose,
  onOpen: controlledOnOpen
}) => {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;

  // Session ID management
  const [sessionId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const stored = sessionStorage.getItem('betterajo_chat_session');
      if (stored) return stored;
      const cleanPhone = user?.phone ? user.phone.replace(/\s+/g, '').replace(/^\+234/, '0') : null;
      const newId = cleanPhone || `guest_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      sessionStorage.setItem('betterajo_chat_session', newId);
      return newId;
    }
    return 'chat_session_default';
  });

  const handleOpen = () => {
    if (controlledOnOpen) controlledOnOpen();
    setInternalIsOpen(true);
  };

  const handleClose = () => {
    if (controlledOnClose) controlledOnClose();
    setInternalIsOpen(false);
  };

  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome-1',
      sender: 'agent',
      sender_name: 'Better Ajo Live Support',
      text: `Hello ${user?.full_name ? user.full_name.split(' ')[0] : 'there'}! 👋 Welcome to **Better Ajo Live Support**.\n\nHow can I help you with your Personal Ajo, Group Rotations, or payments today? Our care desk is live right here to assist you.`,
      time: 'Just now'
    }
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Poll for messages from Support Secretary
  const syncServerMessages = async () => {
    if (!sessionId) return;
    try {
      const res = await fetch(`/api/support/messages?sessionId=${encodeURIComponent(sessionId)}`);
      const data = await res.json();
      if (data.messages && Array.isArray(data.messages) && data.messages.length > 0) {
        setMessages((prev) => {
          const map = new Map<string, Message>();
          const serverUserMsgs = data.messages.filter((sm: any) => sm.sender === 'user');

          // Keep existing local messages, reconciling temporary user-* messages that match server messages
          for (const m of prev) {
            if (m.id.startsWith('user-')) {
              const matchedServer = serverUserMsgs.find((sm: any) => sm.text.trim() === m.text.trim());
              if (matchedServer) {
                // Reconciled: server version will take its place with permanent ID
                continue;
              }
            }
            map.set(m.id, m);
          }

          // Merge server messages
          for (const sm of data.messages) {
            const mappedSender: 'user' | 'agent' | 'support' =
              sm.sender === 'user' ? 'user' : sm.sender === 'support' ? 'support' : 'agent';
            map.set(sm.id, {
              id: sm.id,
              sender: mappedSender,
              sender_name: sm.sender_name,
              text: sm.text,
              time: new Date(sm.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
          }
          return Array.from(map.values()).sort((a, b) => {
            if (a.id.startsWith('welcome-')) return -1;
            if (b.id.startsWith('welcome-')) return 1;
            return 0;
          });
        });
      }
    } catch (err) {
      // Background sync silent fail
    }
  };

  useEffect(() => {
    if (isOpen) {
      syncServerMessages();
      const interval = setInterval(syncServerMessages, 3500);
      return () => clearInterval(interval);
    }
  }, [isOpen, sessionId]);

  const quickQuestions = [
    'How does Personal Ajo work?',
    'How does Group Ajo rotation work?',
    'What are the platform fees?',
    'How do I withdraw my savings?',
    'Contact WhatsApp Support'
  ];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      setTimeout(scrollToBottom, 100);
      inputRef.current?.focus();
    }
  }, [isOpen, messages]);

  const handleSendMessage = async (customText?: string) => {
    const textToSend = (customText || inputMessage).trim();
    if (!textToSend || isLoading) return;

    const userMsgId = `user-${Date.now()}`;
    const userMsg: Message = {
      id: userMsgId,
      sender: 'user',
      text: textToSend,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputMessage('');
    setIsLoading(true);

    try {
      const historyPayload = messages.slice(-5).map((m) => ({
        role: m.sender === 'user' ? 'user' : 'model',
        text: m.text
      }));

      const res = await fetch('/api/support/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: textToSend,
          history: historyPayload,
          sessionId,
          user: user ? { id: user.id, phone: user.phone, name: user.full_name } : null
        })
      });

      const data = await res.json();
      const agentReply = data.reply || 'Thank you for reaching out. Our support secretary desk has received your request.';

      const isSupportStaff = data.agentMessage?.sender === 'support';
      const agentMsg: Message = {
        id: data.agentMessage?.id || `agent-${Date.now()}`,
        sender: isSupportStaff ? 'support' : 'agent',
        sender_name: isSupportStaff ? (data.agentMessage?.sender_name || 'Care Secretary') : 'Better Ajo Live Support',
        text: agentReply,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        showWhatsAppLink: textToSend.toLowerCase().includes('whatsapp')
      };

      // Reconcile optimistic user message with server-saved message and add agent reply
      const savedUserMsg = data.userMessage;
      setMessages((prev) => {
        const next = prev.map((m) => {
          if (m.id === userMsgId && savedUserMsg?.id) {
            return {
              ...m,
              id: savedUserMsg.id,
              time: new Date(savedUserMsg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            };
          }
          return m;
        });
        return [...next, agentMsg];
      });
    } catch (err) {
      console.error('Support chat request failed:', err);
      const errorMsg: Message = {
        id: `agent-${Date.now()}`,
        sender: 'agent',
        sender_name: 'Better Ajo Live Support',
        text: `We have received your message. If you ever need immediate voice/chat assistance outside this app, our WhatsApp line is +44 7451 298096.`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        showWhatsAppLink: true
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetChat = () => {
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        sender: 'agent',
        text: `Chat reset. Welcome to **Better Ajo Live Support**! Feel free to ask any question or tap a quick topic below.`,
        time: 'Just now'
      }
    ]);
  };

  // Format bold text and lists for crisp rendering
  const renderFormattedText = (text: string) => {
    const lines = text.split('\n');
    return lines.map((line, idx) => {
      // Process bold parts
      const parts = line.split(/(\*\*.*?\*\*)/g);
      return (
        <span key={idx} className="block leading-relaxed">
          {parts.map((part, pIdx) => {
            if (part.startsWith('**') && part.endsWith('**')) {
              return (
                <strong key={pIdx} className="font-bold text-slate-900">
                  {part.slice(2, -2)}
                </strong>
              );
            }
            return part;
          })}
        </span>
      );
    });
  };

  const whatsAppUrl =
    'https://wa.me/447451298096?text=Hello%20Better%20Ajo%20Customer%20Service%2C%20I%20need%20assistance%20with%20my%20Better%20Ajo%20account.%20Please%20help%20me.';

  return (
    <>
      {/* Floating Trigger Launcher Button */}
      {!isOpen && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-3">
          {/* Helpful callout pill */}
          <button
            onClick={handleOpen}
            className="hidden sm:inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-white border border-slate-200 text-slate-700 text-xs font-bold shadow-lg shadow-black/5 hover:border-[#008751] hover:text-[#008751] transition-all cursor-pointer animate-in fade-in slide-in-from-bottom-2 duration-300"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
            <span>Need Help? Live Support</span>
          </button>

          <button
            id="live-support-trigger-button"
            onClick={handleOpen}
            className="relative flex items-center justify-center w-14 h-14 rounded-full bg-[#008751] hover:bg-[#007345] text-white shadow-xl shadow-[#008751]/30 hover:scale-105 active:scale-95 transition-all cursor-pointer group"
            aria-label="Open Live Customer Support Chat"
            title="Open Better Ajo Live Customer Support"
          >
            <MessageSquare className="w-6 h-6 transition-transform group-hover:scale-110" />
            <span className="absolute -top-1 -right-1 flex h-4 w-4">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500 border-2 border-white"></span>
            </span>
          </button>
        </div>
      )}

      {/* Live Support Chat Window */}
      {isOpen && (
        <div
          id="live-support-chat-modal"
          className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 w-[94vw] sm:w-[400px] h-[86vh] sm:h-[600px] max-h-[700px] bg-white rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        >
          {/* Header */}
          <div className="bg-[#008751] text-white px-5 py-4 flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-3">
              <div className="relative flex items-center justify-center w-10 h-10 rounded-2xl bg-white/15 border border-white/20 text-white font-bold">
                <Bot className="w-5 h-5" />
                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[#008751]" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="text-sm font-black tracking-tight">Better Ajo Support</h3>
                  <span className="text-[10px] font-bold bg-white/20 px-1.5 py-0.2 rounded text-white uppercase">
                    Live
                  </span>
                </div>
                <p className="text-[11px] text-emerald-100 font-medium">
                  Typically replies instantly • 24/7
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={handleResetChat}
                title="Restart chat"
                className="p-2 text-emerald-100 hover:text-white hover:bg-white/10 rounded-xl transition cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <a
                href={whatsAppUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="Optional WhatsApp Channel (+44 7451 298096)"
                className="p-2 text-emerald-100 hover:text-white hover:bg-white/10 rounded-xl transition cursor-pointer"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
              {/* CLEAR X/CLOSE BUTTON */}
              <button
                id="close-live-chat-modal-btn"
                onClick={handleClose}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white/25 hover:bg-white/35 text-white text-xs font-black shadow-xs transition cursor-pointer border border-white/25 active:scale-95"
                title="Close Live Chat Window"
                aria-label="Close Live Chat Window"
              >
                <X className="w-4 h-4" />
                <span>CLOSE</span>
              </button>
            </div>
          </div>

          {/* Internal Live Support Desk Banner */}
          <div className="bg-[#E6F3ED] px-4 py-2 border-b border-[#008751]/15 flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 text-[#008751] font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Internal 24/7 Live Care Desk Connected</span>
            </div>
            <a
              href={whatsAppUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] font-semibold text-slate-600 hover:text-[#008751] hover:underline"
              title="Optional WhatsApp line"
            >
              WhatsApp (+44 7451 298096)
            </a>
          </div>

          {/* Message List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-slate-50/50">
            {messages.map((m) => {
              const isUser = m.sender === 'user';
              const isSecretary = m.sender === 'support';
              return (
                <div
                  key={m.id}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} animate-in fade-in duration-200`}
                >
                  {!isUser && (
                    <div className="flex items-center gap-1.5 mb-1 px-1 text-[10px] font-bold text-slate-500">
                      {isSecretary ? (
                        <span className="text-[#008751] font-black flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-emerald-500" />
                          {m.sender_name || 'Care Secretary'}
                        </span>
                      ) : (
                        <span className="text-slate-600 flex items-center gap-1">
                          <Bot className="w-3 h-3 text-[#008751]" />
                          {m.sender_name || 'Better Ajo Support'}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="flex items-end gap-2 max-w-[88%]">
                    {!isUser && (
                      <div
                        className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 mb-1 ${
                          isSecretary
                            ? 'bg-[#008751] text-white shadow-xs'
                            : 'bg-[#E6F3ED] text-[#008751] border border-[#008751]/20'
                        }`}
                      >
                        {isSecretary ? <ShieldCheck className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
                      </div>
                    )}
                    <div
                      className={`px-4 py-3 rounded-2xl text-xs ${
                        isUser
                          ? 'bg-[#008751] text-white shadow-xs font-medium'
                          : isSecretary
                          ? 'bg-white text-slate-900 border-2 border-emerald-500 shadow-xs'
                          : 'bg-white text-slate-800 border border-slate-200 shadow-xs'
                      }`}
                    >
                      {renderFormattedText(m.text)}

                      {m.showWhatsAppLink && (
                        <div className="mt-3 pt-2 border-t border-slate-100">
                          <a
                            href={whatsAppUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#008751] text-white font-bold text-[11px] hover:bg-[#007345] transition cursor-pointer"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span>Optional: Open WhatsApp (+44 7451 298096)</span>
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1 px-1">{m.time}</span>
                </div>
              );
            })}

            {isLoading && (
              <div className="flex items-end gap-2 max-w-[85%]">
                <div className="w-7 h-7 rounded-xl bg-[#E6F3ED] text-[#008751] border border-[#008751]/20 flex items-center justify-center shrink-0 mb-1">
                  <Bot className="w-3.5 h-3.5" />
                </div>
                <div className="px-4 py-3 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Questions Pills */}
          <div className="px-3 py-2 bg-white border-t border-slate-100 overflow-x-auto no-scrollbar flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0 mr-1 flex items-center gap-1">
              <HelpCircle className="w-3 h-3" /> Quick:
            </span>
            {quickQuestions.map((q, idx) => (
              <button
                key={idx}
                onClick={() => handleSendMessage(q)}
                disabled={isLoading}
                className="whitespace-nowrap px-2.5 py-1 rounded-full bg-slate-100 hover:bg-[#E6F3ED] hover:text-[#008751] text-slate-700 text-[11px] font-semibold transition cursor-pointer border border-transparent hover:border-[#008751]/20 shrink-0"
              >
                {q}
              </button>
            ))}
          </div>

          {/* Input Area */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="p-3 bg-white border-t border-slate-200 flex items-center gap-2"
          >
            <input
              ref={inputRef}
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Ask about savings, rotations, fees..."
              disabled={isLoading}
              className="flex-1 bg-slate-100 border border-transparent focus:border-[#008751] focus:bg-white text-slate-900 rounded-xl px-3.5 py-2.5 text-xs outline-hidden transition"
            />
            <button
              type="submit"
              disabled={!inputMessage.trim() || isLoading}
              className="p-2.5 rounded-xl bg-[#008751] hover:bg-[#007345] disabled:opacity-40 disabled:cursor-not-allowed text-white shadow-xs transition cursor-pointer shrink-0"
              title="Send message"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>

          {/* Tiny Footer info */}
          <div className="px-3 py-1 bg-slate-50 border-t border-slate-100 text-center text-[10px] text-slate-400">
            Powered by Better Ajo Instant Support • Safe & Verified
          </div>
        </div>
      )}
    </>
  );
};
