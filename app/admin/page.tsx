"use client";

import { useEffect, useState, useRef } from "react";
import {
  Clock,
  MessageSquare,
  Inbox,
  Search,
  AlertCircle,
  Bot,
  CheckCircle2,
  Trash2,
  Lock,
  LogOut,
  Sparkles,
  BookOpen,
  ShieldBan,
  ChevronDown,
  Pen,
  XCircle,
  RotateCcw,
  RefreshCw,
  Database,
} from "lucide-react";
import { auth } from "../../lib/firebase";
import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  User,
} from "firebase/auth";

interface PendingEvaluation {
  id: string;
  topic: string;
  queries: string[];
  ai_response: string;
  count: number;
  timestamp: string;
  scenario: string;
  status: string;
  admin_note?: string;
  official_answer?: string;
}

interface CoachForm {
  adminNote: string;
  submitting: boolean;
}

export default function AdminDashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  const [pendingEvaluations, setPendingEvaluations] = useState<PendingEvaluation[]>([]);
  const [answeredEvaluations, setAnsweredEvaluations] = useState<PendingEvaluation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Tabs
  const [activeTab, setActiveTab] = useState<"unanswered" | "answered">("unanswered");

  // Sync state removed

  // Coaching form state — keyed by evaluation id
  const [coachFormOpen, setCoachFormOpen] = useState<string | null>(null);
  const [coachForms, setCoachForms] = useState<Record<string, CoachForm>>({});

  // Toast notifications
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);


  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
      if (u) {
        fetchEvaluations();
      }
    });
    return () => unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      if (err.code === "auth/operation-not-allowed") {
        setLoginError("Email/Password Auth is disabled. Please enable it in Firebase Console.");
      } else {
        setLoginError("Invalid credentials");
      }
    }
  };

  async function fetchEvaluations() {
    try {
      setLoading(true);
      setError("");
      const [pendingRes, answeredRes] = await Promise.all([
        fetch(`/api/admin/evaluations?status=pending`),
        fetch(`/api/admin/evaluations?status=answered`)
      ]);
      const pendingData = await pendingRes.json();
      const answeredData = await answeredRes.json();
      
      setPendingEvaluations(pendingData.data || []);
      setAnsweredEvaluations(answeredData.data || []);
      
      if (pendingData.data && pendingData.data.length > 0) {
        setSelectedId(pendingData.data[0].id);
      } else if (answeredData.data && answeredData.data.length > 0) {
        setSelectedId(answeredData.data[0].id);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };


  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  };

  // ── Open coaching form ──────────────────────────────────────────────────────
  const openCoachForm = (evalItem: PendingEvaluation) => {
    if (!coachForms[evalItem.id]) {
      setCoachForms((prev) => ({
        ...prev,
        [evalItem.id]: {
          adminNote: evalItem.admin_note ?? "",
          submitting: false,
        },
      }));
    }
    setCoachFormOpen(evalItem.id);
  };

  const closeCoachForm = () => setCoachFormOpen(null);

  const updateCoachForm = (id: string, patch: Partial<CoachForm>) => {
    setCoachForms((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  // ── Inject to Knowledge Base ────────────────────────────────────────────────
  const handleInjectKB = async (evalItem: PendingEvaluation) => {
    const form = coachForms[evalItem.id];
    if (!form) return;

    updateCoachForm(evalItem.id, { submitting: true });
    try {
      const res = await fetch("/api/admin/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          doc_id: evalItem.id,
          action: "inject_kb",
          admin_note: form.adminNote,
        }),
      });
      if (!res.ok) throw new Error("Failed to inject into knowledge base");

      if (pendingEvaluations.find(e => e.id === evalItem.id)) {
        const newPending = pendingEvaluations.filter((e) => e.id !== evalItem.id);
        setPendingEvaluations(newPending);
        setAnsweredEvaluations([{...evalItem, status: "approved", admin_note: form.adminNote}, ...answeredEvaluations]);
        setSelectedId(newPending.length > 0 ? newPending[0].id : null);
      } else {
        setAnsweredEvaluations((prev) =>
          prev.map((e) =>
            e.id === evalItem.id
              ? { ...e, status: "approved", admin_note: form.adminNote }
              : e
          )
        );
      }
      closeCoachForm();
      showToast("✓ Coaching instruction saved & injected into knowledge base.");
    } catch (err: any) {
      showToast("Error: " + err.message, "error");
    } finally {
      updateCoachForm(evalItem.id, { submitting: false });
    }
  };

  // ── Mark as Spam ────────────────────────────────────────────────────────────
  const handleSpam = async (id: string) => {
    try {
      const res = await fetch("/api/admin/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc_id: id, action: "spam" }),
      });
      if (!res.ok) throw new Error("Failed to mark as spam");

      const target = pendingEvaluations.find(e => e.id === id);
      if (target) {
        const newPending = pendingEvaluations.filter((e) => e.id !== id);
        setPendingEvaluations(newPending);
        setAnsweredEvaluations([{...target, status: "rejected"}, ...answeredEvaluations]);
        setSelectedId(newPending.length > 0 ? newPending[0].id : null);
      } else {
        const newAnswered = answeredEvaluations.filter((e) => e.id !== id);
        setAnsweredEvaluations(newAnswered);
        setSelectedId(newAnswered.length > 0 ? newAnswered[0].id : null);
      }
      closeCoachForm();
      showToast("Entry marked as spam and ignored.");
    } catch (err: any) {
      showToast("Error: " + err.message, "error");
    }
  };

  // ── Permanent delete ────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    if (!confirm("Permanently delete this record? The AI will completely forget this.")) return;
    try {
      const res = await fetch(`/api/admin/evaluate/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      const newPending = pendingEvaluations.filter((e) => e.id !== id);
      setPendingEvaluations(newPending);
      const newAnswered = answeredEvaluations.filter((e) => e.id !== id);
      setAnsweredEvaluations(newAnswered);
      if (selectedId === id) {
        if (newPending.length > 0) setSelectedId(newPending[0].id);
        else if (newAnswered.length > 0) setSelectedId(newAnswered[0].id);
        else setSelectedId(null);
      }
      showToast("Record permanently deleted.");
    } catch (err: any) {
      showToast("Error: " + err.message, "error");
    }
  };


  if (authLoading) return (
    <div className="min-h-screen bg-[#080810] flex items-center justify-center">
      <div className="flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce [animation-delay:-0.3s]" />
        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce [animation-delay:-0.15s]" />
        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce" />
      </div>
    </div>
  );

  if (!user) {
    return (
      <div className="min-h-screen bg-[#080810] flex items-center justify-center font-sans selection:bg-indigo-500/30">
        <form onSubmit={handleLogin} className="w-full max-w-sm bg-zinc-900/50 border border-zinc-800 rounded-2xl p-8 shadow-2xl">
          <div className="flex justify-center mb-6">
            <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
              <Lock size={22} className="text-indigo-400" />
            </div>
          </div>
          <h2 className="text-xl font-bold text-zinc-100 text-center mb-1">Admin Login</h2>
          <p className="text-sm text-zinc-500 text-center mb-8">Sign in to access the AI coaching dashboard.</p>

          {loginError && (
            <div className="mb-6 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs text-center flex items-center gap-2 justify-center">
              <AlertCircle size={13} />
              {loginError}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Email</label>
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-[#0a0a0a] border border-zinc-800 text-sm text-zinc-200 rounded-lg px-4 py-2.5 focus:outline-none focus:border-indigo-500/50 transition-all" placeholder="admin@company.com" />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Password</label>
              <input type="password" required value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-[#0a0a0a] border border-zinc-800 text-sm text-zinc-200 rounded-lg px-4 py-2.5 focus:outline-none focus:border-indigo-500/50 transition-all" placeholder="••••••••" />
            </div>
          </div>

          <button type="submit" className="w-full mt-8 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm py-2.5 rounded-lg transition-all shadow-[0_0_20px_rgba(79,70,229,0.25)]">
            Sign In
          </button>
        </form>
      </div>
    );
  }

  const allEvaluations = [...pendingEvaluations, ...answeredEvaluations];
  const filteredPending = pendingEvaluations.filter(e =>
    e.topic.toLowerCase().includes(searchQuery.toLowerCase()) ||
    e.queries.some(q => q.toLowerCase().includes(searchQuery.toLowerCase()))
  );
  const filteredAnswered = answeredEvaluations.filter(e =>
    e.topic.toLowerCase().includes(searchQuery.toLowerCase()) ||
    e.queries.some(q => q.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const selectedEval = allEvaluations.find(e => e.id === selectedId);
  const selectedActiveTab = selectedEval
    ? pendingEvaluations.some(e => e.id === selectedEval.id) ? "pending" : "answered"
    : activeTab === "unanswered" ? "pending" : "answered";
  const isCoachOpen = selectedEval ? coachFormOpen === selectedEval.id : false;
  const currentForm = selectedEval ? coachForms[selectedEval.id] : null;

  return (
    <div className="h-screen overflow-hidden bg-[#080810] text-zinc-200 flex flex-col font-sans selection:bg-indigo-500/30">

      {/* ── Toast ─────────────────────────────────────────────────────────────── */}
      <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ${toast ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3 pointer-events-none"}`}>
        <div className={`flex items-center gap-3 px-5 py-3 rounded-xl text-sm font-medium shadow-2xl border backdrop-blur-sm ${toast?.type === "error" ? "bg-red-950/80 border-red-500/30 text-red-300" : "bg-zinc-900/90 border-zinc-700/60 text-zinc-200"}`}>
          {toast?.type === "error"
            ? <XCircle size={15} className="text-red-400 shrink-0" />
            : <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />}
          {toast?.message}
        </div>
      </div>

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <header className="h-14 border-b border-zinc-800/60 bg-[#080810]/90 backdrop-blur-md flex items-center justify-between px-6 sticky top-0 z-10 shrink-0">
        <div className="flex items-center gap-3">
          <img src="/logo-pemkab-banyuwangi.png" alt="Logo Pemkab Banyuwangi" className="h-9 w-auto object-contain flex-shrink-0 drop-shadow-sm" />
          <div>
            <h1 className="text-sm font-semibold text-zinc-100 leading-tight">chatbot-perijinan — AI Coach</h1>
            <p className="text-[10px] text-zinc-600 uppercase tracking-widest font-medium">Knowledge Base Inbox</p>
          </div>
        </div>

        <div className="flex items-center gap-3">


          <div className="w-px h-6 bg-zinc-800/80 mx-1"></div>


          <button onClick={() => signOut(auth)} className="p-2 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900 rounded-lg transition-all" title="Sign Out">
            <LogOut size={15} />
          </button>
        </div>
      </header>

      {/* ── Main ──────────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">

        {/* Single Tabbed Sidebar */}
        <div className="w-72 border-r border-zinc-800/60 bg-[#080810] flex flex-col shrink-0 overflow-hidden">
          {/* Search + Tabs header */}
          <div className="p-3 border-b border-zinc-800/60 shrink-0 space-y-2">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-zinc-900/50 border border-zinc-800 text-xs text-zinc-200 rounded-lg pl-8 pr-4 py-2 focus:outline-none focus:border-indigo-500/40 focus:ring-1 focus:ring-indigo-500/20 transition-all placeholder:text-zinc-600"
              />
            </div>
            {/* Tabs */}
            <div className="flex items-center gap-1 bg-zinc-900/60 border border-zinc-800/60 rounded-lg p-0.5">
              <button
                onClick={() => setActiveTab("unanswered")}
                className={`flex-1 flex items-center justify-center gap-1.5 text-[11px] font-semibold py-1.5 rounded-md transition-all ${
                  activeTab === "unanswered"
                    ? "bg-indigo-600/80 text-white shadow-[0_0_10px_rgba(79,70,229,0.3)]"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                <Inbox size={11} />
                Unanswered
                {pendingEvaluations.length > 0 && (
                  <span className={`text-[9px] font-bold px-1 rounded ${
                    activeTab === "unanswered" ? "bg-white/20 text-white" : "bg-zinc-800 text-zinc-500"
                  }`}>{pendingEvaluations.length}</span>
                )}
              </button>
              <button
                onClick={() => setActiveTab("answered")}
                className={`flex-1 flex items-center justify-center gap-1.5 text-[11px] font-semibold py-1.5 rounded-md transition-all ${
                  activeTab === "answered"
                    ? "bg-emerald-600/70 text-white shadow-[0_0_10px_rgba(16,185,129,0.2)]"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                <CheckCircle2 size={11} />
                Answered
                {answeredEvaluations.length > 0 && (
                  <span className={`text-[9px] font-bold px-1 rounded ${
                    activeTab === "answered" ? "bg-white/20 text-white" : "bg-zinc-800 text-zinc-500"
                  }`}>{answeredEvaluations.length}</span>
                )}
              </button>
            </div>
          </div>

          {/* Scrollable list — independent of right panel */}
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {activeTab === "unanswered" ? (
              loading ? (
                <div className="flex justify-center p-10"><div className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" /></div>
              ) : filteredPending.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-8 text-center h-full gap-3">
                  <Inbox size={22} className="text-zinc-700" />
                  <p className="text-zinc-600 text-xs">No pending items.</p>
                </div>
              ) : (
                <ul className="divide-y divide-zinc-800/20">
                  {filteredPending.map((item) => {
                    const isSelected = selectedId === item.id;
                    return (
                      <li key={item.id}>
                        <button
                          onClick={() => { setSelectedId(item.id); closeCoachForm(); }}
                          className={`w-full text-left px-4 py-3.5 transition-all hover:bg-zinc-900/40 relative ${isSelected ? "bg-zinc-900/60" : ""}`}
                        >
                          {isSelected && <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-r bg-indigo-500" />}
                          <div className="flex items-center justify-between mb-1.5">
                            <span className={`text-[10px] uppercase font-bold tracking-widest ${isSelected ? "text-indigo-400" : "text-zinc-500"}`}>{item.topic}</span>
                            <span className="flex items-center gap-1 text-[10px] font-medium text-zinc-500 bg-zinc-800/50 px-1.5 py-0.5 rounded"><MessageSquare size={10} />{item.count || 1}</span>
                          </div>
                          <p className={`text-sm mb-2 line-clamp-2 leading-relaxed ${isSelected ? "text-zinc-200" : "text-zinc-400"}`}>"{item.queries[0]}"</p>
                          <div className="flex items-center gap-1.5 text-[10px] text-zinc-700">
                            <Clock size={11} /> {new Date(item.timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )
            ) : (
              loading ? (
                <div className="flex justify-center p-10"><div className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce" /></div>
              ) : filteredAnswered.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-8 text-center h-full gap-3">
                  <CheckCircle2 size={22} className="text-zinc-700" />
                  <p className="text-zinc-600 text-xs">No answered items.</p>
                </div>
              ) : (
                <ul className="divide-y divide-zinc-800/20">
                  {filteredAnswered.map((item) => {
                    const isSelected = selectedId === item.id;
                    const isApproved = item.status === "approved";
                    return (
                      <li key={item.id}>
                        <button
                          onClick={() => { setSelectedId(item.id); closeCoachForm(); }}
                          className={`w-full text-left px-4 py-3.5 transition-all hover:bg-zinc-900/40 relative ${isSelected ? "bg-zinc-900/60" : ""}`}
                        >
                          {isSelected && <div className={`absolute left-0 top-0 bottom-0 w-0.5 rounded-r ${isApproved ? "bg-emerald-500" : "bg-red-500/70"}`} />}
                          <div className="flex items-center justify-between mb-1.5">
                            <span className={`text-[10px] uppercase font-bold tracking-widest ${isSelected ? "text-indigo-400" : "text-zinc-500"}`}>{item.topic}</span>
                            <span className="flex items-center gap-1 text-[10px] font-medium text-zinc-500 bg-zinc-800/50 px-1.5 py-0.5 rounded"><MessageSquare size={10} />{item.count || 1}</span>
                          </div>
                          <p className={`text-sm mb-2 line-clamp-2 leading-relaxed ${isSelected ? "text-zinc-200" : "text-zinc-400"}`}>"{item.queries[0]}"</p>
                          <div className="flex items-center justify-between text-[10px] text-zinc-700">
                            <div className="flex items-center gap-1.5">
                              <Clock size={11} /> {new Date(item.timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                            </div>
                            <span className={`text-[9px] uppercase font-bold tracking-widest ${isApproved ? "text-emerald-500" : "text-red-400"}`}>
                              {isApproved ? "Injected" : "Spam"}
                            </span>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )
            )}
          </div>
        </div>
        {/* Right Panel */}
        <div className="flex-1 bg-[#080810] flex flex-col overflow-hidden relative">
          {error && (
            <div className="absolute top-4 left-4 right-4 z-20 bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg text-sm flex items-center gap-3">
              <AlertCircle size={15} />
              {error}
            </div>
          )}

          {!loading && selectedEval ? (
            <div className="flex-1 overflow-y-auto p-8 lg:p-12">
              <div className="max-w-3xl mx-auto space-y-8">

                {/* ── Page Header ─────────────────────────────────────────────── */}
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="px-2.5 py-1 rounded-md bg-zinc-900 border border-zinc-800 text-[11px] font-mono text-zinc-500 uppercase tracking-wider">
                        {selectedEval.topic}
                      </span>
                      <span className="text-[11px] text-zinc-600">{selectedEval.scenario}</span>
                    </div>
                    <h2 className="text-2xl font-bold text-zinc-100 leading-snug">
                      {selectedActiveTab === "pending" ? "Review AI Response" : "Answered Entry"}
                    </h2>
                    <p className="text-sm text-zinc-500 mt-1">
                      {selectedActiveTab === "pending"
                        ? "Coach the AI on how it should answer this type of question."
                        : "This entry has already been processed."}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 pt-1">
                    {selectedActiveTab === "pending" && !isCoachOpen && (
                      <button
                        onClick={() => openCoachForm(selectedEval)}
                        className="h-9 px-4 flex items-center gap-2 rounded-lg text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 border border-indigo-500/50 transition-all shadow-[0_0_16px_rgba(79,70,229,0.3)] focus:outline-none"
                      >
                        <Pen size={13} />
                        Resolve &amp; Coach AI
                      </button>
                    )}
                    {isCoachOpen && (
                      <button
                        onClick={closeCoachForm}
                        className="h-9 px-4 flex items-center gap-2 rounded-lg text-xs font-medium text-zinc-400 bg-zinc-900 border border-zinc-800 hover:text-zinc-200 transition-all focus:outline-none"
                      >
                        <RotateCcw size={13} />
                        Collapse
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(selectedEval.id)}
                      className="h-9 w-9 flex items-center justify-center rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 hover:border-red-500/20 transition-all focus:outline-none"
                      title="Permanently Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* ── User Queries ─────────────────────────────────────────────── */}
                <section>
                  <h3 className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 mb-3 flex items-center gap-2">
                    <MessageSquare size={13} />
                    User Queries
                    <span className="bg-zinc-800 text-zinc-500 text-[10px] font-bold px-1.5 py-0.5 rounded-full">{selectedEval.count}×</span>
                  </h3>
                  <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-xl overflow-hidden">
                    <ul className="divide-y divide-zinc-800/30">
                      {selectedEval.queries.map((q, idx) => (
                        <li key={idx} className="px-5 py-3.5 text-sm text-zinc-300 flex gap-4">
                          <span className="text-zinc-700 select-none text-[11px] mt-0.5 font-mono tabular-nums shrink-0">{(idx + 1).toString().padStart(2, "0")}</span>
                          <span className="leading-relaxed">{q}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </section>

                {/* ── AI Generated Response ────────────────────────────────────── */}
                <section>
                  <h3 className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 mb-3 flex items-center gap-2">
                    <Bot size={13} />
                    AI Generated Response
                    {selectedActiveTab === "pending" && (
                      <span className="text-[10px] text-amber-500/80 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">Needs Review</span>
                    )}
                  </h3>
                  <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
                    <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
                      {selectedEval.ai_response}
                    </p>
                  </div>
                </section>

                {/* ── Previous Coaching (answered tab) ────────────────────────── */}
                {selectedActiveTab === "answered" && selectedEval.admin_note && (
                  <section>
                    <h3 className="text-[11px] font-semibold uppercase tracking-widest text-emerald-500/80 mb-3 flex items-center gap-2">
                      <BookOpen size={13} />
                      Admin Coaching Applied
                    </h3>
                    <div className="border border-emerald-500/15 bg-emerald-500/5 rounded-xl p-5 space-y-3">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-500/60 mb-1.5">Coaching Note</p>
                      <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">{selectedEval.admin_note}</p>
                      <div className="flex items-start gap-2 pt-1 border-t border-emerald-500/10">
                        <Bot size={13} className="text-indigo-400 shrink-0 mt-0.5" />
                        <p className="text-[11px] text-zinc-600">The AI will generate its response guided by this instruction — no verbatim answer was stored.</p>
                      </div>
                    </div>
                  </section>
                )}

                {/* ── Coaching Form ────────────────────────────────────────────── */}
                {isCoachOpen && currentForm && (
                  <section className="border border-indigo-500/20 bg-indigo-500/[0.04] rounded-2xl overflow-hidden shadow-[0_0_40px_rgba(79,70,229,0.06)]">

                    {/* Form Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-indigo-500/15 bg-indigo-500/5">
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
                          <Sparkles size={13} className="text-indigo-400" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-zinc-100">AI Coaching Instruction</p>
                          <p className="text-[11px] text-zinc-500">Tell the AI <em>how</em> to respond. It will generate its own answer guided by your note.</p>
                        </div>
                      </div>
                      <ChevronDown size={16} className="text-zinc-600 cursor-pointer hover:text-zinc-400 transition-colors" onClick={closeCoachForm} />
                    </div>

                    <div className="p-6 space-y-5">

                      {/* Coaching Note — only field */}
                      <div>
                        <label className="flex items-center gap-2 text-xs font-semibold text-zinc-300 mb-1.5">
                          <span className="w-5 h-5 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 text-[10px] font-bold shrink-0">✍</span>
                          Admin Coaching Note
                          <span className="text-zinc-600 font-normal">(INSTRUKSI ADMIN)</span>
                        </label>
                        <p className="text-[11px] text-zinc-600 mb-2 ml-7">
                          Instruct the AI on <em>how</em> it should respond to questions like this. The AI will craft its own answer following your guidance.
                        </p>
                        <textarea
                          id="coaching-note"
                          rows={5}
                          value={currentForm.adminNote}
                          onChange={(e) => updateCoachForm(selectedEval.id, { adminNote: e.target.value })}
                          placeholder="e.g., Tolak dengan halus, arahkan user ke loket 3, jelaskan bahwa kita hanya melayani proses PBG, gunakan format yang ramah..."
                          className="w-full bg-[#080810] border border-zinc-800 focus:border-amber-500/30 focus:ring-1 focus:ring-amber-500/10 text-sm text-zinc-200 placeholder:text-zinc-700 rounded-xl px-4 py-3 resize-none transition-all outline-none leading-relaxed"
                        />
                      </div>

                      {/* Info callout — explains the AI will self-generate */}
                      <div className="flex items-start gap-3 bg-zinc-900/50 border border-zinc-800/60 rounded-xl p-4">
                        <Bot size={15} className="text-indigo-400 shrink-0 mt-0.5" />
                        <p className="text-[11px] text-zinc-500 leading-relaxed">
                          <span className="text-zinc-300 font-medium">The AI will generate the answer itself.</span>{" "}
                          Your coaching note will be injected as a high-priority instruction into future conversations about this topic. The AI response will <em>not</em> be copied verbatim.
                        </p>
                      </div>

                      {/* Golden Chunk Preview */}
                      {currentForm.adminNote && (
                        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-2 flex items-center gap-2">
                            <BookOpen size={11} />
                            Coaching Chunk Preview
                          </p>
                          <p className="text-[11px] text-zinc-500 font-mono leading-relaxed break-words">
                            <span className="text-indigo-400/70">PERTANYAAN:</span>{" "}
                            {selectedEval.queries.join(" / ")}{" "}
                            <span className="text-amber-400/70">| INSTRUKSI ADMIN:</span>{" "}
                            {currentForm.adminNote}
                          </p>
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="flex items-center gap-3 pt-1">
                        <button
                          id="save-inject-btn"
                          onClick={() => handleInjectKB(selectedEval)}
                          disabled={currentForm.submitting || !currentForm.adminNote.trim()}
                          className="flex-1 h-11 flex items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-[0_0_20px_rgba(79,70,229,0.2)] focus:outline-none"
                        >
                          {currentForm.submitting ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              Saving…
                            </>
                          ) : (
                            <>
                              <BookOpen size={15} />
                              Save Coaching Instruction
                            </>
                          )}
                        </button>

                        <button
                          id="spam-btn"
                          onClick={() => handleSpam(selectedEval.id)}
                          disabled={currentForm.submitting}
                          className="h-11 px-4 flex items-center gap-2 rounded-xl text-sm font-medium text-zinc-400 bg-zinc-900 border border-zinc-800 hover:text-red-400 hover:bg-red-500/10 hover:border-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all focus:outline-none"
                        >
                          <ShieldBan size={15} />
                          Mark as Spam / Ignore
                        </button>
                      </div>
                    </div>
                  </section>
                )}

                {/* Prompt when form is closed on pending tab */}
                {selectedActiveTab === "pending" && !isCoachOpen && (
                  <div className="rounded-xl border border-dashed border-zinc-800/80 p-5 text-center">
                    <p className="text-xs text-zinc-600">
                      Click{" "}
                      <span className="text-indigo-400 font-semibold">Resolve &amp; Coach AI</span>{" "}
                      above to provide coaching instructions and an official answer.
                    </p>
                  </div>
                )}

              </div>
            </div>
          ) : !loading ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-4">
              <Inbox size={28} className="text-zinc-800" />
              <p className="text-zinc-600 text-sm">Select an item from the inbox to review</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
