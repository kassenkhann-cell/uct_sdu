import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { BarChart3, MessageCircle, Send, X } from "lucide-react";
import { askDashboardAssistant, type ChatMessage } from "../api";

const starterPrompts = [
  "Подготовь краткий отчёт по Хромтаускому району",
  "Сравни Хромтауский и Байганинский районы",
  "Какие районы требуют первоочередного решения?",
  "Составь план действий по Мугалжарскому району на 90 дней",
];

function formatInline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={`${part}-${index}`}>{part.slice(2, -2)}</strong>
    ) : (
      part
    ),
  );
}

function MessageContent({ content }: { content: string }) {
  return content.split("\n").map((line, index) => (
    <span key={`${line}-${index}`} className={line.startsWith("- ") ? "assistant-line--bullet" : ""}>
      {line.startsWith("- ") ? "• " : ""}
      {formatInline(line.replace(/^- /, ""))}
      {index < content.split("\n").length - 1 && <br />}
    </span>
  ));
}

export function AssistantChat() {
  const chatEnabled =
    import.meta.env.VITE_CHAT_ENABLED === "true" ||
    !window.location.hostname.endsWith("github.io");
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Напишите район прямо в вопросе — например: «почему высокий риск в Хромтауском районе?». Если район не указан, я проанализирую всю область.",
    },
  ]);
  const [loading, setLoading] = useState(false);
  const [model, setModel] = useState("DeepSeek V4 Pro");
  const [scope, setScope] = useState("Вся область");
  const messageEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const send = async (question: string) => {
    const message = question.trim();
    if (!message || loading) return;
    const history = messages.filter((item, index) => index > 0).slice(-6);
    setMessages((current) => [...current, { role: "user", content: message }]);
    setInput("");
    setLoading(true);
    try {
      const result = await askDashboardAssistant({
        message,
        history,
      });
      setModel(result.model || "DeepSeek V4 Pro");
      setScope(result.scope || "Вся область");
      setMessages((current) => [
        ...current,
        { role: "assistant", content: result.answer },
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content:
            "Сейчас не удаётся подключиться к защищённому серверу аналитика. Данные дашборда продолжают работать — попробуйте задать вопрос позже.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void send(input);
  };

  if (!chatEnabled) return null;

  return (
    <div className={`assistant-chat ${open ? "assistant-chat--open" : ""}`}>
      {open && (
        <section className="assistant-chat__panel" aria-label="Аналитик данных">
          <header className="assistant-chat__header">
            <div className="assistant-chat__identity">
              <span><BarChart3 size={18} /></span>
              <div>
                <strong>Аналитик данных</strong>
                <small>{model} · контекст: {scope}</small>
              </div>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Закрыть чат">
              <X size={18} />
            </button>
          </header>

          <div className="assistant-chat__messages" aria-live="polite">
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`assistant-message assistant-message--${message.role}`}
              >
                <MessageContent content={message.content} />
              </div>
            ))}
            {loading && (
              <div className="assistant-message assistant-message--assistant assistant-message--loading">
                Анализирую показатели…
              </div>
            )}
            <div ref={messageEndRef} />
          </div>

          {messages.length <= 1 && (
            <div className="assistant-chat__starters">
              {starterPrompts.map((prompt) => (
                <button key={prompt} type="button" onClick={() => void send(prompt)}>
                  {prompt}
                </button>
              ))}
            </div>
          )}

          <form className="assistant-chat__form" onSubmit={submit}>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send(input);
                }
              }}
              maxLength={2000}
              rows={2}
              placeholder="Например: почему высокий риск в Хромтауском районе?"
              aria-label="Вопрос аналитику"
            />
            <button type="submit" disabled={!input.trim() || loading} aria-label="Отправить">
              <Send size={17} />
            </button>
          </form>
          <p className="assistant-chat__notice">
            Ответ формируется по текущему набору данных и требует проверки перед официальным использованием.
          </p>
        </section>
      )}

      <button
        className="assistant-chat__launcher"
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        {open ? <X size={19} /> : <MessageCircle size={19} />}
        <span>{open ? "Закрыть" : "Спросить аналитика"}</span>
      </button>
    </div>
  );
}
