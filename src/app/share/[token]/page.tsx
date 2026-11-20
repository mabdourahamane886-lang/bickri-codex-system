import { notFound } from "next/navigation";
import Link from "next/link";
import { Markdown } from "@/components/ai/Markdown";
import { createServerSupabase } from "@/lib/supabase/server";

type SharedMessage = { role: "user" | "assistant"; content: string };

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Conversation partagée · BCX",
  robots: { index: false, follow: false },
};

export default async function SharedConversationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) notFound();

  const supabase = await createServerSupabase();
  if (!supabase) notFound();
  const { data, error } = await supabase.rpc("bcx_get_shared_conversation", { p_token: token });
  if (error || !Array.isArray(data) || data.length !== 1) notFound();

  const conversation = data[0] as { title?: unknown; messages?: unknown };
  if (typeof conversation.title !== "string" || !Array.isArray(conversation.messages)) notFound();
  const messages = conversation.messages.filter((message): message is SharedMessage => Boolean(
    message && typeof message === "object"
      && ((message as SharedMessage).role === "user" || (message as SharedMessage).role === "assistant")
      && typeof (message as SharedMessage).content === "string",
  ));

  return (
    <main className="shared-conversation">
      <header className="shared-conversation-header">
        <Link className="shared-brand" href="/">BCX <span>AI</span></Link>
        <span>Conversation partagée · Lecture seule</span>
      </header>
      <article className="shared-conversation-content">
        <h1>{conversation.title}</h1>
        <p className="shared-conversation-note">Instantané en lecture seule. Les pièces jointes privées et les actions de compte ne sont pas incluses.</p>
        <div className="shared-message-list">
          {messages.map((message, index) => (
            <section className={`shared-message ${message.role}`} key={index}>
              <span>{message.role === "user" ? "Utilisateur" : "Bickri AI"}</span>
              <Markdown>{message.content}</Markdown>
            </section>
          ))}
        </div>
      </article>
    </main>
  );
}
