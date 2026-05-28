import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  BadgeCheck,
  CheckCircle2,
  CircleAlert,
  Database,
  History,
  Link2,
  Loader2,
  LockKeyhole,
  LogOut,
  Network,
  PanelRightOpen,
  RefreshCw,
  SearchCheck,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Store,
  XCircle,
} from "lucide-react";
import type {
  AgentDecision,
  AgentEvidenceContext,
  AgentMemoryContext,
  AnalyzeResponse,
  ExtensionAuthDetailsResponse,
  HistoryItem,
  McpCapabilitiesResponse,
} from "@bazaarlens/shared";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  analyze,
  approve,
  completeExtensionAuth,
  extensionAuthDetails,
  googleLogin,
  history,
  login,
  mcpCapabilities,
  register,
} from "./api";
import { demoAnalyzeRequest } from "./fixtures";
import {
  disableGoogleAutoSelect,
  getGoogleClientId,
  initializeGoogleIdentity,
} from "./google-identity";

type Status = "idle" | "loading" | "error" | "success";

const SUPPORTED_STORES = ["Amazon.in", "Flipkart", "Myntra"] as const;

interface EvidenceEntry {
  key: string;
  icon: ReactNode;
  label: string;
  status: AgentMemoryContext["status"] | AgentEvidenceContext["status"];
  notes: string[];
  tools: string[];
}

