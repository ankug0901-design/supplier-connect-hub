import { useEffect, useMemo, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import ReactMarkdown from 'react-markdown';
import { Bot, Send, Sparkles, X, MessageCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

const SUGGESTIONS = [
  'What POs are pending?',
  'Show my recent invoices',
  'Have I been paid for invoice #...?',
  'Summarize my submission status',
];

export function SupplierAssistant() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setToken(data.session?.access_token ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setToken(session?.access_token ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/supplier-assistant`;

  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({
      api: fnUrl,
      headers: () => ({
        Authorization: `Bearer ${token ?? ''}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      }),
    }),
  });

  const isLoading = status === 'submitted' || status === 'streaming';

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, status]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open, messages.length, status]);

  const submit = (text?: string) => {
    const value = (text ?? input).trim();
    if (!value || isLoading || !token) return;
    sendMessage({ text: value });
    setInput('');
  };

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open AI assistant"
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-primary-foreground shadow-xl ring-4 ring-primary/20 transition hover:scale-105 hover:shadow-2xl"
        >
          <Sparkles className="h-5 w-5" />
          <span className="text-sm font-semibold">Ask AI</span>
        </button>
      )}

      {open && (
        <Card className="fixed bottom-6 right-6 z-50 flex h-[600px] max-h-[85vh] w-[400px] max-w-[calc(100vw-3rem)] flex-col overflow-hidden shadow-2xl">
          <div className="flex items-center justify-between border-b bg-gradient-primary p-4 text-primary-foreground">
            <div className="flex items-center gap-2">
              <div className="rounded-full bg-white/20 p-1.5">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-semibold">Portal Assistant</div>
                <div className="text-xs opacity-80">Ask about POs, invoices & payments</div>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setOpen(false)}
              className="h-8 w-8 text-primary-foreground hover:bg-white/20"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="space-y-3">
                <div className="flex items-start gap-2">
                  <div className="rounded-full bg-primary/10 p-1.5">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3 text-sm">
                    Hi! I can help you check your purchase orders, invoices, payments, and submission status. What would you like to know?
                  </div>
                </div>
                <div className="space-y-1.5 pt-2">
                  <div className="text-xs font-medium text-muted-foreground">Try asking:</div>
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => submit(s)}
                      className="block w-full rounded-md border border-border bg-card px-3 py-2 text-left text-xs transition hover:border-primary hover:bg-primary/5"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) => {
              const text = m.parts
                .map((p: any) => (p.type === 'text' ? p.text : ''))
                .join('');
              const isUser = m.role === 'user';
              return (
                <div key={m.id} className={cn('flex gap-2', isUser && 'flex-row-reverse')}>
                  {!isUser && (
                    <div className="rounded-full bg-primary/10 p-1.5 h-7 w-7 flex-shrink-0">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                  )}
                  <div
                    className={cn(
                      'max-w-[80%] rounded-lg px-3 py-2 text-sm',
                      isUser
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted/50 text-foreground'
                    )}
                  >
                    {isUser ? (
                      <div className="whitespace-pre-wrap">{text}</div>
                    ) : (
                      <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-1 prose-table:my-2 prose-th:px-2 prose-td:px-2">
                        <ReactMarkdown>{text || '...'}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {status === 'submitted' && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Thinking...
              </div>
            )}

            {error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                {error.message || 'Something went wrong. Please try again.'}
              </div>
            )}
          </div>

          <div className="border-t p-3">
            <div className="flex items-end gap-2">
              <Textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  }
                }}
                placeholder="Ask a question..."
                rows={1}
                className="min-h-[40px] max-h-32 resize-none"
                disabled={isLoading || !token}
              />
              <Button
                size="icon"
                onClick={() => submit()}
                disabled={isLoading || !input.trim() || !token}
                className="h-10 w-10 flex-shrink-0"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </Card>
      )}
    </>
  );
}
