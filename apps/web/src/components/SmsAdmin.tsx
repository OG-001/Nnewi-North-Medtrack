/**
 * SMS administration: the editable template library and the send log.
 *
 * SMS dispatch lives at the hub, so this whole surface needs connectivity. It
 * says so plainly when the hub is unreachable rather than showing an empty
 * state that looks like "no messages".
 */
import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_SMS_TEMPLATES,
  LANGUAGES,
  renderTemplate,
  segmentCount,
  validateTemplateBody,
  type Language,
  type SmsTemplateKey,
} from "@phc/shared";
import { Badge, EmptyState, StatCard } from "./ui";
import {
  fetchMessages,
  fetchStats,
  fetchTemplates,
  saveTemplate,
  smsAvailable,
  type HubSmsMessage,
  type HubSmsStats,
  type HubSmsTemplate,
} from "../lib/sms-api";
import { useSession } from "../lib/session";

/** Preview values, so an admin sees a realistic message while editing. */
const PREVIEW_FIELDS = {
  name: "Ngozi Eze",
  date: "12 Sep 2026",
  facility: "PHC Umuenem Otolo",
  message: "the clinic opens at 8am on Monday",
};

export function SmsAdmin() {
  const { can } = useSession();
  const [templates, setTemplates] = useState<HubSmsTemplate[] | null>(null);
  const [messages, setMessages] = useState<HubSmsMessage[]>([]);
  const [stats, setStats] = useState<HubSmsStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [t, m, s] = await Promise.all([fetchTemplates(), fetchMessages({ limit: 50 }), fetchStats()]);
      setTemplates(t);
      setMessages(m);
      setStats(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reach the sync hub");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (smsAvailable()) void load();
    else setLoading(false);
  }, [load]);

  if (!smsAvailable()) {
    return (
      <EmptyState
        title="Not signed in to the sync hub"
        hint="SMS is dispatched from the central hub, so this screen needs a connection. Clinical work continues offline as normal."
      />
    );
  }

  if (loading) return <p className="p-4 text-sm text-slate-400">Loading…</p>;

  if (error) {
    return (
      <EmptyState
        title="Sync hub unreachable"
        hint={`${error}. Reminders already queued will be dispatched when the hub is reachable again.`}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Delivered" value={stats?.byStatus.delivered ?? 0} tone="good" />
        <StatCard label="Sent / queued" value={(stats?.byStatus.sent ?? 0) + (stats?.byStatus.queued ?? 0)} />
        <StatCard
          label="Skipped (no consent)"
          value={stats?.byStatus.skipped_no_consent ?? 0}
          tone={stats?.byStatus.skipped_no_consent ? "warn" : "default"}
        />
        <StatCard label="Failed" value={stats?.byStatus.failed ?? 0} tone={stats?.byStatus.failed ? "alert" : "default"} />
      </div>

      <TemplateLibrary
        templates={templates ?? []}
        canEdit={can("sms.template.edit")}
        onSaved={load}
      />

      <SendLog messages={messages} />
    </div>
  );
}