export default function App() {
  const [email, setEmail] = useState("demo@bazaarlens.app");
  const [password, setPassword] = useState("password123");
  const [token, setToken] = useState(() => localStorage.getItem("bazaarLensToken"));
  const [intent, setIntent] = useState(demoAnalyzeRequest.intent.query);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [capabilities, setCapabilities] = useState<McpCapabilitiesResponse | null>(null);
  const [capabilitiesLoading, setCapabilitiesLoading] = useState(false);
  const [capabilitiesError, setCapabilitiesError] = useState("");
  const [extensionFlowId] = useState(() => new URLSearchParams(window.location.search).get("extension_flow") ?? "");
  const [extensionFlow, setExtensionFlow] = useState<ExtensionAuthDetailsResponse | null>(null);

  useEffect(() => {
    if (!token) return;
    void refreshHistory(token).catch(() => {
      setItems([]);
    });
    void refreshCapabilities(token);
  }, [token]);

  useEffect(() => {
    if (!extensionFlowId) return;
    let active = true;
    void extensionAuthDetails(extensionFlowId)
      .then((flow) => {
        if (active) setExtensionFlow(flow);
      })
      .catch((error: Error) => {
        if (!active) return;
        setStatus("error");
        setMessage(error.message);
      });
    return () => {
      active = false;
    };
  }, [extensionFlowId]);

  const signedIn = Boolean(token);
  const verdictTone = useMemo(() => toneForVerdict(analysis?.decision.verdict), [analysis]);
  const extensionState = extensionFlow
    ? extensionFlow.status === "completed"
      ? "Connected"
      : "Waiting approval"
    : "Link from side panel";

  async function authenticate(mode: "login" | "register") {
    setStatus("loading");
    setMessage("");
    try {
      const auth = mode === "login" ? await login(email, password) : await register(email, password);
      localStorage.setItem("bazaarLensToken", auth.accessToken);
      setToken(auth.accessToken);
      setStatus("success");
      setMessage(`Signed in as ${auth.user.email}`);
    } catch (error) {
      setStatus("error");
      setMessage((error as Error).message);
    }
  }

  const authenticateGoogle = useCallback(async (credential: string) => {
    setStatus("loading");
    setMessage("");
    try {
      const auth = await googleLogin(credential);
      localStorage.setItem("bazaarLensToken", auth.accessToken);
      setToken(auth.accessToken);
      setStatus("success");
      setMessage(`Signed in as ${auth.user.email}`);
    } catch (error) {
      setStatus("error");
      setMessage((error as Error).message);
    }
  }, []);

  async function runDemo() {
    if (!token) return;
    setStatus("loading");
    setMessage("");
    try {
      const result = await analyze(token, {
        ...demoAnalyzeRequest,
        intent: { ...demoAnalyzeRequest.intent, query: intent },
      });
      setAnalysis(result);
      await refreshHistory(token);
      setStatus("success");
      setMessage("Product check complete.");
    } catch (error) {
      setStatus("error");
      setMessage((error as Error).message);
    }
  }

  async function approveAction(approved: boolean) {
    if (!token || !analysis) return;
    setStatus("loading");
    try {
      const result = await approve(token, {
        sessionId: analysis.sessionId,
        action: analysis.decision.action,
        approved,
      });
      await refreshHistory(token);
      setStatus("success");
      setMessage(result.command.message);
    } catch (error) {
      setStatus("error");
      setMessage((error as Error).message);
    }
  }

  async function refreshHistory(accessToken: string) {
    setItems(await history(accessToken));
  }

  async function refreshCapabilities(accessToken = token, verify = false) {
    if (!accessToken) return;
    setCapabilitiesLoading(true);
    setCapabilitiesError("");
    try {
      setCapabilities(await mcpCapabilities(accessToken, verify));
    } catch (error) {
      setCapabilitiesError((error as Error).message);
      if (verify) return;
      setCapabilities(null);
    } finally {
      setCapabilitiesLoading(false);
    }
  }

  async function connectExtension() {
    if (!token || !extensionFlowId) return;
    setStatus("loading");
    setMessage("");
    try {
      const flow = await completeExtensionAuth(token, extensionFlowId);
      setExtensionFlow(flow);
      setStatus("success");
      setMessage("Extension connected. Return to Chrome.");
    } catch (error) {
      setStatus("error");
      setMessage((error as Error).message);
    }
  }

  function logout() {
    localStorage.removeItem("bazaarLensToken");
    disableGoogleAutoSelect();
    setToken(null);
    setAnalysis(null);
    setItems([]);
  }

  return (
    <TooltipProvider>
      <main className="min-h-screen overflow-x-hidden bg-[linear-gradient(180deg,#fbf7ed_0%,#eef6f1_100%)] text-foreground">
        <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(380px,460px)]">
          <section className="px-4 py-5 sm:px-8 lg:px-10 xl:px-12">
            <div className="mx-auto max-w-[1120px] lg:mr-0">
            <header className="motion-panel flex flex-col items-start justify-between gap-4 border-b border-[#d8ded2] pb-4 sm:flex-row sm:items-center">
              <div className="flex min-w-0 items-center gap-3">
                <BazaarLensMark className="size-12 shrink-0" />
                <div className="min-w-0">
                  <h1 className="text-xl font-semibold tracking-normal text-[#18302d]">BazaarLens</h1>
                  <p className="text-sm text-[#64746c]">Shopping checks before you approve an action.</p>
                </div>
              </div>
              <div className="flex max-w-full flex-wrap items-center gap-2 sm:justify-end">
                <Badge variant="secondary" className="gap-1 rounded-md bg-[#e5efe8] px-2.5 py-1 text-[#27423e]">
                  <Store className="size-3.5" />
                  3 Indian stores
                </Badge>
                <Badge
                  variant="outline"
                  className="gap-1 rounded-md border-[#c9d6cd] bg-white/70 px-2.5 py-1 text-[#27423e]"
                >
                  <ShieldCheck className="size-3.5 text-[#0f766e]" />
                  Approval first
                </Badge>
              </div>
            </header>

            <div className="motion-panel motion-delay-1 mt-5 grid gap-3 md:grid-cols-3">
              <StatusTile
                icon={<Store />}
                label="Store coverage"
                value={SUPPORTED_STORES.join(", ")}
                state="Live product pages"
              />
              <StatusTile
                icon={<PanelRightOpen />}
                label="Chrome extension"
                value={extensionState}
                state={extensionFlow ? "This browser session" : "Website-owned login"}
              />
              <StatusTile
                icon={<LockKeyhole />}
                label="Checkout guard"
                value="Payment and OTP blocked"
                state="Safe commands only"
              />
            </div>

            <Tabs defaultValue="check" className="motion-panel motion-delay-2 mt-6">
              <TabsList className="h-auto w-full justify-start gap-1 rounded-lg bg-[#e5ece5] p-1 transition-shadow duration-200 hover:shadow-sm sm:w-fit">
                <TabsTrigger value="check" className="gap-1.5 px-3 py-1.5">
                  <SearchCheck className="size-4" />
                  Check
                </TabsTrigger>
                <TabsTrigger value="history" className="gap-1.5 px-3 py-1.5">
                  <History className="size-4" />
                  History
                </TabsTrigger>
                <TabsTrigger value="setup" className="gap-1.5 px-3 py-1.5">
                  <Link2 className="size-4" />
                  Setup
                </TabsTrigger>
              </TabsList>

              <TabsContent value="check" className="mt-5 grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
                <Card className="interactive-card rounded-lg border-[#d8ded2] bg-[#fffdf8] shadow-sm">
                  <CardHeader>
                    <CardTitle>Product check</CardTitle>
                    <CardDescription>
                      Run the sample here, or use the Chrome side panel on an active product tab.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="intent">Buying priority</Label>
                      <Textarea
                        id="intent"
                        value={intent}
                        onChange={(event) => setIntent(event.target.value)}
                        className="min-h-24 resize-none bg-white"
                        placeholder="Budget, delivery, brand preference, or what you care about."
                      />
                    </div>

                    <div className="rounded-lg border border-[#e1dfd4] bg-[#faf4e8] p-3">
                      <div className="flex items-start gap-3">
                        <div className="interactive-icon flex size-10 shrink-0 items-center justify-center rounded-md bg-[#174743] text-[#fff7e6]">
                          <ShoppingBag className="size-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="line-clamp-2 text-sm font-semibold text-[#1d2f2c]">
                            {demoAnalyzeRequest.page.title}
                          </p>
                          <p className="mt-1 text-sm text-[#68766e]">
                            {demoAnalyzeRequest.page.price?.raw} · {demoAnalyzeRequest.page.rating}/5 ·{" "}
                            {demoAnalyzeRequest.page.seller}
                          </p>
                        </div>
                      </div>
                    </div>

                    <Button
                      disabled={!signedIn || status === "loading"}
                      className="h-10 w-full bg-[#174743] text-[#fff7e6] transition-transform duration-150 hover:bg-[#0f3835] active:scale-[0.99]"
                      onClick={() => void runDemo()}
                    >
                      {status === "loading" ? <Loader2 className="animate-spin" /> : <ShoppingCart />}
                      {signedIn ? "Run sample check" : "Sign in to run check"}
                    </Button>
                  </CardContent>
                </Card>

                <DecisionPanel
                  decision={analysis?.decision ?? null}
                  memory={analysis?.memoryContext ?? null}
                  evidence={analysis?.evidenceContexts?.length ? analysis.evidenceContexts : analysis?.evidenceContext ? [analysis.evidenceContext] : []}
                  tone={verdictTone}
                  onApprove={approveAction}
                  loading={status === "loading"}
                />
              </TabsContent>

              <TabsContent value="history" className="mt-5">
                <Card className="interactive-card rounded-lg border-[#d8ded2] bg-[#fffdf8] shadow-sm">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <History size={18} /> Recent checks
                    </CardTitle>
                    <CardDescription>Saved product decisions for this account.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Product</TableHead>
                          <TableHead>Store</TableHead>
                          <TableHead>Verdict</TableHead>
                          <TableHead>Approved action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {items.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="max-w-[460px] truncate">{item.title}</TableCell>
                            <TableCell>{storeName(item.merchant)}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="rounded-md capitalize">
                                {item.verdict}
                              </Badge>
                            </TableCell>
                            <TableCell>{item.approvedAction ?? "None"}</TableCell>
                          </TableRow>
                        ))}
                        {!items.length ? (
                          <TableRow>
                            <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                              No product checks yet.
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="setup" className="mt-5 grid gap-4 md:grid-cols-3">
                <SetupCard
                  icon={<PanelRightOpen />}
                  title="Extension"
                  body="Load the unpacked Chrome build, connect this account, then check the active product tab."
                />
                <SetupCard
                  icon={<BadgeCheck />}
                  title="Account"
                  body="Email login is available now. Google appears when a web client ID is configured."
                />
                <SetupCard
                  icon={<Store />}
                  title="Stores"
                  body="Adapters are scoped to Amazon.in, Flipkart, and Myntra product pages."
                />
                <Card className="interactive-card rounded-lg border-[#d8ded2] bg-[#fffdf8] shadow-sm md:col-span-3">
                  <CardHeader>
                    <div className="interactive-icon mb-2 flex size-9 items-center justify-center rounded-md bg-[#174743] text-[#fff7e6]">
                      <Network className="size-4" />
                    </div>
                    <CardTitle>Agent evidence</CardTitle>
                    <CardDescription>Live memory and observability connections used by the agent.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <CapabilityGrid
                      capabilities={capabilities}
                      loading={capabilitiesLoading}
                      error={capabilitiesError}
                      canVerify={signedIn}
                      onVerify={() => void refreshCapabilities(token, true)}
                    />
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            {message ? (
              <Alert className="motion-panel mt-5 rounded-lg" variant={status === "error" ? "destructive" : "default"}>
                <AlertTitle>{status === "error" ? "Needs attention" : "Done"}</AlertTitle>
                <AlertDescription>{message}</AlertDescription>
              </Alert>
            ) : null}
            </div>
          </section>

          <aside className="border-t border-[#214c48] bg-[#173d3a] px-4 py-5 text-white sm:px-8 lg:border-l lg:border-t-0 lg:px-7 xl:px-8">
            <div className="mx-auto max-w-[430px] lg:mx-0">
            <Card className="motion-panel motion-delay-1 rounded-lg border-white/10 bg-white/[0.08] text-white shadow-none">
              <CardHeader>
                <CardTitle>{signedIn ? "Account connected" : "Sign in"}</CardTitle>
                <CardDescription className="text-white/65">
                  Save checks and link the Chrome side panel from the website.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {!signedIn ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="email" className="text-white/80">
                        Email
                      </Label>
                      <Input id="email" value={email} onChange={(event) => setEmail(event.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password" className="text-white/80">
                        Password
                      </Label>
                      <Input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="secondary" onClick={() => void authenticate("login")}>
                        Login
                      </Button>
                      <Button
                        variant="outline"
                        className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
                        onClick={() => void authenticate("register")}
                      >
                        Register
                      </Button>
                    </div>
                    <GoogleSignInButton disabled={status === "loading"} onCredential={authenticateGoogle} />
                  </>
                ) : (
                  <>
                    <div className="rounded-lg border border-[#9ad7c6]/35 bg-[#9ad7c6]/10 p-3 text-sm text-[#ddfff3]">
                      Ready for product checks from this dashboard and linked extensions.
                    </div>
                    <Button variant="secondary" className="w-full transition-transform duration-150 active:scale-[0.99]" onClick={logout}>
                      <LogOut className="size-4" />
                      Log out
                    </Button>
                  </>
                )}
                {extensionFlow ? (
                  <ExtensionConnectPanel
                    flow={extensionFlow}
                    signedIn={signedIn}
                    loading={status === "loading"}
                    onConnect={connectExtension}
                  />
                ) : null}
              </CardContent>
            </Card>

            <div className="motion-panel motion-delay-2 mt-5 space-y-3">
              <Signal
                icon={<ShieldCheck />}
                label="Approval required"
                value="Add-to-cart, wishlist, and compare actions wait for your confirmation."
              />
              <Signal
                icon={<LockKeyhole />}
                label="Checkout blocked"
                value="No OTP, payment, address, credential, or final-order automation."
              />
              <Signal
                icon={<Store />}
                label="Live stores"
                value="Amazon.in, Flipkart, and Myntra product pages."
              />
            </div>
            </div>
          </aside>
        </div>
      </main>
    </TooltipProvider>
  );
}

function ExtensionConnectPanel({
  flow,
  signedIn,
  loading,
  onConnect,
}: {
  flow: ExtensionAuthDetailsResponse;
  signedIn: boolean;
  loading: boolean;
  onConnect: () => Promise<void>;
}) {
  const connected = flow.status === "completed";
  return (
    <div className="space-y-3 rounded-lg border border-white/10 bg-white/[0.07] p-3">
      <Separator className="bg-white/15" />
      <div className="flex items-center gap-2 text-sm font-medium">
        {connected ? <BadgeCheck size={16} className="text-emerald-200" /> : <PanelRightOpen size={16} />}
        Chrome extension
      </div>
      <div className="rounded-lg border border-white/10 bg-[#0c2b29]/70 p-3 text-center">
        <p className="text-[10px] font-semibold uppercase text-white/50">Match this code</p>
        <p className="mt-1 font-mono text-2xl font-semibold tracking-[0.18em]">{flow.userCode}</p>
      </div>
      {connected ? (
        <p className="text-xs leading-5 text-[#ddfff3]">Connected. Return to the Chrome side panel.</p>
      ) : signedIn ? (
        <Button variant="secondary" className="w-full" disabled={loading} onClick={() => void onConnect()}>
          {loading ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
          Connect extension
        </Button>
      ) : (
        <p className="text-xs leading-5 text-white/60">Sign in here, then connect the extension.</p>
      )}
    </div>
  );
}

function GoogleSignInButton({
  disabled,
  onCredential,
}: {
  disabled: boolean;
  onCredential: (credential: string) => Promise<void>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const clientId = getGoogleClientId();

  useEffect(() => {
    if (!clientId || disabled) return;

    let active = true;
    setError("");
    void initializeGoogleIdentity(clientId, (response) => {
      if (response.credential) void onCredential(response.credential);
    })
      .then(() => {
        if (!active || !containerRef.current || !window.google?.accounts.id) return;
        containerRef.current.replaceChildren();
        window.google.accounts.id.renderButton(containerRef.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "rectangular",
          logo_alignment: "left",
          width: 320,
        });
      })
      .catch((loadError: Error) => {
        if (active) setError(loadError.message);
      });

    return () => {
      active = false;
      containerRef.current?.replaceChildren();
    };
  }, [clientId, disabled, onCredential]);

  if (!clientId) {
    return (
      <div className="space-y-2">
        <Separator className="bg-white/15" />
        <Button
          variant="outline"
          className="w-full border-white/20 bg-white/[0.04] text-white/50 hover:bg-white/[0.04] hover:text-white/50"
          disabled
        >
          Continue with Google
        </Button>
        <p className="text-xs leading-5 text-white/50">Google sign-in is not configured for this deployment.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Separator className="bg-white/15" />
      <div ref={containerRef} className="min-h-10" aria-busy={disabled} />
      {error ? (
        <p className="text-xs text-red-200" role="alert">
          {error}
        </p>
      ) : null}
    </div>
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

function DecisionPanel({
  decision,
  memory,
  evidence,
  tone,
  onApprove,
  loading,
}: {
  decision: AgentDecision | null;
  memory: AgentMemoryContext | null;
  evidence: AgentEvidenceContext[];
  tone: string;
  onApprove: (approved: boolean) => Promise<void>;
  loading: boolean;
}) {
  if (loading && !decision) {
    return (
      <Card className="interactive-card rounded-lg border-[#d8ded2] bg-[#fffdf8] shadow-sm">
        <CardHeader>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!decision) {
    return (
      <Card className="interactive-card rounded-lg border-dashed border-[#cbd8cf] bg-[#fffdf8]/70 shadow-sm">
        <CardHeader>
          <div className="interactive-icon soft-pulse mb-2 flex size-10 items-center justify-center rounded-md bg-[#e5efe8] text-[#174743]">
            <SearchCheck className="size-5" />
          </div>
          <CardTitle>Ready for a product</CardTitle>
          <CardDescription>
            The result will show a verdict, the reasoning, and the safest next action.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-3">
          <EmptySignal icon={<BadgeCheck />} label="Verdict" />
          <EmptySignal icon={<CircleAlert />} label="Risks" />
          <EmptySignal icon={<ShieldCheck />} label="Approval" />
        </CardContent>
      </Card>
    );
  }

  const actionDisabled = decision.action.type === "none";
  return (
    <Card className={`interactive-card rounded-lg shadow-sm ${tone}`}>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Badge className="rounded-md uppercase">{decision.verdict}</Badge>
          <span className="text-sm text-muted-foreground">{Math.round(decision.confidence * 100)}% confidence</span>
        </div>
        <CardTitle className="text-lg">{decision.summary}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-foreground/10 bg-white/65 p-3">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Next action</p>
            <p className="mt-1 text-sm font-medium">{actionDisabled ? "No browser action needed" : decision.action.label}</p>
          </div>
          <div className="rounded-lg border border-foreground/10 bg-white/65 p-3">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Control</p>
            <p className="mt-1 text-sm font-medium">
              {decision.action.requiresApproval ? "Needs your approval" : "Read-only recommendation"}
            </p>
          </div>
        </div>
        <AgentRunEvidence memory={memory} evidence={evidence} />
        <ReasonList title="Reasons" items={decision.reasons} icon={<CheckCircle2 />} />
        <ReasonList title="Risks" items={decision.risks} icon={<CircleAlert />} />
        <ReasonList title="Checks" items={decision.checks} icon={<ShieldCheck />} />
        <Separator />
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" className="flex-1" disabled={loading} onClick={() => void onApprove(false)}>
            <XCircle />
            Skip action
          </Button>
          <Button className="flex-1" disabled={loading || actionDisabled} onClick={() => void onApprove(true)}>
            <BadgeCheck /> {actionDisabled ? "No action" : decision.action.label}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AgentRunEvidence({
  memory,
  evidence,
}: {
  memory: AgentMemoryContext | null;
  evidence: AgentEvidenceContext[];
}) {
  const entries: EvidenceEntry[] = [];
  if (memory) {
    entries.push({
      key: "memory",
      icon: <Database />,
      label: memory.provider,
      status: memory.status,
      notes: memory.notes,
      tools: memory.tools,
    });
  }
  for (const [index, context] of evidence.entries()) {
    entries.push({
      key: `evidence-${context.provider}-${index}`,
      icon: <Network />,
      label: context.label,
      status: context.status,
      notes: context.notes,
      tools: context.tools,
    });
  }

  if (!entries.length) return null;

  return (
    <div className="rounded-lg border border-foreground/10 bg-white/65 p-3">
      <p className="text-xs font-semibold uppercase text-muted-foreground">Agent evidence</p>
      <div className="mt-2 grid gap-2">
        {entries.map((entry) => (
          <div key={entry.key} className="flex items-start gap-2 rounded-md bg-white/70 p-2">
            <span className="mt-0.5 shrink-0 text-[#0f766e] [&_svg]:size-4">{entry.icon}</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate text-sm font-medium">{entry.label}</span>
                <Badge variant="outline" className={`rounded-md capitalize ${capabilityTone(entry.status)}`}>
                  {entry.status.replace("_", " ")}
                </Badge>
              </div>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                {entry.notes[0] ?? `${entry.tools.length} MCP tool(s) visible.`}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReasonList({ title, items, icon }: { title: string; items: string[]; icon: ReactNode }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="mb-2 text-sm font-medium">{title}</p>
      <ul className="space-y-1 text-sm text-muted-foreground">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="mt-0.5 shrink-0 text-[#0f766e] [&_svg]:size-4">{icon}</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatusTile({ icon, label, value, state }: { icon: ReactNode; label: string; value: string; state: string }) {
  return (
    <div className="interactive-card rounded-lg border border-[#d8ded2] bg-white/70 p-3 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="interactive-icon flex size-9 shrink-0 items-center justify-center rounded-md bg-[#174743] text-[#fff7e6] [&_svg]:size-4">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase text-[#6a766e]">{label}</p>
          <p className="mt-0.5 truncate text-sm font-semibold text-[#1d2f2c]">{value}</p>
          <p className="mt-0.5 text-xs text-[#6d7d75]">{state}</p>
        </div>
      </div>
    </div>
  );
}

function EmptySignal({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="interactive-card flex items-center gap-2 rounded-lg border border-[#e0e4dc] bg-white/70 p-3 text-sm text-[#52645d]">
      <span className="interactive-icon text-[#0f766e] [&_svg]:size-4">{icon}</span>
      {label}
    </div>
  );
}

function CapabilityGrid({
  capabilities,
  loading,
  error,
  canVerify,
  onVerify,
}: {
  capabilities: McpCapabilitiesResponse | null;
  loading: boolean;
  error: string;
  canVerify: boolean;
  onVerify: () => void;
}) {
  if (!capabilities) {
    return (
      <div className="space-y-3">
        <CapabilityToolbar
          capabilities={capabilities}
          loading={loading}
          error={error}
          canVerify={canVerify}
          onVerify={onVerify}
        />
        <div className="grid gap-3 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-24 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const primary = capabilities.selectedConnector;
  const visibleConnectors = capabilities.connectors.filter(
    (connector) => connector.provider !== capabilities.selectedTrack && connector.status !== "disabled",
  );
  const hiddenCount = capabilities.connectors.filter(
    (connector) => connector.provider !== capabilities.selectedTrack && connector.status === "disabled",
  ).length;

  return (
    <div className="space-y-3">
      <CapabilityToolbar
        capabilities={capabilities}
        loading={loading}
        error={error}
        canVerify={canVerify}
        onVerify={onVerify}
      />
      {primary ? <CapabilityCard connector={primary} featured /> : null}
      {visibleConnectors.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {visibleConnectors.map((connector) => (
            <CapabilityCard key={connector.provider} connector={connector} />
          ))}
        </div>
      ) : null}
      {hiddenCount ? (
        <div className="rounded-lg border border-[#e1dfd4] bg-white/55 px-3 py-2 text-xs text-[#64746c]">
          {hiddenCount} optional connector{hiddenCount === 1 ? "" : "s"} hidden until configured.
        </div>
      ) : null}
    </div>
  );
}

function CapabilityToolbar({
  capabilities,
  loading,
  error,
  canVerify,
  onVerify,
}: {
  capabilities: McpCapabilitiesResponse | null;
  loading: boolean;
  error: string;
  canVerify: boolean;
  onVerify: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-[#e1dfd4] bg-white/55 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase text-[#6a766e]">
          {capabilities?.checksEnabled ? "Live tool check" : "Config snapshot"}
        </p>
        <p className="mt-1 text-xs text-[#64746c]">
          {error
            ? error
            : capabilities
              ? `${capabilities.selectedTrack.toUpperCase()} track ${capabilities.selectedTrackQualified ? "ready" : "not ready"} · Last checked ${formatCapabilityTime(capabilities.generatedAt)}`
              : "Loading connector state."}
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="border-[#c9d6cd] bg-white/80 text-[#27423e] hover:bg-[#eef3ed]"
        disabled={loading || !canVerify}
        onClick={onVerify}
      >
        {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
        Verify tools
      </Button>
    </div>
  );
}

function CapabilityCard({
  connector,
  featured = false,
}: {
  connector: McpCapabilitiesResponse["connectors"][number];
  featured?: boolean;
}) {
  return (
    <div className={`rounded-lg border border-[#e1dfd4] bg-white/70 p-3 ${featured ? "shadow-sm" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[#1d2f2c]">{connector.label}</p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#64746c]">{connector.purpose}</p>
        </div>
        <Badge variant="outline" className={`shrink-0 rounded-md capitalize ${capabilityTone(connector.status)}`}>
          {connector.status.replace("_", " ")}
        </Badge>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge variant="secondary" className="rounded-md bg-[#eef3ed] text-[#52645d]">
          {connector.transport.replace("_", " ")}
        </Badge>
        {connector.tools.slice(0, 3).map((tool) => (
          <Badge key={tool} variant="outline" className="max-w-32 truncate rounded-md">
            {tool}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function SetupCard({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <Card className="interactive-card rounded-lg border-[#d8ded2] bg-[#fffdf8] shadow-sm">
      <CardHeader>
        <div className="interactive-icon mb-2 flex size-9 items-center justify-center rounded-md bg-[#174743] text-[#fff7e6] [&_svg]:size-4">
          {icon}
        </div>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{body}</CardDescription>
      </CardHeader>
    </Card>
  );
}

function Signal({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="interactive-card rounded-lg border border-white/10 bg-white/[0.08] p-3">
      <div className="flex items-start gap-3">
        <div className="interactive-icon mt-0.5 text-[#f1c45b] [&_svg]:size-4">{icon}</div>
        <div>
          <p className="text-xs font-semibold uppercase text-white/50">{label}</p>
          <p className="mt-1 text-sm leading-5 text-[#effff6]/90">{value}</p>
        </div>
      </div>
    </div>
  );
}

function toneForVerdict(verdict?: AgentDecision["verdict"]): string {
  if (verdict === "buy") return "border-emerald-300 bg-emerald-50/80";
  if (verdict === "avoid") return "border-red-300 bg-red-50/85";
  if (verdict === "compare" || verdict === "wait") return "border-amber-300 bg-amber-50/85";
  return "border-[#d8ded2] bg-[#fffdf8]";
}

function capabilityTone(status: McpCapabilitiesResponse["connectors"][number]["status"] | AgentMemoryContext["status"]): string {
  if (status === "available") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "configured") return "border-teal-200 bg-teal-50 text-teal-800";
  if (status === "missing_config") return "border-amber-200 bg-amber-50 text-amber-800";
  if (status === "error") return "border-red-200 bg-red-50 text-red-800";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function formatCapabilityTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "just now";
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function storeName(value: string): string {
  if (value === "amazon") return "Amazon.in";
  if (value === "flipkart") return "Flipkart";
  if (value === "myntra") return "Myntra";
  return "Generic";
}
