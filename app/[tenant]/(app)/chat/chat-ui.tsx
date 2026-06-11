"use client";

import { useRef, useState, useTransition } from "react";

import { enviarMensaje } from "./actions";
import type { ChatMessage } from "@/lib/ai/chat";
import { cn } from "@/lib/utils";

const SUGERENCIAS = [
  "¿Cuál fue la facturación este mes?",
  "¿Qué clientes están en riesgo?",
  "¿Cuántos clientes superaron el plazo de compra?",
  "Mostrame las ventas por rubro de los últimos 90 días",
];

export function ChatUI({ slug }: { slug: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  function enviar(texto: string) {
    const pregunta = texto.trim();
    if (!pregunta || pending) return;
    setError(null);
    const nuevo: ChatMessage[] = [...messages, { role: "user", content: pregunta }];
    setMessages(nuevo);
    setInput("");
    start(async () => {
      const res = await enviarMensaje(slug, nuevo);
      if (res.ok && res.reply) {
        setMessages((m) => [...m, { role: "assistant", content: res.reply! }]);
      } else {
        setError(res.error ?? "Error");
      }
      requestAnimationFrame(() =>
        endRef.current?.scrollIntoView({ behavior: "smooth" }),
      );
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="chat-area min-h-0 flex-1 space-y-4">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-gray-500">
              Preguntá en lenguaje natural sobre tus datos. Ejemplos:
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGERENCIAS.map((s) => (
                <button key={s} onClick={() => enviar(s)} className="tag-pill card-hover">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
          >
            <div
              className={cn(
                "whitespace-pre-wrap",
                m.role === "user" ? "chat-bubble-user" : "chat-bubble-ai",
              )}
            >
              {m.content}
            </div>
          </div>
        ))}
        {pending && (
          <div className="flex justify-start">
            <div className="chat-bubble-ai">
              <span className="chat-typing">
                <span />
                <span />
                <span />
              </span>
            </div>
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          enviar(input);
        }}
      >
        <div className="chat-input-wrap">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Escribí tu pregunta…"
          />
          <button type="submit" disabled={pending || !input.trim()} className="chat-send" aria-label="Enviar">
            <i className="ti ti-send" />
          </button>
        </div>
      </form>
    </div>
  );
}
