import { ChatUI } from "./chat-ui";

export default function ChatPage({ params }: { params: { tenant: string } }) {
  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden">
      <div className="space-y-1">
        <h1 className="section-title">Chat IA</h1>
        <p className="text-sm text-gray-500">
          Consultas en lenguaje natural sobre tu base. Las respuestas se calculan
          con funciones seguras y respetan tus permisos.
        </p>
      </div>
      <ChatUI slug={params.tenant} />
    </div>
  );
}
