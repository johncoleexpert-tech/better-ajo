import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  Search,
  Send,
  RefreshCw,
  User,
  Phone,
  CheckCircle2,
  Clock,
  Shield,
  Bot,
  Sparkles,
  ArrowLeft,
  X
} from 'lucide-react';
import { SupportMessage } from '../../server/db.js';

interface ConversationSummary {
  session_id: string;
  user_name: string;
  user_phone?: string;
  user_id?: string;
  last_message: string;
  last_message_time: string;
  unread_count: number;
  messages_count: number;
}

interface SupportSecretaryDashboardProps {
  onBack?: () => void;
  secretaryName?: string;
}

export const SupportSecretaryDashboard: React.FC<SupportSecretaryDashboardProps> = ({
  onBack,
  secretaryName = 'Support Secretary'
}) => {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [replyText, setReplyText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchConversations = async () => {
    try {
      setError(null);
      const res = await fetch('/api/support/conversations');
      const data = await res.json();
      if (data.conversations) {
        setConversations(data.conversations);
        if (!activeSessionId && data.conversations.length > 0) {
          setActiveSessionId(data.conversations[0].session_id);
        }
      }
    } catch (err: any) {
      console.error('Failed to load support conversations:', err);
      setError('Unable to load conversations. Retrying...');
    } finally {
      setLoading(false);
    }
  };

  const fetchActiveMessages = async (sessionId: string) => {
    try {
      const res = await fetch(`/api/support/messages?sessionId=${encodeURIComponent(sessionId)}`);
      const data = await res.json();
      if (data.messages) {
        setMessages(data.messages);
      }
    } catch (err) {
      console.error('Failed to fetch messages for session:', err);
    }
  };

  useEffect(() => {
    fetchConversations();
    const interval = setInterval(fetchConversations, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (activeSessionId) {
      fetchActiveMessages(activeSessionId);
      const msgInterval = setInterval(() => fetchActiveMessages(activeSessionId), 3000);
      return () => clearInterval(msgInterval);
    }
  }, [activeSessionId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendReply = async (customText?: string) => {
    const textToSend = (customText || replyText).trim();
    if (!textToSend || !activeSessionId || sending) return;

    try {
      setSending(true);
      const res = await fetch('/api/support/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: activeSessionId,
          text: textToSend,
          supportName: secretaryName
        })
      });

      if (res.ok) {
        setReplyText('');
        fetchActiveMessages(activeSessionId);
        fetchConversations();
      }
    } catch (err: any) {
      console.error('Failed to send reply:', err);
    } finally {
      setSending(false);
    }
  };

  const filteredConversations = conversations.filter(
    (c) =>
      c.user_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.user_phone && c.user_phone.includes(searchQuery)) ||
      c.session_id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const activeConv = conversations.find((c) => c.session_id === activeSessionId);

  const quickReplies = [
    'Hello! This is Better Ajo Customer Support. How can I assist you with your savings or rotation today?',
    'Your account payment has been securely confirmed on Paystack.',
    'Group rotation positions are strictly locked in chronological order of joining.',
    'Personal Ajo withdrawals are transferred to your registered Nigerian bank account immediately following password verification.',
    'Our team has updated your account record. Please refresh your dashboard to view the update.'
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6 sm:py-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-6 border-b border-slate-200">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 transition cursor-pointer"
              title="Go back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#008751] text-white flex items-center justify-center shadow-lg shadow-[#008751]/20">
              <MessageSquare className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  Support & Secretary Live Desk
                </h1>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-[#E6F3ED] text-[#008751]">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Active
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Real-time customer inquiries, automated responses, and secretary intervention
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              fetchConversations();
              if (activeSessionId) fetchActiveMessages(activeSessionId);
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Refresh Threads</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium">
          {error}
        </div>
      )}

      {/* Main Grid: Sidebar + Chat Window */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden min-h-[620px]">
        {/* Left Panel: Conversation List */}
        <div className="lg:col-span-4 border-r border-slate-200 flex flex-col bg-slate-50/50">
          {/* Search Box */}
          <div className="p-4 border-b border-slate-200 bg-white">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search user name or phone..."
                className="w-full pl-9 pr-4 py-2 bg-slate-100 border border-transparent focus:border-[#008751] focus:bg-white text-xs text-slate-900 rounded-xl outline-hidden transition"
              />
            </div>
          </div>

          {/* Conversations list */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {loading ? (
              <div className="p-8 text-center text-xs text-slate-400">Loading conversation threads...</div>
            ) : filteredConversations.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                No conversations found. Inquiries from the website Live Chat will appear here in real-time.
              </div>
            ) : (
              filteredConversations.map((conv) => {
                const isSelected = conv.session_id === activeSessionId;
                return (
                  <button
                    key={conv.session_id}
                    onClick={() => setActiveSessionId(conv.session_id)}
                    className={`w-full text-left p-4 transition cursor-pointer flex flex-col gap-1.5 ${
                      isSelected ? 'bg-[#E6F3ED]/60 border-l-4 border-[#008751]' : 'hover:bg-slate-100/70'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-slate-900 truncate max-w-[150px]">
                          {conv.user_name}
                        </span>
                        {conv.unread_count > 0 && (
                          <span className="px-1.5 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-black">
                            {conv.unread_count} new
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400">
                        {new Date(conv.last_message_time).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-slate-500">
                      {conv.user_phone ? (
                        <span className="font-mono text-slate-600">{conv.user_phone}</span>
                      ) : (
                        <span className="italic text-slate-400">Web Visitor</span>
                      )}
                      <span>•</span>
                      <span>{conv.messages_count} msgs</span>
                    </div>

                    <p className="text-xs text-slate-600 line-clamp-1 leading-snug">{conv.last_message}</p>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Panel: Active Chat & Secretary Response Console */}
        <div className="lg:col-span-8 flex flex-col bg-white">
          {activeConv ? (
            <>
              {/* Header */}
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#008751]/10 text-[#008751] flex items-center justify-center font-bold">
                    <User className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-black text-slate-900">{activeConv.user_name}</h2>
                      <span className="text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-mono">
                        {activeConv.session_id}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                      {activeConv.user_phone && (
                        <span className="flex items-center gap-1 font-mono text-slate-700">
                          <Phone className="w-3 h-3 text-[#008751]" /> {activeConv.user_phone}
                        </span>
                      )}
                      <span>•</span>
                      <span className="text-emerald-700 font-semibold">Live Live Chat Connection</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500">Desk:</span>
                  <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-800 text-xs font-bold">
                    {secretaryName}
                  </span>
                </div>
              </div>

              {/* Message Thread */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/40">
                {messages.length === 0 ? (
                  <div className="text-center py-12 text-xs text-slate-400">
                    No message history in this thread yet.
                  </div>
                ) : (
                  messages.map((m) => {
                    const isUser = m.sender === 'user';
                    const isSecretary = m.sender === 'support';
                    const isAssistant = m.sender === 'assistant';

                    return (
                      <div
                        key={m.id}
                        className={`flex flex-col ${isUser ? 'items-start' : 'items-end'}`}
                      >
                        <div className="flex items-center gap-1.5 mb-1 px-1">
                          <span className="text-[11px] font-bold text-slate-700">
                            {isUser
                              ? m.sender_name || 'Customer'
                              : isSecretary
                              ? `Secretary: ${m.sender_name}`
                              : 'Better Ajo AI Support'}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {new Date(m.created_at).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        </div>

                        <div
                          className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs leading-relaxed ${
                            isUser
                              ? 'bg-white border border-slate-200 text-slate-900 shadow-xs'
                              : isSecretary
                              ? 'bg-[#008751] text-white shadow-xs font-medium'
                              : 'bg-emerald-50 border border-emerald-200 text-slate-800'
                          }`}
                        >
                          <div className="whitespace-pre-line">{m.text}</div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Quick Reply Presets */}
              <div className="px-4 py-2 bg-slate-50 border-t border-slate-200 overflow-x-auto no-scrollbar flex items-center gap-2">
                <span className="text-[10px] uppercase font-bold text-slate-400 shrink-0">Quick Answers:</span>
                {quickReplies.map((qr, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSendReply(qr)}
                    disabled={sending}
                    className="whitespace-nowrap px-3 py-1 rounded-full bg-white hover:bg-[#E6F3ED] hover:text-[#008751] text-slate-600 text-[11px] font-semibold border border-slate-200 transition cursor-pointer shrink-0 disabled:opacity-50"
                  >
                    {qr.slice(0, 35)}...
                  </button>
                ))}
              </div>

              {/* Reply Input Form */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendReply();
                }}
                className="p-4 border-t border-slate-200 bg-white flex items-center gap-3"
              >
                <input
                  type="text"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder={`Type an official secretary response to ${activeConv.user_name}...`}
                  disabled={sending}
                  className="flex-1 px-4 py-3 bg-slate-100 border border-transparent focus:border-[#008751] focus:bg-white text-xs text-slate-900 rounded-xl outline-hidden transition"
                />
                <button
                  type="submit"
                  disabled={!replyText.trim() || sending}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl bg-[#008751] hover:bg-[#007345] text-white text-xs font-bold shadow-md transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  <span>{sending ? 'Sending...' : 'SEND REPLY'}</span>
                </button>
              </form>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-slate-400">
              <MessageSquare className="w-12 h-12 text-slate-300 mb-3" />
              <h3 className="text-sm font-bold text-slate-700 mb-1">No Active Conversation Selected</h3>
              <p className="text-xs text-slate-500 max-w-sm">
                Select a user thread from the left to view their support questions and provide official answers.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