function TemplateLibrary({
  templates,
  canEdit,
  onSaved,
}: {
  templates: HubSmsTemplate[];
  canEdit: boolean;
  onSaved: () => void;
}) {
  const [openKey, setOpenKey] = useState<SmsTemplateKey | null>(null);

  return (
    <section>
      <h3 className="mb-2 font-semibold text-slate-700">Message templates</h3>
      <p className="mb-3 text-xs text-slate-500">
        Templates are configuration, not code: an edit takes effect for the next send, with no
        deployment. A patient receives the variant matching their recorded language.
      </p>
      <div className="divide-y divide-slate-100 rounded-lg border border-slate-100">
        {templates.map((template) => (
          <div key={template.key}>
            <button
              type="button"
              onClick={() => setOpenKey(openKey === template.key ? null : template.key)}
              className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-brand-50"
            >
              <div>
                <div className="font-medium text-slate-800">{template.description}</div>
                <div className="mt-0.5 font-mono text-[11px] text-slate-400">{template.key}</div>
              </div>
              <span className="text-xs text-slate-400">{openKey === template.key ? "Close" : "Edit"}</span>
            </button>
            {openKey === template.key && (
              <TemplateEditor template={template} canEdit={canEdit} onSaved={onSaved} />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function TemplateEditor({
  template,
  canEdit,
  onSaved,
}: {
  template: HubSmsTemplate;
  canEdit: boolean;
  onSaved: () => void;
}) {
  const [bodies, setBodies] = useState<Record<Language, string>>({ ...template.bodies });
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const problems = LANGUAGES.flatMap((lang) =>
    validateTemplateBody(bodies[lang]).map((p) => `${lang.toUpperCase()}: ${p.issue}`),
  );

  async function save() {
    setBusy(true);
    setSaveError(null);
    try {
      await saveTemplate(template.key, { en: bodies.en, ig: bodies.ig }, template.description);
      setSaved(true);
      onSaved();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 border-t border-slate-100 bg-slate-50/60 px-4 py-4">
      {LANGUAGES.map((lang) => (
        <div key={lang}>
          <label className="label">
            {lang === "en" ? "English" : "Igbo"}
            <span className="ml-2 font-normal text-slate-400">
              {bodies[lang].length} chars · {segmentCount(bodies[lang])} segment
              {segmentCount(bodies[lang]) === 1 ? "" : "s"}
            </span>
          </label>
          <textarea
            className="input min-h-[4.5rem] font-mono text-xs"
            value={bodies[lang]}
            disabled={!canEdit}
            onChange={(e) => {
              setBodies({ ...bodies, [lang]: e.target.value });
              setSaved(false);
            }}
          />
          <p className="mt-1 rounded bg-white px-2 py-1.5 text-xs text-slate-600">
            <span className="text-slate-400">Preview: </span>
            {renderTemplate(bodies[lang], PREVIEW_FIELDS)}
          </p>
        </div>
      ))}

      <p className="text-xs text-slate-400">
        Merge fields: {"{{name}}"} {"{{date}}"} {"{{facility}}"} {"{{message}}"}
      </p>

      {problems.length > 0 && (
        <ul className="space-y-0.5 text-xs text-red-600">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {saveError && <p className="text-xs text-red-600">{saveError}</p>}

      {canEdit ? (
        <div className="flex items-center gap-2">
          <button
            className="btn-primary"
            disabled={busy || problems.length > 0}
            onClick={() => void save()}
          >
            {busy ? "Saving…" : "Save template"}
          </button>
          <button
            className="btn-secondary"
            onClick={() => {
              setBodies({ ...DEFAULT_SMS_TEMPLATES[template.key].bodies });
              setSaved(false);
            }}
          >
            Reset to default
          </button>
          {saved && <span className="text-xs text-brand-700">Saved</span>}
        </div>
      ) : (
        <p className="text-xs text-slate-400">
          Your role can send messages but not edit templates.
        </p>
      )}
    </div>
  );
}

/** Badge tones, which are the palette names rather than semantic names. */
const STATUS_TONE: Record<string, "green" | "amber" | "red" | "slate"> = {
  delivered: "green",
  sent: "slate",
  queued: "slate",
  failed: "red",
  skipped_no_consent: "amber",
};

function SendLog({ messages }: { messages: HubSmsMessage[] }) {
  if (messages.length === 0) {
    return (
      <section>
        <h3 className="mb-2 font-semibold text-slate-700">Send log</h3>
        <EmptyState title="No messages yet" hint="Reminders and manual sends will appear here." />
      </section>
    );
  }

  return (
    <section>
      <h3 className="mb-2 font-semibold text-slate-700">Send log</h3>
      <p className="mb-3 text-xs text-slate-500">
        Every attempt is recorded, including one blocked by the consent gate, so it is always
        answerable why a patient did or did not receive a message.
      </p>
      <div className="divide-y divide-slate-100 rounded-lg border border-slate-100">
        {messages.map((message) => (
          <div key={message.id} className="px-4 py-2.5 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-xs text-slate-500">
                {message.toPhone || "no number"}
              </span>
              <Badge tone={STATUS_TONE[message.status] ?? "default"}>
                {message.status.replace(/_/g, " ")}
              </Badge>
            </div>
            <p className="mt-1 text-slate-700">
              {message.renderedBody || (
                <span className="text-slate-400">
                  Not sent: {message.skippedReason?.replace(/_/g, " ")}
                </span>
              )}
            </p>
            <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-slate-400">
              <span>{message.templateKey}</span>
              <span>· {message.language.toUpperCase()}</span>
              <span>· {message.triggeredBy.replace(/_/g, " ")}</span>
              {message.provider && <span>· {message.provider}</span>}
              {message.segments > 0 && <span>· {message.segments} segment{message.segments === 1 ? "" : "s"}</span>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
