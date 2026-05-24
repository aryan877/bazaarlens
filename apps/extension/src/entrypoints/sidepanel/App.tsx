import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  CheckCircle2,
  Clock3,
  ExternalLink,
  History as HistoryIcon,
  LogOut,
  RefreshCcw,
  ScanLine,
  ShieldAlert,
  ShoppingCart,
  Store,
} from "lucide-react";
import type {
  AgentDecision,
  AnalyzeResponse,
  BrowserCommand,
  ExtensionAuthStartResponse,
  HistoryItem,
  ProductPage,
} from "@bazaarlens/shared";
import { analyze, approve, history, pollExtensionAuth, startExtensionAuth } from "../../lib/api";
import { getSettings, saveSettings } from "../../lib/storage";

type Status = "idle" | "loading" | "error" | "success";
type View = "check" | "history";

const SUPPORTED_STORES = ["Amazon.in", "Flipkart", "Myntra"] as const;

export default function App() {
  const [apiUrl, setApiUrl] = useState("http://localhost:8787");
  const [token, setToken] = useState<string | null>(null);
  const [pendingAuth, setPendingAuth] = useState<ExtensionAuthStartResponse | null>(null);
  const [intent, setIntent] = useState("Should I buy this under my budget?");
  const [page, setPage] = useState<ProductPage | null>(null);
  const [response, setResponse] = useState<AnalyzeResponse | null>(null);
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [view, setView] = useState<View>("check");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    void getSettings().then((settings) => {
      setApiUrl(settings.apiUrl);
      setToken(settings.accessToken);
      if (settings.accessToken) void refreshHistory(settings.apiUrl, settings.accessToken);
    });
  }, []);

  useEffect(() => {
    if (!pendingAuth || token) return;

    let stopped = false;
    let timeout: number | undefined;

    const poll = async () => {
      if (stopped) return;
      if (new Date(pendingAuth.expiresAt).getTime() <= Date.now()) {
        setPendingAuth(null);
        setStatus("error");
        setMessage("Extension sign-in expired. Start a new sign-in.");
        return;
      }

      try {
        const result = await pollExtensionAuth(apiUrl, pendingAuth.flowId, pendingAuth.pollToken);
        if (stopped) return;
        if (result.status === "completed") {
          setToken(result.auth.accessToken);
          setPendingAuth(null);
          await saveSettings({ apiUrl, accessToken: result.auth.accessToken });
          await refreshHistory(apiUrl, result.auth.accessToken);
          setView("check");
          setStatus("success");
          setMessage(`Signed in as ${result.auth.user.email}`);
          return;
        }
        timeout = window.setTimeout(poll, pendingAuth.intervalSeconds * 1000);
      } catch (error) {
        if (stopped) return;
        setPendingAuth(null);
        setStatus("error");
        setMessage((error as Error).message);
      }
    };

    timeout = window.setTimeout(poll, pendingAuth.intervalSeconds * 1000);
    return () => {
      stopped = true;
      if (timeout) window.clearTimeout(timeout);
    };
  }, [apiUrl, pendingAuth, token]);

  const decision = response?.decision;
  const verdictClass = useMemo(() => {
    if (!decision) return "border-neutral-300";
    if (decision.verdict === "buy") return "border-emerald-500 bg-emerald-50";
    if (decision.verdict === "avoid") return "border-red-400 bg-red-50";
    return "border-amber-400 bg-amber-50";
  }, [decision]);

  async function startWebsiteSignIn() {
    setStatus("loading");
    setMessage("");
    try {
      if (pendingAuth) {
        await chrome.tabs.create({ url: pendingAuth.verificationUriComplete });
        setStatus("success");
        setMessage("Finish sign-in in the BazaarLens tab.");
        return;
      }
      const flow = await startExtensionAuth(apiUrl);
      setPendingAuth(flow);
      await saveSettings({ apiUrl, accessToken: null });
      await chrome.tabs.create({ url: flow.verificationUriComplete });
      setStatus("success");
      setMessage("Finish sign-in in the BazaarLens tab.");
    } catch (error) {
      setStatus("error");
      setMessage((error as Error).message);
    }
  }

  async function scan() {
    if (!token) return;
    setStatus("loading");
    setMessage("Reading active tab...");
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error("No active tab found");
      const extracted = await chrome.tabs.sendMessage(tab.id, { type: "BAZAARLENS_EXTRACT" });
      if (!extracted?.ok) throw new Error(extracted?.error ?? "Could not extract product page");
      setPage(extracted.page);
      setMessage("Checking product...");
      const result = await analyze(apiUrl, token, {
        page: extracted.page,
        intent: { query: intent, budget: null, userContext: null },
      });
      setResponse(result);
      await refreshHistory(apiUrl, token);
      setStatus("success");
      setMessage("Product check ready.");
    } catch (error) {
      setStatus("error");
      setMessage((error as Error).message);
    }
  }

  async function approveAction(approved: boolean) {
    if (!token || !response) return;
    setStatus("loading");
    try {
      const result = await approve(apiUrl, token, {
        sessionId: response.sessionId,
        action: response.decision.action,
        approved,
      });
      if (approved) await executeCommand(result.command);
      await refreshHistory(apiUrl, token);
      setStatus("success");
      setMessage(result.command.message);
    } catch (error) {
      setStatus("error");
      setMessage((error as Error).message);
    }
  }

  async function executeCommand(command: BrowserCommand) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("No active tab found");
    const result = await chrome.tabs.sendMessage(tab.id, {
      type: "BAZAARLENS_EXECUTE",
      command,
    });
    if (!result?.ok) throw new Error(result?.error ?? "Browser command failed");
  }

  async function refreshHistory(nextApiUrl = apiUrl, accessToken = token) {
    if (!accessToken) return;
    try {
      setItems(await history(nextApiUrl, accessToken));
    } catch {
      // History is useful context, but scan/auth flows should not fail just because history is unavailable.
    }
  }

  async function reloadHistory() {
    if (!token) return;
    setStatus("loading");
    setMessage("");
    try {
      setItems(await history(apiUrl, token));
      setStatus("success");
      setMessage("History refreshed.");
    } catch (error) {
      setStatus("error");
      setMessage((error as Error).message);
    }
  }

  async function openProduct(url: string) {
    await chrome.tabs.create({ url });
  }

  async function logout() {
    setToken(null);
    setResponse(null);
    setPage(null);
    setItems([]);
    setView("check");
    await saveSettings({ apiUrl, accessToken: null });
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#fbf7ed_0%,#eef6f1_100%)] p-4 text-[#18302d]">
      <header className="mb-4 flex items-center justify-between border-b border-[#b9d9cf] pb-3">
        <div>
          <div className="flex items-center gap-2 text-lg font-semibold text-[#102827]">
            <BazaarLensMark className="size-8 shrink-0" /> BazaarLens
          </div>
          <p className="text-xs text-[#63746c]">Check before you approve</p>
        </div>
        {token ? (
          <button className="rounded-md border border-[#8fc3b6] p-2" onClick={logout} aria-label="Log out">
            <LogOut size={16} />
          </button>
        ) : null}
      </header>

      {!token ? (
        <section className="space-y-3">
          <Field label="Developer API" value={apiUrl} onChange={setApiUrl} />
          <div className="rounded-md border border-[#d8ded2] bg-[#fffdf8]/90 p-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              {pendingAuth ? <Clock3 size={15} /> : <ShieldAlert size={15} />}
              {pendingAuth ? "Waiting for website approval" : "Connect your account"}
            </div>
            {pendingAuth ? (
              <div className="mt-3 rounded-md border border-[#b9d9cf] bg-[#e5efe8] p-3 text-center">
                <p className="text-[10px] font-semibold uppercase text-[#63746c]">Match this code</p>
                <p className="mt-1 font-mono text-2xl font-semibold tracking-[0.18em]">{pendingAuth.userCode}</p>
              </div>
            ) : (
              <p className="mt-2 text-xs leading-5 text-[#63746c]">
                Sign in on the website once, then this side panel can check supported product pages.
              </p>
            )}
          </div>
          <SupportedStores />
          <button
            className="flex w-full items-center justify-center gap-2 rounded-md bg-[#174743] px-3 py-2 text-sm font-medium text-[#fff7e6] disabled:opacity-60"
            disabled={status === "loading"}
            onClick={() => void startWebsiteSignIn()}
          >
            <ExternalLink size={15} />
            {pendingAuth ? "Open website tab" : "Connect account"}
          </button>
        </section>
      ) : (
        <section className="space-y-4">
          <nav className="grid grid-cols-2 rounded-md border border-[#d8ded2] bg-[#fffdf8]/90 p-1">
            <ViewButton active={view === "check"} icon={<ScanLine size={14} />} label="Check" onClick={() => setView("check")} />
            <ViewButton active={view === "history"} icon={<HistoryIcon size={14} />} label="History" onClick={() => setView("history")} />
          </nav>

          {view === "check" ? (
            <>
              <label className="block text-xs font-medium text-[#63746c]">
                Buying priority
                <textarea
                  className="mt-1 min-h-20 w-full rounded-md border border-[#b9d9cf] bg-[#fffdf8]/90 p-2 text-sm outline-none focus:border-[#0f766e]"
                  value={intent}
                  onChange={(event) => setIntent(event.target.value)}
                />
              </label>
              <button
                className="flex w-full items-center justify-center gap-2 rounded-md bg-[#174743] px-3 py-2 text-sm font-medium text-[#fff7e6] disabled:opacity-60"
                disabled={status === "loading"}
                onClick={() => void scan()}
              >
                <ScanLine size={16} /> Check this product
              </button>

              {page ? (
                <article className="rounded-md border border-[#d8ded2] bg-[#fffdf8]/90 p-3">
                  <p className="text-xs uppercase text-[#63746c]">{storeName(page.merchant)}</p>
                  <h2 className="mt-1 line-clamp-3 text-sm font-semibold">{page.title}</h2>
                  <p className="mt-2 text-sm">{page.price?.raw ?? "Price not detected"}</p>
                </article>
              ) : (
                <SupportedStores />
              )}

              {decision ? <DecisionCard decision={decision} className={verdictClass} onApprove={approveAction} /> : null}
            </>
          ) : (
            <HistoryPanel
              items={items}
              loading={status === "loading"}
              onOpen={openProduct}
              onRefresh={reloadHistory}
            />
          )}
        </section>
      )}

      {message ? (
        <div className={`mt-4 rounded-md border p-3 text-xs ${status === "error" ? "border-red-300 bg-red-50 text-red-800" : "border-[#b9d9cf] bg-[#f7fbf5]/80 text-[#30534f]"}`}>
          {message}
        </div>
      ) : null}
    </main>
  );
}

function ViewButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`flex items-center justify-center gap-1 rounded px-3 py-1.5 text-xs font-medium transition ${
        active ? "bg-[#174743] text-[#fff7e6]" : "text-[#63746c] hover:bg-[#e5efe8]"
      }`}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}

function HistoryPanel({
  items,
  loading,
  onOpen,
  onRefresh,
}: {
  items: HistoryItem[];
  loading: boolean;
  onOpen: (url: string) => Promise<void>;
  onRefresh: () => Promise<void> | void;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase text-[#63746c]">Recent checks</p>
        <button
          className="flex items-center gap-1 rounded-md border border-[#b9d9cf] px-2 py-1 text-xs disabled:opacity-60"
          disabled={loading}
          onClick={() => void onRefresh()}
        >
          <RefreshCcw size={13} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {items.length ? (
        <div className="space-y-2">
          {items.map((item) => (
            <article key={item.id} className="rounded-md border border-[#d8ded2] bg-[#fffdf8]/90 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wide text-[#63746c]">
                    {storeName(item.merchant)} · {formatDate(item.createdAt)}
                  </p>
                  <h2 className="mt-1 line-clamp-2 text-sm font-semibold">{item.title}</h2>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${verdictPill(item.verdict)}`}>
                  {item.verdict}
                </span>
              </div>
              <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#31524e]">{item.summary}</p>
              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="truncate text-xs text-[#63746c]">{item.approvedAction ?? "No approved action"}</span>
                <button
                  className="flex shrink-0 items-center gap-1 rounded-md border border-[#b9d9cf] px-2 py-1 text-xs font-medium"
                  onClick={() => void onOpen(item.url)}
                >
                  <ExternalLink size={13} />
                  Open
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-[#b9d9cf] bg-[#fffdf8]/65 p-4 text-center text-xs text-[#63746c]">
          No product checks yet.
        </div>
      )}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="block text-xs font-medium text-[#63746c]">
      {label}
      <input
        className="mt-1 w-full rounded-md border border-[#b9d9cf] bg-[#fffdf8]/90 p-2 text-sm outline-none focus:border-[#0f766e]"
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function BazaarLensMark({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" role="img" aria-label="BazaarLens">
      <rect x="2.5" y="2.5" width="43" height="43" rx="9" fill="#fff7e6" stroke="#18302d" strokeWidth="2" />
      <path d="M11 15.5h24l3.5 6H7.5z" fill="#e7ad38" />
      <path d="M14.2 15.5h5.4l-1 6h-5.7zM28.4 15.5h5.4l1.7 6h-5.8z" fill="#d85b3d" />
      <path d="M11.5 21.5h25v4.2c0 1.5-1.2 2.7-2.7 2.7-1.2 0-2.2-.8-2.6-1.9-.4 1.1-1.4 1.9-2.6 1.9s-2.2-.8-2.6-1.9c-.4 1.1-1.4 1.9-2.6 1.9s-2.2-.8-2.6-1.9c-.4 1.1-1.4 1.9-2.6 1.9-1.5 0-2.7-1.2-2.7-2.7z" fill="#fff7e6" />
      <path d="M14.5 28.5h16v8h-16z" fill="#174743" />
      <circle cx="31" cy="31" r="6.5" fill="#fffaf1" stroke="#174743" strokeWidth="3" />
      <path d="m35.5 35.5 4.2 4.2" fill="none" stroke="#d85b3d" strokeLinecap="round" strokeWidth="3.5" />
    </svg>
  );
}

function SupportedStores() {
  return (
    <div className="rounded-md border border-[#d8ded2] bg-[#fffdf8]/90 p-3">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase text-[#63746c]">
        <Store size={14} />
        Supported stores
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {SUPPORTED_STORES.map((store) => (
          <span key={store} className="rounded-md border border-[#d7dfd5] bg-[#f5efe3] px-2 py-1 text-xs font-medium text-[#27423e]">
            {store}
          </span>
        ))}
      </div>
    </div>
  );
}

function DecisionCard({
  decision,
  className,
  onApprove,
}: {
  decision: AgentDecision;
  className: string;
  onApprove: (approved: boolean) => Promise<void>;
}) {
  return (
    <article className={`rounded-md border p-3 ${className}`}>
      <div className="mb-2 flex items-center justify-between">
        <span className="rounded-full border border-current px-2 py-0.5 text-xs font-semibold uppercase">
          {decision.verdict}
        </span>
        <span className="text-xs">{Math.round(decision.confidence * 100)}%</span>
      </div>
      <p className="text-sm font-medium">{decision.summary}</p>
      <List title="Reasons" items={decision.reasons} icon={<CheckCircle2 size={14} />} />
      {decision.risks.length ? <List title="Risks" items={decision.risks} icon={<ShieldAlert size={14} />} /> : null}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button className="rounded-md border border-[#8fc3b6] px-3 py-2 text-xs font-medium" onClick={() => void onApprove(false)}>
          Deny
        </button>
        <button
          className="flex items-center justify-center gap-1 rounded-md bg-[#123c3a] px-3 py-2 text-xs font-medium text-[#f7fbf5]"
          disabled={!decision.action.requiresApproval && decision.action.type === "none"}
          onClick={() => void onApprove(true)}
        >
          <ShoppingCart size={14} /> {decision.action.label}
        </button>
      </div>
    </article>
  );
}

function List({ title, items, icon }: { title: string; items: string[]; icon: ReactNode }) {
  return (
    <div className="mt-3">
      <p className="mb-1 text-xs font-semibold uppercase text-[#63746c]">{title}</p>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item} className="flex gap-2 text-xs leading-5">
            <span className="mt-0.5 shrink-0">{icon}</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function verdictPill(verdict: AgentDecision["verdict"]): string {
  if (verdict === "buy") return "bg-emerald-100 text-emerald-800";
  if (verdict === "avoid") return "bg-red-100 text-red-800";
  if (verdict === "compare" || verdict === "wait") return "bg-amber-100 text-amber-800";
  return "bg-neutral-100 text-neutral-700";
}

function storeName(value: string): string {
  if (value === "amazon") return "Amazon.in";
  if (value === "flipkart") return "Flipkart";
  if (value === "myntra") return "Myntra";
  return "Generic";
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}
