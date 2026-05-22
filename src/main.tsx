import React, { FormEvent, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Bot,
  Copy,
  Edit3,
  Eye,
  EyeOff,
  KeyRound,
  Link,
  LogOut,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Save,
  Send,
  Settings,
  Shield,
  Sparkles,
  GripVertical,
  Trash2,
  UserPlus,
  Users,
  Workflow
} from "lucide-react";
import "./styles.css";

type Role = "admin" | "user";

type User = {
  id: string;
  username: string;
  role: Role;
  enabled: boolean;
  createdAt: string;
};

type Model = {
  id: string;
  name: string;
  provider: string;
  kind: "chat" | "image";
  baseUrl: string;
  apiKey?: string;
  model: string;
  systemPrompt: string;
  enabled: boolean;
  hasApiKey: boolean;
  createdAt: string;
};

type Message = {
  role: "user" | "assistant" | "system";
  content: string;
  imageUrl?: string;
  createdAt: string;
  modelId?: string;
};

type Workspace = {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
};

type AgentStep = {
  id: string;
  prompt: string;
  modelId: string;
};

type AgentBlock =
  | {
      id: string;
      type: "text";
      content: string;
    }
  | {
      id: string;
      type: "model";
      modelId: string;
      variableName: string;
      title: string;
    };

type Agent = {
  id: string;
  userId: string;
  shareId: string;
  name: string;
  description: string;
  steps: AgentStep[];
  blocks: AgentBlock[];
  published: boolean;
  createdAt: string;
  updatedAt: string;
};

type IntegrationToken = {
  id: string;
  name: string;
  token?: string;
  enabled: boolean;
  createdAt: string;
};

type SystemSettings = {
  safetyRules: string;
};

type Session = {
  id: string;
  title: string;
  kind: "chat" | "agent";
  modelId?: string;
  agentId?: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
};

type PreviewTrace =
  | {
      type: "text";
      blockId: string;
      content: string;
      renderedContent: string;
    }
  | {
      type: "model";
      blockId: string;
      modelId: string;
      variableName: string;
      content: string;
      imageUrl?: string;
    };

const tokenKey = "enterprise-ai-token";

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem(tokenKey);
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "请求失败");
  return payload as T;
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function localId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function titleFrom(content: string) {
  return content.replace(/\s+/g, " ").slice(0, 32) || "新对话";
}

function emptyTextBlock(content = ""): AgentBlock {
  return { id: localId("blk"), type: "text", content };
}

function emptyModelBlock(models: Model[], index = 1): AgentBlock {
  return {
    id: localId("blk"),
    type: "model",
    modelId: models.find((model) => model.kind === "chat")?.id || models[0]?.id || "",
    variableName: `output_${index}`,
    title: `模型步骤 ${index}`
  };
}

function stepsToBlocks(steps: AgentStep[], models: Model[]): AgentBlock[] {
  if (!steps.length) return [emptyTextBlock(), emptyModelBlock(models, 1)];
  return steps.flatMap((step, index) => [
    emptyTextBlock(step.prompt),
    {
      id: step.id || localId("blk"),
      type: "model" as const,
      modelId: step.modelId,
      variableName: `output_${index + 1}`,
      title: `模型步骤 ${index + 1}`
    }
  ]);
}

function Login({ onDone }: { onDone: (user: User) => void }) {
  const [username, setUsername] = useState("IHD2025");
  const [password, setPassword] = useState("15658855442");
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const result = await api<{ token: string; user: User }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password })
      });
      localStorage.setItem(tokenKey, result.token);
      onDone(result.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
    }
  }

  return (
    <main className="login-shell">
      <form className="login-panel" onSubmit={submit}>
        <div className="brand-row">
          <img className="brand-logo" src="/ihd-logo.png" alt="IHD" />
          <div>
            <h1>I have a demo</h1>
            <p>内部多模型智能体训练平台</p>
          </div>
        </div>
        <label>
          账号
          <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
        </label>
        <label>
          密码
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" />
        </label>
        {error ? <div className="error">{error}</div> : null}
        <button className="primary" type="submit"><KeyRound size={18} />登录</button>
      </form>
    </main>
  );
}

function ChatApp({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [models, setModels] = useState<Model[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState("");
  const [draftModelId, setDraftModelId] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  const [view, setView] = useState<"chat" | "builder" | "admin">("chat");
  const [editingAgentId, setEditingAgentId] = useState("");
  const [isComposing, setIsComposing] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [waitIndex, setWaitIndex] = useState(0);

  const active = sessions.find((item) => item.id === activeId);
  const activeAgent = active?.agentId ? agents.find((agent) => agent.id === active.agentId) : undefined;
  const activeModelId = active?.modelId || draftModelId;
  const activeLoading = Boolean(loading[active?.id || "draft"]);
  const visibleAgents = agents.filter((agent) => agent.published);
  const waitMessages = [
    "AI疯狂翻书中 (ง •̀_•́)ง",
    "AI也会摸鱼哦 (￣▽￣)~*",
    "什么？刚睡醒，等我找找 (。-ω-)zzz",
    "答案正在路上 ( •̀ ω •́ )✧"
  ];

  async function refresh() {
    const [modelResult, agentResult, workspaceResult] = await Promise.all([
      api<{ models: Model[] }>("/api/models"),
      api<{ agents: Agent[] }>("/api/agents"),
      api<{ workspaces: Workspace[] }>("/api/workspaces")
    ]);
    setModels(modelResult.models);
    setAgents(agentResult.agents);
    setWorkspaces(workspaceResult.workspaces);
    setDraftModelId((current) => (modelResult.models.some((model) => model.id === current) ? current : modelResult.models[0]?.id || ""));
  }

  useEffect(() => {
    refresh().catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!Object.values(loading).some(Boolean)) return;
    const timer = window.setInterval(() => setWaitIndex((index) => index + 1), 1200);
    return () => window.clearInterval(timer);
  }, [loading]);

  function startNewChat() {
    setActiveId("");
    setView("chat");
    setContent("");
    setError("");
  }

  function openAgent(agent: Agent) {
    const createdAt = new Date().toISOString();
    const existing = sessions.find((session) => session.kind === "agent" && session.agentId === agent.id);
    if (existing) {
      setActiveId(existing.id);
    } else {
      const session: Session = {
        id: localId("ses"),
        title: agent.name,
        kind: "agent",
        agentId: agent.id,
        messages: [],
        createdAt,
        updatedAt: createdAt
      };
      setSessions((items) => [session, ...items]);
      setActiveId(session.id);
    }
    setView("chat");
    setError("");
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    const text = content.trim();
    if (!text || activeLoading) return;
    const createdAt = new Date().toISOString();
    const isAgentSession = active?.kind === "agent";
    const modelId = active?.modelId || draftModelId;
    if (!isAgentSession && !modelId) return;
    if (isAgentSession && !active.agentId) return;

    const sessionId = active?.id || localId("ses");
    const userMessage: Message = { role: "user", content: text, modelId, createdAt };
    setContent("");
    setError("");
    setLoading((items) => ({ ...items, [sessionId]: true }));

    if (!active) {
      const optimistic: Session = {
        id: sessionId,
        title: titleFrom(text),
        kind: "chat",
        modelId,
        messages: [userMessage],
        createdAt,
        updatedAt: createdAt
      };
      setSessions((items) => [optimistic, ...items]);
      setActiveId(sessionId);
    } else {
      setSessions((items) =>
        items.map((item) => item.id === active.id ? { ...item, messages: [...item.messages, userMessage], updatedAt: createdAt } : item)
      );
    }

    try {
      let assistantMessage: Message;
      if (isAgentSession) {
        const response = await api<{ reply: string; imageUrl?: string }>(`/api/agents/${active!.agentId}/chat`, {
          method: "POST",
          body: JSON.stringify({ content: text })
        });
        assistantMessage = { role: "assistant", content: response.reply, imageUrl: response.imageUrl, createdAt: new Date().toISOString() };
      } else {
        const response = await api<{ message: Message }>("/api/chat", {
          method: "POST",
          body: JSON.stringify({ content: text, modelId })
        });
        assistantMessage = response.message;
      }
      setSessions((items) =>
        items.map((item) => item.id === sessionId ? { ...item, messages: [...item.messages, assistantMessage], updatedAt: assistantMessage.createdAt } : item)
      );
    } catch (err) {
      setContent(text);
      setError(err instanceof Error ? err.message : "发送失败");
    } finally {
      setLoading((items) => ({ ...items, [sessionId]: false }));
    }
  }

  function handleComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !isComposing && !event.nativeEvent.isComposing) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  async function copyMarkdown(value: string) {
    await navigator.clipboard.writeText(value);
  }

  function deleteSession(session: Session) {
    setSessions((items) => items.filter((item) => item.id !== session.id));
    if (activeId === session.id) setActiveId("");
  }

  return (
    <main className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <aside className={`sidebar ${sidebarCollapsed ? "collapsed" : ""}`}>
        <div className="side-top">
          <div className="product">
            <img className="product-logo" src="/ihd-logo.png" alt="IHD" />
            <span>IHD</span>
          </div>
          <button
            className="icon-btn sidebar-toggle"
            title={sidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
          <button className="icon-btn" title="新对话" onClick={startNewChat}><Plus size={18} /></button>
        </div>
        <button className={`nav-item ${!activeId && view === "chat" ? "active" : ""}`} onClick={startNewChat}>
          <MessageSquare size={17} /><span>新聊天</span>
        </button>
        <button className={`nav-item ${view === "builder" ? "active" : ""}`} onClick={() => { setView("builder"); setActiveId(""); }}>
          <Workflow size={17} /><span>构建智能体</span>
        </button>
        {user.role === "admin" ? (
          <button className={`nav-item ${view === "admin" ? "active" : ""}`} onClick={() => { setView("admin"); setActiveId(""); }}>
            <Settings size={16} /><span>管理后台</span>
          </button>
        ) : null}

        <div className="sidebar-section">
          <div className="section-title"><span>智能体</span><Sparkles size={14} /></div>
          <div className="conversation-list compact">
            {visibleAgents.length ? visibleAgents.map((agent) => (
              <button className={`conversation ${active?.agentId === agent.id ? "active" : ""}`} key={agent.id} onClick={() => openAgent(agent)}>
                <Bot size={16} /><span>{agent.name}</span>
              </button>
            )) : <p className="sidebar-empty">还没有发布的智能体</p>}
          </div>
        </div>

        <div className="sidebar-section">
          <div className="section-title"><span>对话</span><span>{sessions.length}</span></div>
          <div className="conversation-list">
            {sessions.map((session) => (
              <div className={`conversation-row ${session.id === activeId ? "active" : ""}`} key={session.id}>
                <button className="conversation-main" onClick={() => { setActiveId(session.id); setView("chat"); }}>
                  {session.kind === "agent" ? <Bot size={16} /> : <MessageSquare size={16} />}
                  <span>{session.title}</span>
                </button>
                <button className="icon-inline danger-inline" title="清除" onClick={() => deleteSession(session)}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        </div>

        <div className="side-bottom">
          <button className="ghost" onClick={onLogout}><LogOut size={17} /><span>退出</span></button>
        </div>
      </aside>

      {view === "admin" && user.role === "admin" ? (
        <AdminPanel refreshModels={refresh} />
      ) : view === "builder" ? (
        <AgentBuilder
          models={models}
          agents={agents}
          editingAgentId={editingAgentId}
          setEditingAgentId={setEditingAgentId}
          reload={refresh}
        />
      ) : (
        <section className="chat">
          <header className="chat-header">
            <div className="chat-title">
              <strong>{activeAgent?.name || active?.title || "新对话"}</strong>
              <span>{activeAgent ? "智能体运行模式" : "不保存后台聊天记录"}</span>
            </div>
            <div className="chat-controls">
              {!active || active.kind === "chat" ? (
                <select value={activeModelId} onChange={(event) => setDraftModelId(event.target.value)} disabled={Boolean(active)}>
                  {models.length ? null : <option>暂无可用模型</option>}
                  {models.map((model) => (
                    <option key={model.id} value={model.id}>{model.kind === "image" ? "图片" : "聊天"} · {model.name} · {model.model}</option>
                  ))}
                </select>
              ) : null}
            </div>
          </header>
          <div className="messages">
            {(active?.messages ?? []).length ? active!.messages.map((message, index) => (
              <article key={`${message.createdAt}-${index}`} className={`message ${message.role}`}>
                <div className="avatar">{message.role === "user" ? user.username.slice(0, 1).toUpperCase() : "IHD"}</div>
                <div className="bubble">
                  {message.role === "assistant" ? (
                    <>
                      <div className="markdown-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown></div>
                      <button className="copy-message" onClick={() => copyMarkdown(message.content)}><Copy size={14} /></button>
                    </>
                  ) : <pre>{message.content}</pre>}
                  {message.imageUrl ? <img className="generated-image" src={message.imageUrl} alt={message.content} /> : null}
                  <small>{dateTime(message.createdAt)}</small>
                </div>
              </article>
            )) : (
              <div className="empty-state">
                <Sparkles size={44} />
                <h2>{activeAgent ? "开始使用这个智能体" : "选择模型后开始提问"}</h2>
                {activeAgent?.description ? <p>{activeAgent.description}</p> : <p>聊天内容只保留在当前浏览器页面，刷新后不会恢复。</p>}
              </div>
            )}
            {activeLoading ? <div className="typing">{waitMessages[waitIndex % waitMessages.length]}</div> : null}
          </div>
          <form className="composer" onSubmit={send}>
            {error ? <div className="error">{error}</div> : null}
            <div className="composer-row">
              <textarea
                value={content}
                onChange={(event) => setContent(event.target.value)}
                onCompositionStart={() => setIsComposing(true)}
                onCompositionEnd={() => setIsComposing(false)}
                onKeyDown={handleComposerKeyDown}
                placeholder="输入消息，Enter 发送，Shift+Enter 换行"
                rows={2}
              />
              <button className="primary send" type="submit" disabled={activeLoading || (!activeAgent && !activeModelId)}><Send size={18} /></button>
            </div>
          </form>
        </section>
      )}
    </main>
  );
}

function AgentBuilder({
  models,
  agents,
  editingAgentId,
  setEditingAgentId,
  reload
}: {
  models: Model[];
  agents: Agent[];
  editingAgentId: string;
  setEditingAgentId: (id: string) => void;
  reload: () => Promise<void>;
}) {
  const editing = agents.find((agent) => agent.id === editingAgentId);
  const [form, setForm] = useState({ name: "", description: "", published: false, blocks: [emptyTextBlock(), emptyModelBlock(models, 1)] as AgentBlock[] });
  const [commandMenu, setCommandMenu] = useState<{ blockId: string; kind: "slash" | "mention"; top: number; left: number } | null>(null);
  const [selectedModelBlockId, setSelectedModelBlockId] = useState("");
  const [agentListCollapsed, setAgentListCollapsed] = useState(false);
  const [draggingBlockId, setDraggingBlockId] = useState("");
  const [publishDialogAgent, setPublishDialogAgent] = useState<Agent | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewInput, setPreviewInput] = useState("");
  const [previewResult, setPreviewResult] = useState("");
  const [previewTrace, setPreviewTrace] = useState<PreviewTrace[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [builderError, setBuilderError] = useState("");
  const chatModels = models.filter((model) => model.kind === "chat");
  const variableNames = form.blocks
    .filter((block): block is Extract<AgentBlock, { type: "model" }> => block.type === "model")
    .map((block) => block.variableName);

  useEffect(() => {
    if (editing) {
      setForm({
        name: editing.name,
        description: editing.description,
        published: editing.published,
        blocks: editing.blocks?.length ? editing.blocks : stepsToBlocks(editing.steps, models)
      });
    } else {
      setForm({ name: "", description: "", published: false, blocks: [emptyTextBlock(), emptyModelBlock(models, 1)] });
    }
    setPreviewResult("");
    setPreviewTrace([]);
    setSelectedModelBlockId("");
    setBuilderError("");
  }, [editingAgentId, editing?.updatedAt, models.length]);

  function updateBlock(id: string, patch: Partial<AgentBlock>) {
    setForm((current) => ({
      ...current,
      blocks: current.blocks.map((block) => block.id === id ? ({ ...block, ...patch } as AgentBlock) : block)
    }));
  }

  function insertBlockAfter(id: string, block: AgentBlock) {
    setForm((current) => {
      const index = current.blocks.findIndex((item) => item.id === id);
      const next = [...current.blocks];
      next.splice(index + 1, 0, block);
      return { ...current, blocks: next };
    });
    setCommandMenu(null);
  }

  function insertVariable(blockId: string, variableName: string) {
    setForm((current) => ({
      ...current,
      blocks: current.blocks.map((block) =>
        block.id === blockId && block.type === "text"
          ? { ...block, content: `${block.content.replace(/[@/]$/, "")}{{${variableName}}}` }
          : block
      )
    }));
    setCommandMenu(null);
  }

  function removeBlock(id: string) {
    setForm((current) => {
      const blocks = current.blocks.filter((block) => block.id !== id);
      return { ...current, blocks: blocks.length ? blocks : [emptyTextBlock(), emptyModelBlock(models, 1)] };
    });
  }

  function moveBlock(targetId: string) {
    if (!draggingBlockId || draggingBlockId === targetId) return;
    setForm((current) => {
      const from = current.blocks.findIndex((block) => block.id === draggingBlockId);
      const to = current.blocks.findIndex((block) => block.id === targetId);
      if (from < 0 || to < 0) return current;
      const blocks = [...current.blocks];
      const [moved] = blocks.splice(from, 1);
      blocks.splice(to, 0, moved);
      return { ...current, blocks };
    });
  }

  async function saveAgent(event: FormEvent) {
    event.preventDefault();
    setBuilderError("");
    if (!form.name.trim()) {
      setBuilderError("请填写智能体名称。");
      return;
    }
    if (!form.description.trim()) {
      setBuilderError("请填写说明。");
      return;
    }
    const payload = {
      ...form,
      published: true,
      blocks: form.blocks
        .map((block) => block.type === "text" ? { ...block, content: block.content.trim() } : block)
        .filter((block) => block.type === "model" || block.content)
    };
    let savedAgent: Agent;
    if (editing) {
      const result = await api<{ agent: Agent }>(`/api/agents/${editing.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      savedAgent = result.agent;
    } else {
      const result = await api<{ agent: Agent }>("/api/agents", { method: "POST", body: JSON.stringify(payload) });
      setEditingAgentId(result.agent.id);
      savedAgent = result.agent;
    }
    await reload();
    setPublishDialogAgent(savedAgent);
  }

  async function copyShareLink(agent: Agent) {
    const url = `${window.location.origin}/agent/${agent.shareId}`;
    await navigator.clipboard.writeText(url);
  }

  async function runPreview() {
    setPreviewLoading(true);
    setPreviewResult("");
    setPreviewTrace([]);
    try {
      const result = await api<{ reply: string; trace: PreviewTrace[] }>("/api/agents/preview", {
        method: "POST",
        body: JSON.stringify({ ...form, content: previewInput || "请用一句话测试这个智能体。" })
      });
      setPreviewResult("");
      setPreviewTrace(result.trace || []);
    } catch (err) {
      setPreviewResult(err instanceof Error ? err.message : "试运行失败");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function deleteAgent(agent: Agent) {
    if (!confirm(`确认删除智能体「${agent.name}」？`)) return;
    await api(`/api/agents/${agent.id}`, { method: "DELETE" });
    setEditingAgentId("");
    await reload();
  }

  return (
    <section className="builder-page">
      <header className="admin-header">
        <div>
          <h2>智能体构建器</h2>
          <p>像写文档一样编排提示词，输入 / 插入模型块或引用上方变量。</p>
        </div>
        <div className="builder-header-actions">
          <button className="secondary" onClick={() => setEditingAgentId("")}><Plus size={16} />新建</button>
          <button className="secondary" type="button" onClick={() => setPreviewOpen(true)}><Send size={15} />试运行</button>
        </div>
      </header>
      <div className={`builder-layout immersive ${agentListCollapsed ? "agent-list-collapsed" : ""}`}>
        <aside className="agent-list">
          <button className="agent-list-toggle" type="button" onClick={() => setAgentListCollapsed(!agentListCollapsed)}>
            {agentListCollapsed ? "展开" : "收起"}
          </button>
          {agentListCollapsed ? null : agents.map((agent) => (
            <button className={`agent-card ${agent.id === editingAgentId ? "active" : ""}`} key={agent.id} onClick={() => setEditingAgentId(agent.id)}>
              <span>{agent.name}</span>
              <small>{agent.published ? "已发布" : "草稿"} · {agent.blocks?.filter((block) => block.type === "model").length || agent.steps.length} 个模型块</small>
            </button>
          ))}
        </aside>
        <form className="builder-form doc-builder" onSubmit={saveAgent}>
          {builderError ? <div className="error no-margin">{builderError}</div> : null}
          <div className="builder-fields">
            <label>智能体名称<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="如：周报润色助手" /></label>
            <label>说明<input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="给侧边栏使用者看的简短说明" /></label>
          </div>
          <div className="document-editor">
            {form.blocks.map((block, index) => {
              const availableVariables = ["input", ...form.blocks
                .slice(0, index)
                .filter((item): item is Extract<AgentBlock, { type: "model" }> => item.type === "model")
                .map((item) => item.variableName)];
              return (
              block.type === "text" ? (
                <div
                  className={`doc-text-wrap ${draggingBlockId === block.id ? "dragging" : ""}`}
                  key={block.id}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => moveBlock(block.id)}
                >
                  <button
                    className="drag-handle"
                    type="button"
                    draggable
                    onDragStart={() => setDraggingBlockId(block.id)}
                    onDragEnd={() => setDraggingBlockId("")}
                    title="拖拽排序"
                  >
                    <GripVertical size={16} />
                  </button>
                  <textarea
                    className="doc-textarea"
                    value={block.content}
                    onChange={(event) => {
                      updateBlock(block.id, { content: event.target.value });
                      if (!event.target.value.endsWith("/") && !event.target.value.endsWith("@")) setCommandMenu(null);
                    }}
                    onBlur={() => window.setTimeout(() => setCommandMenu(null), 140)}
                    onKeyUp={(event) => {
                      const value = event.currentTarget.value;
                      if (value.endsWith("/") || value.endsWith("@")) {
                        const rect = event.currentTarget.getBoundingClientRect();
                        setCommandMenu({
                          blockId: block.id,
                          kind: value.endsWith("/") ? "slash" : "mention",
                          top: rect.bottom + window.scrollY - 4,
                          left: rect.left + window.scrollX + 12
                        });
                      }
                    }}
                    rows={Math.max(3, block.content.split("\n").length + 1)}
                    placeholder="直接写提示词。输入 / 插入模型，输入 @ 引用上方变量。"
                  />
                  <button className="doc-remove" type="button" onClick={() => removeBlock(block.id)} title="删除文本块"><Trash2 size={14} /></button>
                  {commandMenu?.blockId === block.id ? (
                    <div className="slash-menu" style={{ top: commandMenu.top, left: commandMenu.left }}>
                      {commandMenu.kind === "slash" ? (
                        <button type="button" onClick={() => insertBlockAfter(block.id, emptyModelBlock(models, variableNames.length + 1))}><Bot size={15} />插入大模型模块</button>
                      ) : null}
                      {availableVariables.map((name) => <button type="button" key={name} onClick={() => insertVariable(block.id, name)}>引用变量：{name}</button>)}
                    </div>
                  ) : null}
                </div>
              ) : (
                <article
                  className={`model-block compact-model ${selectedModelBlockId === block.id ? "active" : ""} ${draggingBlockId === block.id ? "dragging" : ""}`}
                  key={block.id}
                  onClick={() => setSelectedModelBlockId(block.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => moveBlock(block.id)}
                >
                  <button
                    className="drag-handle"
                    type="button"
                    draggable
                    onDragStart={() => setDraggingBlockId(block.id)}
                    onDragEnd={() => setDraggingBlockId("")}
                    title="拖拽排序"
                  >
                    <GripVertical size={16} />
                  </button>
                  <div className="model-chip-main">
                    <Bot size={17} />
                    <strong>{block.title || `模型模块 ${index + 1}`}</strong>
                    <span>{chatModels.find((model) => model.id === block.modelId)?.name || "未选择模型"}</span>
                    <code>{`{{${block.variableName}}}`}</code>
                  </div>
                  <button
                    className="doc-remove inline"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      removeBlock(block.id);
                    }}
                    title="移除模型块"
                  >
                    <Trash2 size={15} />
                  </button>
                </article>
              )
            )})}
          </div>
          <div className="builder-actions">
            <button className="secondary" type="button" onClick={() => setForm({ ...form, blocks: [...form.blocks, emptyTextBlock()] })}><Plus size={16} />文本块</button>
            <button className="secondary" type="button" onClick={() => setForm({ ...form, blocks: [...form.blocks, emptyModelBlock(models, variableNames.length + 1)] })}><Bot size={16} />模型块</button>
            <button className="primary builder-save" type="submit"><Save size={16} />保存智能体</button>
            {editing?.published ? <button className="secondary" type="button" onClick={() => copyShareLink(editing)}><Link size={15} />复制独立链接</button> : null}
            {editing ? <button className="danger" type="button" onClick={() => deleteAgent(editing)}><Trash2 size={15} />删除</button> : null}
          </div>
        </form>
        {selectedModelBlockId ? (
          <div className="drawer-backdrop" onClick={() => setSelectedModelBlockId("")}>
          <aside className="model-drawer slideout" onClick={(event) => event.stopPropagation()}>
            {form.blocks
              .filter((block): block is Extract<AgentBlock, { type: "model" }> => block.type === "model" && block.id === selectedModelBlockId)
              .map((block) => (
                <div className="drawer-panel" key={block.id}>
                  <div className="drawer-head">
                    <h3>编辑模型模块</h3>
                    <button className="ghost compact-btn" type="button" onClick={() => setSelectedModelBlockId("")}>关闭</button>
                  </div>
                  <label>模块名称<input value={block.title} onChange={(event) => updateBlock(block.id, { title: event.target.value })} /></label>
                  <label>输出变量名<input value={block.variableName} onChange={(event) => updateBlock(block.id, { variableName: event.target.value.replace(/[^A-Za-z0-9_]/g, "_") })} /></label>
                  <label>选择模型
                    <select value={block.modelId} onChange={(event) => updateBlock(block.id, { modelId: event.target.value })}>
                      {chatModels.map((model) => <option key={model.id} value={model.id}>{model.name} · {model.model}</option>)}
                    </select>
                  </label>
                  <p className="hint no-margin">这个模块会读取上方文档内容和已生成变量，输出保存为 <code>{`{{${block.variableName}}}`}</code>。</p>
                </div>
              ))}
          </aside>
          </div>
        ) : null}
      </div>
      {previewOpen ? (
        <div className="drawer-backdrop" onClick={() => setPreviewOpen(false)}>
          <aside className="model-drawer preview-drawer slideout" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-panel">
              <div className="drawer-head">
                <div>
                  <h3>试运行</h3>
                  <p className="hint no-margin">这里的内容就是初始变量 <code>{`{{input}}`}</code>，可留空。</p>
                </div>
                <button className="ghost compact-btn" type="button" onClick={() => setPreviewOpen(false)}>关闭</button>
              </div>
              <label>input<textarea value={previewInput} onChange={(event) => setPreviewInput(event.target.value)} rows={4} placeholder="输入一段测试内容，可以留空" /></label>
              <button className="primary builder-save" type="button" disabled={previewLoading} onClick={runPreview}>
                <Send size={15} />{previewLoading ? "AI疯狂翻书中 (ง •̀_•́)ง" : "运行"}
              </button>
              {previewTrace.length ? (
                <div className="preview-trace">
                  {previewTrace.map((item, index) => (
                    <article className={`preview-node ${item.type}`} key={`${item.blockId}-${index}`}>
                      {item.type === "text" ? (
                        <>
                          <div className="step-head">
                            <strong>文本块</strong>
                            <span>传给下一个模型块的提示词</span>
                          </div>
                          <pre>{item.renderedContent || item.content || "空文本块"}</pre>
                        </>
                      ) : (
                        <>
                          <div className="step-head">
                            <strong>模型输出</strong>
                            <code>{`{{${item.variableName}}}`}</code>
                          </div>
                          <div className="markdown-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{item.content}</ReactMarkdown></div>
                        </>
                      )}
                    </article>
                  ))}
                </div>
              ) : null}
              {previewResult ? <div className="preview-output"><ReactMarkdown remarkPlugins={[remarkGfm]}>{previewResult}</ReactMarkdown></div> : null}
            </div>
          </aside>
        </div>
      ) : null}
      {publishDialogAgent ? (
        <div className="modal-backdrop" onClick={() => setPublishDialogAgent(null)}>
          <div className="publish-modal" onClick={(event) => event.stopPropagation()}>
            <h3>智能体已发布</h3>
            <p>{publishDialogAgent.name} 已出现在左侧智能体列表，也可以用独立链接打开。</p>
            <code>{`${window.location.origin}/agent/${publishDialogAgent.shareId}`}</code>
            <div className="builder-actions">
              <button className="primary builder-save" type="button" onClick={() => copyShareLink(publishDialogAgent)}>复制链接</button>
              <button className="secondary" type="button" onClick={() => setPublishDialogAgent(null)}>完成</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function AdminPanel({ refreshModels }: { refreshModels: () => Promise<void> }) {
  const [tab, setTab] = useState<"settings" | "users" | "models" | "tokens">("settings");
  const [users, setUsers] = useState<User[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [tokens, setTokens] = useState<IntegrationToken[]>([]);
  const [settings, setSettings] = useState<SystemSettings>({ safetyRules: "" });
  const [notice, setNotice] = useState("");

  async function load() {
    const [settingsResult, userResult, modelResult, tokenResult] = await Promise.all([
      api<{ settings: SystemSettings }>("/api/admin/settings"),
      api<{ users: User[] }>("/api/admin/users"),
      api<{ models: Model[] }>("/api/admin/models"),
      api<{ tokens: IntegrationToken[] }>("/api/admin/integration-tokens")
    ]);
    setSettings(settingsResult.settings);
    setUsers(userResult.users);
    setModels(modelResult.models);
    setTokens(tokenResult.tokens);
  }

  useEffect(() => {
    load().catch((err) => setNotice(err.message));
  }, []);

  return (
    <section className="admin-page">
      <header className="admin-header">
        <div>
          <h2>管理后台</h2>
          <p>账号、模型和机器人 API。后台不再保存用户聊天记录。</p>
        </div>
      </header>
      <nav className="tabs">
        <button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}><Shield size={16} />规则</button>
        <button className={tab === "users" ? "active" : ""} onClick={() => setTab("users")}><Users size={16} />账号</button>
        <button className={tab === "models" ? "active" : ""} onClick={() => setTab("models")}><Bot size={16} />模型</button>
        <button className={tab === "tokens" ? "active" : ""} onClick={() => setTab("tokens")}><KeyRound size={16} />API Token</button>
      </nav>
      {notice ? <div className="notice">{notice}</div> : null}
      <div className="admin-body">
        {tab === "settings" ? <SettingsTab settings={settings} setNotice={setNotice} reload={load} /> : null}
        {tab === "users" ? <UsersTab users={users} reload={load} /> : null}
        {tab === "models" ? <ModelsTab models={models} reload={async () => { await load(); await refreshModels(); }} /> : null}
        {tab === "tokens" ? <TokensTab tokens={tokens} reload={load} setNotice={setNotice} /> : null}
      </div>
    </section>
  );
}

function SettingsTab({ settings, reload, setNotice }: { settings: SystemSettings; reload: () => Promise<void>; setNotice: (notice: string) => void }) {
  const [safetyRules, setSafetyRules] = useState(settings.safetyRules);
  useEffect(() => setSafetyRules(settings.safetyRules), [settings.safetyRules]);

  async function save(event: FormEvent) {
    event.preventDefault();
    await api("/api/admin/settings", { method: "PATCH", body: JSON.stringify({ safetyRules }) });
    setNotice("系统内置安全规则已保存");
    await reload();
  }

  return (
    <form className="settings-panel" onSubmit={save}>
      <label className="field-label">系统内置安全规则<textarea value={safetyRules} onChange={(event) => setSafetyRules(event.target.value)} rows={8} /></label>
      <button className="primary settings-save" type="submit"><Save size={16} />保存规则</button>
    </form>
  );
}

function UsersTab({ users, reload }: { users: User[]; reload: () => Promise<void> }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [editing, setEditing] = useState<Record<string, { username: string; role: Role; enabled: boolean; password: string }>>({});

  async function createUser(event: FormEvent) {
    event.preventDefault();
    await api("/api/admin/users", { method: "POST", body: JSON.stringify({ username, password, role: "user" }) });
    setUsername("");
    setPassword("");
    await reload();
  }

  async function saveUser(user: User) {
    const draft = editing[user.id];
    if (!draft) return;
    await api(`/api/admin/users/${user.id}`, { method: "PATCH", body: JSON.stringify(draft) });
    setEditing(({ [user.id]: _removed, ...rest }) => rest);
    await reload();
  }

  async function deleteUser(user: User) {
    if (!confirm(`确认删除账号 ${user.username}？该账号创建的智能体也会删除。`)) return;
    await api(`/api/admin/users/${user.id}`, { method: "DELETE" });
    await reload();
  }

  return (
    <div className="admin-grid">
      <form className="admin-form" onSubmit={createUser}>
        <h3><UserPlus size={17} />开通账号</h3>
        <input placeholder="用户名" value={username} onChange={(event) => setUsername(event.target.value)} />
        <input placeholder="初始密码" value={password} onChange={(event) => setPassword(event.target.value)} />
        <button className="primary"><Plus size={16} />创建</button>
      </form>
      <div className="table">
        {users.map((user) => (
          <div className="table-row editable-row" key={user.id}>
            {editing[user.id] ? (
              <>
                <label className="field-label">用户名<input value={editing[user.id].username} onChange={(event) => setEditing({ ...editing, [user.id]: { ...editing[user.id], username: event.target.value } })} /></label>
                <label className="field-label">角色<select value={editing[user.id].role} onChange={(event) => setEditing({ ...editing, [user.id]: { ...editing[user.id], role: event.target.value as Role } })}><option value="user">普通用户</option><option value="admin">管理员</option></select></label>
                <label className="field-label">新密码<input placeholder="留空不改" value={editing[user.id].password} onChange={(event) => setEditing({ ...editing, [user.id]: { ...editing[user.id], password: event.target.value } })} /></label>
                <label className="inline-check"><input type="checkbox" checked={editing[user.id].enabled} onChange={(event) => setEditing({ ...editing, [user.id]: { ...editing[user.id], enabled: event.target.checked } })} />启用</label>
                <button className="secondary" onClick={() => saveUser(user)}><Save size={15} />保存</button>
              </>
            ) : (
              <>
                <span>{user.username}<small>{user.enabled ? "启用" : "停用"}</small></span>
                <span>{user.role === "admin" ? "管理员" : "普通用户"}</span>
                <button className="secondary" onClick={() => setEditing({ ...editing, [user.id]: { username: user.username, role: user.role, enabled: user.enabled, password: "" } })}><Edit3 size={15} />编辑</button>
                <button className="secondary" onClick={async () => { await api(`/api/admin/users/${user.id}`, { method: "PATCH", body: JSON.stringify({ enabled: !user.enabled }) }); await reload(); }}>{user.enabled ? "停用" : "启用"}</button>
                <button className="danger" onClick={() => deleteUser(user)}><Trash2 size={15} />删除</button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ModelsTab({ models, reload }: { models: Model[]; reload: () => Promise<void> }) {
  const [form, setForm] = useState({ name: "", kind: "chat" as "chat" | "image", baseUrl: "https://app.yylx.io/v1", apiKey: "", model: "", systemPrompt: "", enabled: true });
  const [editing, setEditing] = useState<Record<string, { name: string; kind: "chat" | "image"; baseUrl: string; model: string; apiKey: string; systemPrompt: string; enabled: boolean }>>({});

  async function createModel(event: FormEvent) {
    event.preventDefault();
    await api("/api/admin/models", { method: "POST", body: JSON.stringify(form) });
    setForm({ name: "", kind: "chat", baseUrl: "https://app.yylx.io/v1", apiKey: "", model: "", systemPrompt: "", enabled: true });
    await reload();
  }

  async function saveModel(model: Model) {
    const draft = editing[model.id];
    if (!draft) return;
    await api(`/api/admin/models/${model.id}`, { method: "PATCH", body: JSON.stringify(draft) });
    setEditing(({ [model.id]: _removed, ...rest }) => rest);
    await reload();
  }

  async function deleteModel(model: Model) {
    if (!confirm(`确认删除模型 ${model.name}？`)) return;
    await api(`/api/admin/models/${model.id}`, { method: "DELETE" });
    await reload();
  }

  return (
    <div className="admin-grid wide">
      <form className="admin-form" onSubmit={createModel}>
        <h3><Bot size={17} />接入模型</h3>
        <input placeholder="展示名称，如 通义千问" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        <select value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value as "chat" | "image" })}><option value="chat">聊天模型</option><option value="image">图片模型</option></select>
        <input placeholder="Base URL" value={form.baseUrl} onChange={(event) => setForm({ ...form, baseUrl: event.target.value })} />
        <input placeholder="API Key" value={form.apiKey} onChange={(event) => setForm({ ...form, apiKey: event.target.value })} />
        <input placeholder="模型 ID，如 qwen-plus / gpt-image-2" value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} />
        <textarea placeholder="模型默认 System Prompt，可留空" value={form.systemPrompt} rows={4} onChange={(event) => setForm({ ...form, systemPrompt: event.target.value })} />
        <label className="check"><input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} />启用</label>
        <button className="primary"><Plus size={16} />保存模型</button>
      </form>
      <div className="table">
        {models.map((model) => (
          <div className="table-row model-row editable-row" key={model.id}>
            {editing[model.id] ? (
              <>
                <label className="field-label">展示名称<input value={editing[model.id].name} onChange={(event) => setEditing({ ...editing, [model.id]: { ...editing[model.id], name: event.target.value } })} /></label>
                <label className="field-label">类型<select value={editing[model.id].kind} onChange={(event) => setEditing({ ...editing, [model.id]: { ...editing[model.id], kind: event.target.value as "chat" | "image" } })}><option value="chat">聊天模型</option><option value="image">图片模型</option></select></label>
                <label className="field-label">Base URL<input value={editing[model.id].baseUrl} onChange={(event) => setEditing({ ...editing, [model.id]: { ...editing[model.id], baseUrl: event.target.value } })} /></label>
                <label className="field-label">模型 ID<input value={editing[model.id].model} onChange={(event) => setEditing({ ...editing, [model.id]: { ...editing[model.id], model: event.target.value } })} /></label>
                <label className="field-label">API Key<input value={editing[model.id].apiKey} onChange={(event) => setEditing({ ...editing, [model.id]: { ...editing[model.id], apiKey: event.target.value } })} /></label>
                <label className="field-label model-prompt-field">System Prompt<textarea rows={4} value={editing[model.id].systemPrompt} onChange={(event) => setEditing({ ...editing, [model.id]: { ...editing[model.id], systemPrompt: event.target.value } })} /></label>
                <label className="inline-check"><input type="checkbox" checked={editing[model.id].enabled} onChange={(event) => setEditing({ ...editing, [model.id]: { ...editing[model.id], enabled: event.target.checked } })} />启用</label>
                <button className="secondary" onClick={() => saveModel(model)}><Save size={15} />保存</button>
              </>
            ) : (
              <>
                <span>{model.name}<small>{model.kind === "image" ? "图片" : "聊天"} · {model.model}</small></span>
                <span>{model.hasApiKey ? "已配置 Key" : "缺少 Key"}</span>
                <button className="secondary" onClick={() => setEditing({ ...editing, [model.id]: { name: model.name, kind: model.kind, baseUrl: model.baseUrl, model: model.model, apiKey: model.apiKey || "", systemPrompt: model.systemPrompt || "", enabled: model.enabled } })}><Edit3 size={15} />编辑</button>
                <button className="secondary" onClick={async () => { await api(`/api/admin/models/${model.id}`, { method: "PATCH", body: JSON.stringify({ enabled: !model.enabled }) }); await reload(); }}>{model.enabled ? "停用" : "启用"}</button>
                <button className="danger" onClick={() => deleteModel(model)}><Trash2 size={15} />删除</button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function TokensTab({ tokens, reload, setNotice }: { tokens: IntegrationToken[]; reload: () => Promise<void>; setNotice: (notice: string) => void }) {
  const [name, setName] = useState("");
  const [visible, setVisible] = useState<Record<string, boolean>>({});

  async function createToken(event: FormEvent) {
    event.preventDefault();
    const result = await api<{ token: IntegrationToken }>("/api/admin/integration-tokens", { method: "POST", body: JSON.stringify({ name }) });
    setNotice(`已生成 Token：${result.token.name}`);
    setVisible({ ...visible, [result.token.id]: true });
    setName("");
    await reload();
  }

  function maskToken(value?: string) {
    if (!value) return "旧 Token 无明文";
    return `${value.slice(0, 8)}${"*".repeat(24)}${value.slice(-6)}`;
  }

  return (
    <div className="admin-grid">
      <form className="admin-form" onSubmit={createToken}>
        <h3><KeyRound size={17} />机器人接入</h3>
        <p className="hint no-margin">Token 用于外部机器人服务端调用 `/api/integrations/chat`。</p>
        <input placeholder="Token 名称" value={name} onChange={(event) => setName(event.target.value)} />
        <button className="primary"><Plus size={16} />生成 Token</button>
      </form>
      <div className="table">
        {tokens.map((token) => (
          <div className="table-row token-row" key={token.id}>
            <span>{token.name}</span>
            <code>{visible[token.id] ? token.token || "旧 Token 无明文" : maskToken(token.token)}</code>
            <span>{token.enabled ? "启用" : "停用"}</span>
            <span>{dateTime(token.createdAt)}</span>
            <button className="secondary" onClick={() => setVisible({ ...visible, [token.id]: !visible[token.id] })}>{visible[token.id] ? <EyeOff size={15} /> : <Eye size={15} />}{visible[token.id] ? "隐藏" : "显示"}</button>
            <button className="secondary" onClick={async () => { if (token.token) await navigator.clipboard.writeText(token.token); }}><Copy size={15} />复制</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function PublicAgentPage({ shareId }: { shareId: string }) {
  const [agent, setAgent] = useState<{ shareId: string; name: string; description: string } | null>(null);
  const [content, setContent] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ agent: { shareId: string; name: string; description: string } }>(`/api/public/agents/${shareId}`)
      .then((result) => setAgent(result.agent))
      .catch((err) => setError(err.message));
  }, [shareId]);

  async function send(event: FormEvent) {
    event.preventDefault();
    const text = content.trim();
    if (!text || loading) return;
    const userMessage: Message = { role: "user", content: text, createdAt: new Date().toISOString() };
    setMessages((items) => [...items, userMessage]);
    setContent("");
    setLoading(true);
    setError("");
    try {
      const result = await api<{ reply: string; imageUrl?: string }>(`/api/public/agents/${shareId}/chat`, {
        method: "POST",
        body: JSON.stringify({ content: text })
      });
      setMessages((items) => [...items, { role: "assistant", content: result.reply, imageUrl: result.imageUrl, createdAt: new Date().toISOString() }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "发送失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="public-agent-page">
      <header className="public-agent-header">
        <img className="product-logo" src="/ihd-logo.png" alt="IHD" />
        <div>
          <h1>{agent?.name || "智能体"}</h1>
          <p>{agent?.description || "I have a demo"}</p>
        </div>
      </header>
      <section className="public-chat">
        <div className="messages public-messages">
          {messages.length ? messages.map((message, index) => (
            <article key={`${message.createdAt}-${index}`} className={`message ${message.role}`}>
              <div className="avatar">{message.role === "user" ? "你" : "IHD"}</div>
              <div className="bubble">
                {message.role === "assistant" ? <div className="markdown-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown></div> : <pre>{message.content}</pre>}
                {message.imageUrl ? <img className="generated-image" src={message.imageUrl} alt={message.content} /> : null}
              </div>
            </article>
          )) : <div className="empty-state"><Sparkles size={44} /><h2>开始使用这个智能体</h2></div>}
          {loading ? <div className="typing">正在运行智能体</div> : null}
        </div>
        <form className="composer" onSubmit={send}>
          {error ? <div className="error">{error}</div> : null}
          <div className="composer-row">
            <textarea value={content} onChange={(event) => setContent(event.target.value)} rows={2} placeholder="输入消息" />
            <button className="primary send" type="submit" disabled={loading || !agent}><Send size={18} /></button>
          </div>
        </form>
      </section>
    </main>
  );
}

function App() {
  const publicAgentMatch = window.location.pathname.match(/^\/agent\/([^/]+)$/);
  if (publicAgentMatch) return <PublicAgentPage shareId={publicAgentMatch[1]} />;

  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    api<{ user: User }>("/api/me")
      .then((result) => setUser(result.user))
      .catch(() => localStorage.removeItem(tokenKey))
      .finally(() => setBooting(false));
  }, []);

  if (booting) return <div className="boot">加载中...</div>;
  if (!user) return <Login onDone={setUser} />;
  return <ChatApp user={user} onLogout={() => { localStorage.removeItem(tokenKey); setUser(null); }} />;
}

createRoot(document.getElementById("root")!).render(<App />);
