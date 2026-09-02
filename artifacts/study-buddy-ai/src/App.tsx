import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Link, Redirect, Route, Switch, Router as WouterRouter, useLocation, useParams } from 'wouter';
import { ClerkProvider, Show, SignIn, SignUp, useAuth, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import {
  ArrowLeft, ArrowRight, BookOpen, CalendarDays, Check, CheckCircle2, ChevronRight,
  CircleHelp, Clock3, FileText, FolderOpen, GraduationCap, Info, Library, Loader2,
  MessageCircle, MoreHorizontal, Paperclip, Pencil, Plus, Search, Send, Settings2,
  Sparkles, Trash2, Upload, X, Zap,
} from 'lucide-react';
import {
  getGetCourseProgressQueryKey, getGetCourseQueryKey, getGetDashboardSummaryQueryKey,
  getListCoursesQueryKey, getListMaterialsQueryKey, getListStudySessionsQueryKey,
  useAskTutor, useCreateCourse, useCreateMaterial, useCreateStudySession, useDeleteCourse,
  useDeleteMaterial, useDeleteStudySession, useGetCourse, useGetCourseProgress,
  useGetDashboardSummary, useGetNextLearningQuestion, useListCourses, useListMaterials,
  useListStudySessions, useRequestUploadUrl, useSubmitLearningAnswer, useUpdateCourse,
  useUpdateStudySession,
} from '@workspace/api-client-react';
import type { Course, LearningQuestion, Material, StudySession, TutorAnswer } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
if (!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
function stripBase(path: string) {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#176b5c',
    colorForeground: '#183c37',
    colorMutedForeground: '#64736d',
    colorDanger: '#b64b43',
    colorBackground: '#fffdf8',
    colorInput: '#fffdf8',
    colorInputForeground: '#183c37',
    colorNeutral: '#dcd8cf',
    fontFamily: 'DM Sans, sans-serif',
    borderRadius: '1rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#fffdf8] rounded-2xl w-[440px] max-w-full overflow-hidden',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#183c37] font-semibold',
    headerSubtitle: 'text-[#64736d]',
    socialButtonsBlockButtonText: 'text-[#183c37]',
    formFieldLabel: 'text-[#183c37]',
    footerActionLink: 'text-[#176b5c] font-semibold',
    footerActionText: 'text-[#64736d]',
    dividerText: 'text-[#64736d]',
    identityPreviewEditButton: 'text-[#176b5c]',
    formFieldSuccessText: 'text-[#176b5c]',
    alertText: 'text-[#8f3934]',
    logoBox: 'mb-5',
    logoImage: 'max-h-10',
    socialButtonsBlockButton: 'border-[#dcd8cf] bg-[#fffdf8] hover:bg-[#f5f0e7]',
    formButtonPrimary: 'bg-[#176b5c] hover:bg-[#12564a] text-[#fffdf8]',
    formFieldInput: 'border-[#dcd8cf] bg-[#fffdf8] text-[#183c37]',
    footerAction: 'border-t-0',
    dividerLine: 'bg-[#dcd8cf]',
    alert: 'bg-[#fff0ee] border-[#e6b4ae]',
    otpCodeFieldInput: 'border-[#dcd8cf] text-[#183c37]',
    formFieldRow: 'mb-4',
    main: 'bg-transparent',
  },
};

function Brand({ dark = false }: { dark?: boolean }) {
  return (
    <div className="brand" data-testid="brand-study-buddy">
      <span className="brand-mark"><GraduationCap size={19} strokeWidth={2.5} /></span>
      <span>
        <span className="brand-name">Study Buddy</span>
        <span className="brand-kicker">your calm corner to learn</span>
      </span>
    </div>
  );
}

const navItems = [
  { href: '/workspace', label: 'Home', icon: Library },
  { href: '/courses', label: 'Courses', icon: BookOpen },
  { href: '/study', label: 'Study plan', icon: CalendarDays },
];

function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const isTutor = location.startsWith('/tutor/');
  if (isTutor) return <>{children}</>;
  return (
    <div className="app-shell">
      <aside className="side-rail">
        <Brand dark />
        <nav className="nav-stack" aria-label="Main navigation">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className={`nav-link ${location === href ? 'active' : ''}`} data-testid={`link-nav-${label.toLowerCase().replace(' ', '-')}`}>
              <Icon size={18} /><span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="rail-note">
          <strong>Small steps count.</strong>
          Your next focused session is closer than you think.
        </div>
        <AccountControl />
      </aside>
      <div className="content-shell">
        <header className="mobile-header">
          <Link href="/" className="mobile-brand" data-testid="link-mobile-brand">
            <span className="brand-mark"><GraduationCap size={16} /></span><span>Study Buddy</span>
          </Link>
          <span className="tag" data-testid="status-companion">learning companion</span>
        </header>
        {children}
        <nav className="bottom-nav" aria-label="Mobile navigation">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className={`nav-link ${location === href ? 'active' : ''}`} data-testid={`link-mobile-${label.toLowerCase().replace(' ', '-')}`}>
              <Icon /><span>{label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}

function AccountControl() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const displayName = user?.firstName || user?.emailAddresses[0]?.emailAddress || 'Learner';
  return (
    <div className="rail-note" style={{ marginTop: 'auto' }} data-testid="account-control">
      <strong>{displayName}</strong>
      <button className="btn btn-ghost" style={{ marginTop: 8, width: '100%' }} onClick={() => signOut({ redirectUrl: basePath || '/' })} data-testid="button-sign-out">Sign out</button>
    </div>
  );
}

function LoadingState({ label = 'Loading your workspace' }: { label?: string }) {
  return (
    <div className="main-wrap" aria-live="polite" data-testid="state-loading">
      <div className="skeleton" style={{ width: 120, height: 12, marginBottom: 16 }} />
      <div className="skeleton" style={{ width: 'min(80%, 480px)', height: 43, marginBottom: 28 }} />
      <div className="stats-grid">{[1, 2, 3, 4].map((n) => <div className="card skeleton skeleton-card" key={n} />)}</div>
      <p className="small-copy">{label}…</p>
    </div>
  );
}

function ErrorState({ onRetry, message = 'We could not reach your study space.' }: { onRetry?: () => void; message?: string }) {
  return (
    <div className="main-wrap">
      <div className="error-box" role="alert" data-testid="state-error">
        <strong>{message}</strong>
        <div>The connection may have taken a wrong turn. Try again in a moment.</div>
        {onRetry && <button className="btn btn-ghost" onClick={onRetry} data-testid="button-retry"><ArrowRight size={15} /> Try again</button>}
      </div>
    </div>
  );
}

function EmptyState({ icon: Icon = FolderOpen, title, copy, action }: { icon?: typeof FolderOpen; title: string; copy: string; action?: ReactNode }) {
  return (
    <div className="empty-state" data-testid="state-empty">
      <Icon size={29} strokeWidth={1.6} />
      <strong>{title}</strong>
      <span>{copy}</span>
      {action && <div style={{ marginTop: 15 }}>{action}</div>}
    </div>
  );
}

function ProgressBar({ value, testId }: { value: number; testId: string }) {
  const safe = Math.max(0, Math.min(100, value || 0));
  return (
    <div className="progress-line" data-testid={testId} aria-label={`${safe}% complete`}>
      <div className="progress-fill" style={{ width: `${safe}%` }} />
    </div>
  );
}

function CourseDialog({ course, onClose }: { course?: Course | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(course?.name ?? '');
  const [description, setDescription] = useState(course?.description ?? '');
  const create = useCreateCourse();
  const update = useUpdateCourse();
  const editing = Boolean(course);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    if (course) {
      update.mutate({ courseId: course.id, data: { name: name.trim(), description: description.trim() } }, {
        onSuccess: () => { qc.invalidateQueries({ queryKey: getListCoursesQueryKey() }); qc.invalidateQueries({ queryKey: getGetCourseQueryKey(course.id) }); onClose(); },
      });
    } else {
      create.mutate({ data: { name: name.trim(), description: description.trim() } }, {
        onSuccess: () => { qc.invalidateQueries({ queryKey: getListCoursesQueryKey() }); qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }); onClose(); },
      });
    }
  };
  const pending = create.isPending || update.isPending;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.currentTarget === e.target && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="course-dialog-title" data-testid="dialog-course">
        <div className="modal-head">
          <div><h2 id="course-dialog-title">{editing ? 'Tune this course' : 'Start a new course'}</h2><p>Give your materials a home and your brain a little breathing room.</p></div>
          <button className="icon-btn" onClick={onClose} aria-label="Close dialog" data-testid="button-close-course-dialog"><X size={17} /></button>
        </div>
        <form className="form-stack" onSubmit={submit}>
          <div className="field"><label htmlFor="course-name">Course name</label><input id="course-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Cognitive Psychology" autoFocus data-testid="input-course-name" maxLength={120} /></div>
          <div className="field"><label htmlFor="course-description">A short description <span className="small-copy">(optional)</span></label><textarea id="course-description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What are you hoping to understand?" data-testid="input-course-description" maxLength={500} /></div>
          {(create.isError || update.isError) && <div className="error-box" data-testid="error-course-form">We couldn't save that course. Please check the details and try again.</div>}
          <div className="form-actions"><button type="button" className="btn btn-ghost" onClick={onClose} data-testid="button-cancel-course">Not yet</button><button className="btn btn-primary" disabled={pending} data-testid="button-submit-course">{pending && <Loader2 size={15} className="animate-spin" />}{editing ? 'Save changes' : 'Create course'}</button></div>
        </form>
      </div>
    </div>
  );
}

function CourseCard({ course, onEdit, onDelete }: { course: Course; onEdit: () => void; onDelete: () => void }) {
  return (
    <article className="card course-card animate-in" data-testid={`card-course-${course.id}`}>
      <div className="course-card-top">
        <div><Link href={`/courses/${course.id}`} data-testid={`link-course-${course.id}`}><h3>{course.name}</h3></Link><p>{course.description || 'A new space for your questions, notes, and progress.'}</p></div>
        <div className="course-orb"><BookOpen size={17} /></div>
      </div>
      <ProgressBar value={course.progress} testId={`progress-course-${course.id}`} />
      <div className="progress-meta"><span>{course.progress || 0}% understood</span><span>{course.readyMaterialCount}/{course.materialCount} materials ready</span></div>
      <div style={{ display: 'flex', gap: 4, justifyContent: 'end', marginTop: 14 }}>
        <button className="btn btn-ghost" onClick={onEdit} aria-label={`Edit ${course.name}`} data-testid={`button-edit-course-${course.id}`}><Pencil size={14} /></button>
        <button className="btn btn-ghost" onClick={onDelete} aria-label={`Delete ${course.name}`} data-testid={`button-delete-course-${course.id}`}><Trash2 size={14} /></button>
        <Link href={`/courses/${course.id}`} className="btn btn-soft" data-testid={`button-open-course-${course.id}`}>Open <ChevronRight size={14} /></Link>
      </div>
    </article>
  );
}

function SessionRow({ session, onEdit, onDelete, onStart }: { session: StudySession; onEdit?: () => void; onDelete?: () => void; onStart?: () => void }) {
  const date = new Date(session.scheduledStart);
  return (
    <div className="session-row" data-testid={`row-session-${session.id}`}>
      <div className="session-date"><strong>{date.getDate()}</strong><span>{date.toLocaleDateString(undefined, { month: 'short' })}</span></div>
      <div className="session-copy"><strong data-testid={`text-session-title-${session.id}`}>{session.title}</strong><span>{session.courseName} · {date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · {session.durationMinutes} min</span></div>
      {session.status === 'upcoming' && onStart && <button className="btn btn-soft" onClick={onStart} data-testid={`button-start-session-${session.id}`}>Start</button>}
      {onEdit && <button className="icon-btn" onClick={onEdit} aria-label={`Edit ${session.title}`} data-testid={`button-edit-session-${session.id}`}><Pencil size={14} /></button>}
      {onDelete && <button className="icon-btn" onClick={onDelete} aria-label={`Delete ${session.title}`} data-testid={`button-delete-session-${session.id}`}><Trash2 size={14} /></button>}
      {session.status !== 'upcoming' && <span className={`tag ${session.status === 'completed' ? 'ready' : ''}`} data-testid={`status-session-${session.id}`}>{session.status}</span>}
    </div>
  );
}

function Home() {
  const summary = useGetDashboardSummary();
  const courses = useListCourses();
  const qc = useQueryClient();
  const remove = useDeleteCourse();
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Course | null>(null);
  if (summary.isLoading || courses.isLoading) return <LoadingState label="Gathering your progress" />;
  if (summary.isError || courses.isError) return <ErrorState onRetry={() => { summary.refetch(); courses.refetch(); }} />;
  const data = summary.data;
  const courseList = courses.data ?? [];
  return (
    <>
      <main className="main-wrap">
        <div className="page-intro animate-in">
          <div><span className="eyebrow">Your learning desk</span><h1>Good to see you<br /><em style={{ color: 'hsl(var(--primary))', fontStyle: 'normal' }}>back.</em></h1><p>Keep the thread going. A little understanding today makes tomorrow feel lighter.</p></div>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)} data-testid="button-create-course-home"><Plus size={17} /> New course</button>
        </div>
        <div className="stats-grid animate-in delay-1">
          <div className="card stat-card"><span className="stat-label">Courses in orbit</span><strong className="stat-value" data-testid="value-course-count">{data?.courseCount ?? 0}</strong></div>
          <div className="card stat-card"><span className="stat-label">Materials gathered</span><strong className="stat-value" data-testid="value-material-count">{data?.materialCount ?? 0}</strong></div>
          <div className="card stat-card"><span className="stat-label">Ready to explore</span><strong className="stat-value" data-testid="value-ready-count">{data?.readyMaterialCount ?? 0}</strong></div>
          <div className="card stat-card"><span className="stat-label">Overall progress</span><strong className="stat-value" data-testid="value-overall-progress">{data?.overallProgress ?? 0}<small>%</small></strong></div>
        </div>
        <section className="card hero-card animate-in delay-2" data-testid="card-learning-pulse">
          <span className="eyebrow" style={{ color: 'hsl(var(--sidebar-primary))' }}>Learning pulse</span>
          <h2 style={{ marginTop: 9 }}>Your curiosity has a place to land.</h2>
          <p>{data?.recentCourse ? <>Last time, you were with <strong>{data.recentCourse.name}</strong>. Pick up wherever it feels natural.</> : 'Create your first course and turn a pile of materials into a path forward.'}</p>
          <ProgressBar value={data?.overallProgress ?? 0} testId="progress-learning-pulse" />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, opacity: .76 }}><span>{data?.overallProgress ?? 0}% of your current path</span><span data-testid="text-pulse-status">{(data?.overallProgress ?? 0) > 0 ? 'in motion' : 'ready when you are'}</span></div>
          {!data?.recentCourse && <button className="btn" style={{ marginTop: 18 }} onClick={() => setShowCreate(true)} data-testid="button-start-learning"><Sparkles size={15} /> Set up my first course</button>}
        </section>
        <div className="section-head"><h2>Your courses</h2><Link href="/courses" data-testid="link-view-all-courses">See all <ArrowRight size={13} style={{ verticalAlign: 'middle' }} /></Link></div>
        {courseList.length === 0 ? <div className="card"><EmptyState icon={BookOpen} title="Your first course is waiting" copy="Start with one subject. You can always add more as your semester unfolds." action={<button className="btn btn-primary" onClick={() => setShowCreate(true)} data-testid="button-create-course-empty"><Plus size={15} /> Create a course</button>} /></div> : <div className="course-grid">{courseList.slice(0, 4).map((course) => <CourseCard key={course.id} course={course} onEdit={() => { setEditing(course); setShowCreate(true); }} onDelete={() => { if (window.confirm(`Remove ${course.name} and its materials?`)) remove.mutate({ courseId: course.id }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getListCoursesQueryKey() }); qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }); } }); }} />)}</div>}
        <div className="split-grid">
          <section><div className="section-head"><h2>Coming up</h2><Link href="/study" data-testid="link-view-study-plan">Study plan <ArrowRight size={13} style={{ verticalAlign: 'middle' }} /></Link></div><div className="card context-card">{data?.upcomingSessions?.length ? data.upcomingSessions.slice(0, 3).map((s) => <SessionRow key={s.id} session={s} />) : <EmptyState icon={CalendarDays} title="No sessions on the horizon" copy="Give your future self a gentle appointment." action={<Link className="btn btn-soft" href="/study" data-testid="button-plan-study">Plan a session</Link>} />}</div></section>
          <section><div className="section-head"><h2>A note for today</h2></div><div className="card context-card" style={{ background: 'hsl(var(--accent) / .18)', borderColor: 'hsl(var(--accent) / .3)' }}><Zap size={19} color="hsl(var(--primary))" /><h3 style={{ marginTop: 14 }}>Progress is not a mood.</h3><p className="small-copy" style={{ marginTop: 7 }}>It is the quiet accumulation of showing up, even when the chapter feels stubborn.</p></div></section>
        </div>
      </main>
      {showCreate && <CourseDialog course={editing} onClose={() => { setShowCreate(false); setEditing(null); }} />}
    </>
  );
}

function Courses() {
  const courses = useListCourses();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Course | null>(null);
  const remove = useDeleteCourse();
  if (courses.isLoading) return <LoadingState label="Finding your courses" />;
  if (courses.isError) return <ErrorState onRetry={() => courses.refetch()} />;
  const list = courses.data ?? [];
  const deleteCourse = (course: Course) => { if (window.confirm(`Remove ${course.name} and its materials?`)) remove.mutate({ courseId: course.id }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getListCoursesQueryKey() }); qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }); } }); };
  return (
    <>
      <main className="main-wrap">
        <div className="page-intro animate-in"><div><span className="eyebrow">Your library</span><h1>Courses that<br /><em style={{ color: 'hsl(var(--primary))', fontStyle: 'normal' }}>feel like yours.</em></h1><p>Separate the noise by subject. Each course keeps its own materials, progress, and questions close at hand.</p></div><button className="btn btn-primary" onClick={() => setShowCreate(true)} data-testid="button-create-course"><Plus size={17} /> Add course</button></div>
        {list.length === 0 ? <div className="card"><EmptyState icon={BookOpen} title="Nothing here yet" copy="Build a course around the subject you want to understand next." action={<button className="btn btn-primary" onClick={() => setShowCreate(true)} data-testid="button-create-course-first"><Plus size={15} /> Create your first course</button>} /></div> : <div className="course-grid">{list.map((course) => <CourseCard key={course.id} course={course} onEdit={() => setEditing(course)} onDelete={() => deleteCourse(course)} />)}</div>}
      </main>
      {(showCreate || editing) && <CourseDialog course={editing} onClose={() => { setShowCreate(false); setEditing(null); }} />}
    </>
  );
}

function MaterialRow({ material, onDelete }: { material: Material; onDelete: () => void }) {
  const statusLabel = material.status === 'processing' ? 'processing' : material.status;
  return <div className="material-row" data-testid={`row-material-${material.id}`}><div className="file-icon"><FileText size={17} /></div><div className="material-copy"><strong data-testid={`text-material-name-${material.id}`}>{material.name}</strong><span>{material.pageCount ? `${material.pageCount} pages · ` : ''}{Math.max(1, Math.round(material.sizeBytes / 1024))} KB</span></div><span className={`tag ${material.status === 'ready' ? 'ready' : material.status === 'failed' ? 'failed' : ''}`} data-testid={`status-material-${material.id}`}>{statusLabel}</span><button className="icon-btn" onClick={onDelete} aria-label={`Delete ${material.name}`} data-testid={`button-delete-material-${material.id}`}><Trash2 size={14} /></button></div>;
}

function SettingsPanel({ course }: { course: Course }) {
  const qc = useQueryClient();
  const update = useUpdateCourse();
  const settings = course.activeLearning;
  const [local, setLocal] = useState(settings);
  useEffect(() => setLocal(settings), [settings]);
  const save = (next: typeof local) => { setLocal(next); update.mutate({ courseId: course.id, data: { activeLearning: next } }, { onSuccess: (updated) => { qc.setQueryData(getGetCourseQueryKey(course.id), updated); qc.invalidateQueries({ queryKey: getListCoursesQueryKey() }); } }); };
  return <section className="card panel" data-testid="panel-active-learning"><div className="panel-title"><div><span className="eyebrow">AI engine</span><h2>Active learning</h2></div><button className={`switch ${local.enabled ? 'on' : ''}`} onClick={() => save({ ...local, enabled: !local.enabled })} aria-label="Toggle active learning" aria-pressed={local.enabled} data-testid="switch-active-learning" /></div><p className="small-copy">When enabled, Study Buddy can bring one thoughtful question into a scheduled session. Nothing interrupts until you start it.</p><div className="switch-row"><span className="small-copy">Questions are on</span><strong style={{ color: 'hsl(var(--primary))' }} data-testid="text-active-learning-status">{local.enabled ? 'Enabled' : 'Paused'}</strong></div>{local.enabled && <div className="settings-grid"><div className="field"><label htmlFor="active-start">Window starts</label><input id="active-start" type="time" value={local.startTime} onChange={(e) => save({ ...local, startTime: e.target.value })} data-testid="input-active-start" /></div><div className="field"><label htmlFor="active-end">Window ends</label><input id="active-end" type="time" value={local.endTime} onChange={(e) => save({ ...local, endTime: e.target.value })} data-testid="input-active-end" /></div><div className="field"><label htmlFor="active-frequency">Ask every (minutes)</label><input id="active-frequency" type="number" min={5} max={180} value={local.frequencyMinutes} onChange={(e) => save({ ...local, frequencyMinutes: Number(e.target.value) })} data-testid="input-active-frequency" /></div><div className="field"><label htmlFor="active-count">Questions per session</label><input id="active-count" type="number" min={1} max={30} value={local.questionCount} onChange={(e) => save({ ...local, questionCount: Number(e.target.value) })} data-testid="input-active-count" /></div><div className="field"><label htmlFor="active-type">Question style</label><select id="active-type" value={local.questionType} onChange={(e) => save({ ...local, questionType: e.target.value as typeof local.questionType })} data-testid="select-active-type"><option value="multiple_choice">Multiple choice</option><option value="true_false">True or false</option><option value="short_answer">Short answer</option></select></div></div>}</section>;
}

function QuestionCard({ courseId, sessionId, question, onDone }: { courseId: number; sessionId: number; question: LearningQuestion; onDone: () => void }) {
  const [answer, setAnswer] = useState('');
  const submit = useSubmitLearningAnswer();
  const [feedback, setFeedback] = useState<{ feedback: string; explanation: string; result: string } | null>(null);
  const send = (action: 'answered' | 'skipped') => submit.mutate({ courseId, data: { questionId: question.id, answer, action } }, { onSuccess: (result) => setFeedback(result) });
  return <section className="card panel" data-testid="card-learning-question"><div className="panel-title"><div><span className="eyebrow">Session question</span><h2>Take a second look</h2></div><span className="tag">{question.difficulty}</span></div><p style={{ fontSize: 16, lineHeight: 1.5 }} data-testid="text-learning-question">{question.prompt}</p>{question.type === 'short_answer' ? <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Write what you think…" data-testid="input-learning-answer" /> : <div className="form-stack" style={{ marginTop: 13 }}>{question.options.map((option, index) => <button key={option} className={`btn ${answer === option ? 'btn-primary' : 'btn-soft'}`} onClick={() => setAnswer(option)} data-testid={`button-learning-option-${index}`}>{option}</button>)}</div>}{feedback ? <div className="notice" style={{ marginTop: 15 }} data-testid="feedback-learning-answer"><strong>{feedback.result === 'correct' ? 'That landed.' : 'Good stretch.'}</strong><div>{feedback.feedback}</div><div style={{ marginTop: 5 }}>{feedback.explanation}</div><button className="btn btn-ghost" onClick={onDone} data-testid="button-dismiss-feedback">Continue</button></div> : <div className="form-actions" style={{ marginTop: 18 }}><button className="btn btn-ghost" onClick={() => send('skipped')} data-testid="button-skip-question">Skip for now</button><button className="btn btn-primary" onClick={() => send('answered')} disabled={!answer || submit.isPending} data-testid="button-submit-learning-answer">{submit.isPending ? <Loader2 size={15} /> : <Check size={15} />} Check answer</button></div>}{submit.isError && <div className="error-box" style={{ marginTop: 12 }} data-testid="error-learning-answer">That answer could not be checked. Try once more.</div>}</section>;
}

function CoursePage() {
  const params = useParams<{ courseId?: string }>();
  const courseId = Number(params.courseId);
  const qc = useQueryClient();
  const course = useGetCourse(courseId, { query: { enabled: Boolean(courseId), queryKey: getGetCourseQueryKey(courseId) } });
  const materials = useListMaterials(courseId, { query: { enabled: Boolean(courseId), queryKey: getListMaterialsQueryKey(courseId) } });
  const progress = useGetCourseProgress(courseId, { query: { enabled: Boolean(courseId), queryKey: getGetCourseProgressQueryKey(courseId) } });
  const sessions = useListStudySessions(courseId, { query: { enabled: Boolean(courseId), queryKey: getListStudySessionsQueryKey(courseId) } });
  const requestUpload = useRequestUploadUrl();
  const createMaterial = useCreateMaterial();
  const deleteMaterial = useDeleteMaterial();
  const nextQuestion = useGetNextLearningQuestion();
  const [uploadError, setUploadError] = useState('');
  const [startedSession, setStartedSession] = useState<number | null>(null);
  const [question, setQuestion] = useState<LearningQuestion | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  if (course.isLoading) return <LoadingState label="Opening your course" />;
  if (course.isError || !course.data) return <ErrorState message="That course could not be opened." />;
  const current = course.data;
  const upload = (file?: File) => {
    if (!file) return;
    setUploadError('');
    requestUpload.mutate({ data: { name: file.name, size: file.size, contentType: file.type || 'application/octet-stream' } }, {
      onSuccess: async (uploadData) => {
        try {
          const response = await fetch(uploadData.uploadURL, { method: 'PUT', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file });
          if (!response.ok) throw new Error('Upload did not complete');
          createMaterial.mutate({ courseId, data: { name: file.name, contentType: file.type || 'application/octet-stream', sizeBytes: file.size, objectPath: uploadData.objectPath } }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getListMaterialsQueryKey(courseId) }); qc.invalidateQueries({ queryKey: getGetCourseQueryKey(courseId) }); } });
        } catch { setUploadError('The file could not be uploaded. Please try again.'); }
      },
      onError: () => setUploadError('We could not prepare that file for upload. Please try again.'),
    });
  };
  const startSession = (session: StudySession) => { setStartedSession(session.id); nextQuestion.mutate({ courseId, data: { scheduledSessionId: session.id } }, { onSuccess: (q) => setQuestion(q) }); };
  const materialsList = materials.data ?? [];
  const upcoming = (sessions.data ?? []).filter((s) => s.status === 'upcoming');
  return (
    <main className="main-wrap">
      <section className="detail-hero animate-in">
        <Link href="/courses" className="back-link" data-testid="link-back-courses"><ArrowLeft size={14} /> All courses</Link>
        <span className="eyebrow">Course workspace</span><h1 data-testid="text-course-name">{current.name}</h1><p>{current.description || 'A private space to gather materials, ask better questions, and notice your progress.'}</p>
        <div className="detail-actions"><Link href={`/tutor/${courseId}`} className="btn btn-primary" data-testid="button-ask-ai"><MessageCircle size={16} /> Ask AI</Link>{upcoming[0] && <button className="btn btn-soft" onClick={() => startSession(upcoming[0])} data-testid="button-start-course-session"><Zap size={16} /> Start study</button>}</div>
      </section>
      <div className="workspace-grid">
        <div>
          <section className="card panel" data-testid="panel-materials"><div className="panel-title"><div><span className="eyebrow">Your source shelf</span><h2>Materials</h2></div><><input ref={inputRef} type="file" hidden accept=".pdf,.ppt,.pptx,.doc,.docx,.txt" onChange={(e) => upload(e.target.files?.[0])} data-testid="input-material-file" /><button className="btn btn-primary" onClick={() => inputRef.current?.click()} disabled={requestUpload.isPending || createMaterial.isPending} data-testid="button-upload-material"><Upload size={15} /> {requestUpload.isPending || createMaterial.isPending ? 'Uploading…' : 'Add material'}</button></></div>{uploadError && <div className="error-box" style={{ marginBottom: 12 }} data-testid="error-material-upload">{uploadError}</div>}{materials.isLoading ? <div className="skeleton skeleton-card" /> : materials.isError ? <div className="error-box" data-testid="error-materials">Materials did not load. <button className="btn btn-ghost" onClick={() => materials.refetch()} data-testid="button-retry-materials">Retry</button></div> : materialsList.length === 0 ? <EmptyState icon={Paperclip} title="Your shelf is empty" copy="Add a lecture deck, reading, or set of notes. Study Buddy will keep the source close." /> : materialsList.map((material) => <MaterialRow key={material.id} material={material} onDelete={() => { if (window.confirm(`Delete ${material.name}?`)) deleteMaterial.mutate({ courseId, materialId: material.id }, { onSuccess: () => qc.invalidateQueries({ queryKey: getListMaterialsQueryKey(courseId) }) }); }} />)}</section>
          <section className="card panel" style={{ marginTop: 14 }} data-testid="panel-course-progress"><div className="panel-title"><div><span className="eyebrow">A useful read</span><h2>Progress, not pressure</h2></div><span className="tag ready">{progress.data?.currentDifficulty ?? 'beginner'}</span></div><ProgressBar value={progress.data?.progress ?? current.progress} testId="progress-course-detail" /><div className="progress-meta"><span data-testid="text-course-progress">{progress.data?.progress ?? current.progress}% understood</span><span>{progress.data?.totalAnswered ?? 0} questions answered</span></div><div style={{ display: 'flex', gap: 18, marginTop: 19 }}><div><strong style={{ font: '700 22px var(--app-font-mono)', color: 'hsl(var(--primary))' }} data-testid="value-correct-count">{progress.data?.correctCount ?? 0}</strong><div className="small-copy">correct</div></div><div><strong style={{ font: '700 22px var(--app-font-mono)', color: 'hsl(var(--accent-foreground))' }} data-testid="value-incorrect-count">{progress.data?.incorrectCount ?? 0}</strong><div className="small-copy">still growing</div></div><div style={{ flex: 1 }}><div className="small-copy">Topics to revisit</div><div style={{ marginTop: 5, display: 'flex', gap: 5, flexWrap: 'wrap' }}>{(progress.data?.weakTopics ?? []).slice(0, 3).map((topic) => <span className="tag" key={topic} data-testid={`tag-weak-topic-${topic}`}>{topic}</span>)}</div></div></div></section>
          {startedSession && nextQuestion.isPending && <section className="card panel" style={{ marginTop: 14 }} data-testid="state-question-loading"><div className="skeleton" style={{ width: '70%', height: 17 }} /><div className="skeleton" style={{ width: '95%', height: 65, marginTop: 14 }} /></section>}
          {startedSession && nextQuestion.isError && <div className="error-box" style={{ marginTop: 14 }} data-testid="error-question">The next question is not ready yet. Your session can continue without it.</div>}
          {question && startedSession && <div style={{ marginTop: 14 }}><QuestionCard courseId={courseId} sessionId={startedSession} question={question} onDone={() => { setQuestion(null); setStartedSession(null); }} /></div>}
        </div>
        <div><SettingsPanel course={current} /><section className="card panel" style={{ marginTop: 14 }} data-testid="panel-next-session"><div className="panel-title"><div><span className="eyebrow">On your calendar</span><h2>Next session</h2></div><Clock3 size={18} color="hsl(var(--primary))" /></div>{upcoming[0] ? <SessionRow session={upcoming[0]} onStart={() => startSession(upcoming[0])} /> : <EmptyState icon={CalendarDays} title="Nothing scheduled" copy="Give this course a little time on the calendar." action={<Link href="/study" className="btn btn-soft" data-testid="button-schedule-from-course">Schedule study</Link>} />}</section></div>
      </div>
    </main>
  );
}

function SessionDialog({ courseId, courseName, session, onClose }: { courseId: number; courseName: string; session?: StudySession | null; onClose: () => void }) {
  const qc = useQueryClient();
  const create = useCreateStudySession();
  const update = useUpdateStudySession();
  const [title, setTitle] = useState(session?.title ?? '');
  const [date, setDate] = useState(session ? new Date(session.scheduledStart).toISOString().slice(0, 16) : '');
  const [duration, setDuration] = useState(String(session?.durationMinutes ?? 45));
  const submit = (e: FormEvent) => { e.preventDefault(); const data = { title: title.trim(), scheduledStart: new Date(date).toISOString(), durationMinutes: Number(duration) }; if (session) update.mutate({ sessionId: session.id, data }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getListStudySessionsQueryKey(courseId) }); qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }); onClose(); } }); else create.mutate({ courseId, data }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getListStudySessionsQueryKey(courseId) }); qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }); onClose(); } }); };
  const pending = create.isPending || update.isPending;
  return <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.currentTarget === e.target && onClose()}><div className="modal" role="dialog" aria-modal="true" data-testid="dialog-study-session"><div className="modal-head"><div><h2>{session ? 'Adjust your session' : 'Plan a study session'}</h2><p>{courseName} · A clear, small appointment with yourself.</p></div><button className="icon-btn" onClick={onClose} data-testid="button-close-session-dialog"><X size={17} /></button></div><form className="form-stack" onSubmit={submit}><div className="field"><label htmlFor="session-title">What are you working on?</label><input id="session-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Review memory systems" data-testid="input-session-title" required /></div><div className="field"><label htmlFor="session-date">When?</label><input id="session-date" type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} data-testid="input-session-date" required /></div><div className="field"><label htmlFor="session-duration">Minutes</label><input id="session-duration" type="number" min={5} max={480} value={duration} onChange={(e) => setDuration(e.target.value)} data-testid="input-session-duration" required /></div><div className="form-actions"><button type="button" className="btn btn-ghost" onClick={onClose} data-testid="button-cancel-session">Cancel</button><button className="btn btn-primary" disabled={pending} data-testid="button-submit-session">{pending && <Loader2 size={15} />}{session ? 'Save session' : 'Add to plan'}</button></div></form></div></div>;
}

function Study() {
  const courses = useListCourses();
  const [selectedId, setSelectedId] = useState(0);
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<StudySession | null>(null);
  const qc = useQueryClient();
  const deleteSession = useDeleteStudySession();
  useEffect(() => { if (!selectedId && courses.data?.[0]) setSelectedId(courses.data[0].id); }, [courses.data, selectedId]);
  const sessions = useListStudySessions(selectedId, { query: { enabled: Boolean(selectedId), queryKey: getListStudySessionsQueryKey(selectedId) } });
  if (courses.isLoading) return <LoadingState label="Preparing your study plan" />;
  if (courses.isError) return <ErrorState onRetry={() => courses.refetch()} />;
  const selected = (courses.data ?? []).find((c) => c.id === selectedId);
  const list = sessions.data ?? [];
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  const first = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const sessionDays = new Map(list.map((s) => [new Date(s.scheduledStart).getDate(), s]));
  return <main className="main-wrap"><div className="page-intro animate-in"><div><span className="eyebrow">Make room for it</span><h1>Your study<br /><em style={{ color: 'hsl(var(--primary))', fontStyle: 'normal' }}>plan.</em></h1><p>A plan is not a promise to be perfect. It is a kind nudge toward what matters.</p></div><button className="btn btn-primary" onClick={() => { setEditing(null); setShowDialog(true); }} disabled={!selected} data-testid="button-add-study-session"><Plus size={17} /> Add session</button></div>{courses.data?.length ? <div className="card panel" style={{ marginBottom: 14 }}><div className="field"><label htmlFor="study-course">Course focus</label><select id="study-course" value={selectedId} onChange={(e) => setSelectedId(Number(e.target.value))} data-testid="select-study-course">{courses.data.map((course) => <option value={course.id} key={course.id}>{course.name}</option>)}</select></div></div> : <div className="card"><EmptyState icon={BookOpen} title="Choose a course first" copy="Your study plan will appear once you have somewhere to put it." action={<Link href="/courses" className="btn btn-primary" data-testid="button-go-to-courses">Browse courses</Link>} /></div>}{selected && <><div className="card panel animate-in delay-1"><div className="panel-title"><h2>{now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2><span className="tag ready">{list.filter((s) => s.status === 'upcoming').length} upcoming</span></div><div className="calendar-grid">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <div className="calendar-day-name" key={day}>{day}</div>)}{Array.from({ length: first }).map((_, i) => <div key={`blank-${i}`} />)}{Array.from({ length: days }, (_, i) => i + 1).map((day) => <div className={`calendar-day ${day === now.getDate() ? 'today' : ''} ${sessionDays.has(day) ? 'has-session' : ''}`} key={day} data-testid={`calendar-day-${day}`}>{day}{sessionDays.get(day) && <small>{sessionDays.get(day)?.title}</small>}</div>)}</div></div><div className="section-head"><h2>Sessions</h2><span className="small-copy">{selected.name}</span></div><div className="card context-card">{sessions.isLoading ? <div className="skeleton skeleton-card" /> : sessions.isError ? <div className="error-box">Sessions did not load. <button className="btn btn-ghost" onClick={() => sessions.refetch()} data-testid="button-retry-sessions">Retry</button></div> : list.length ? list.slice().sort((a, b) => +new Date(a.scheduledStart) - +new Date(b.scheduledStart)).map((session) => <SessionRow key={session.id} session={session} onEdit={() => { setEditing(session); setShowDialog(true); }} onDelete={() => { if (window.confirm(`Delete ${session.title}?`)) deleteSession.mutate({ sessionId: session.id }, { onSuccess: () => qc.invalidateQueries({ queryKey: getListStudySessionsQueryKey(selectedId) }) }); }} />) : <EmptyState icon={CalendarDays} title="No sessions yet" copy="Pick a day, choose a focus, and make it real." action={<button className="btn btn-soft" onClick={() => setShowDialog(true)} data-testid="button-add-first-session"><Plus size={15} /> Add a session</button>} />}</div></>}{showDialog && selected && <SessionDialog courseId={selected.id} courseName={selected.name} session={editing} onClose={() => { setShowDialog(false); setEditing(null); }} />}</main>;
}

type ChatMessage = { role: 'user' | 'ai'; text: string; answer?: TutorAnswer };
const modes = [{ id: 'explain', label: 'Explain it' }, { id: 'summarize', label: 'Summarize' }, { id: 'beginner', label: 'Start simpler' }, { id: 'examples', label: 'Give examples' }, { id: 'practice', label: 'Help me practice' }];

function Tutor() {
  const params = useParams<{ courseId?: string }>();
  const courseId = Number(params.courseId);
  const course = useGetCourse(courseId, { query: { enabled: Boolean(courseId), queryKey: getGetCourseQueryKey(courseId) } });
  const ask = useAskTutor();
  const [mode, setMode] = useState('explain');
  const [prompt, setPrompt] = useState('');
  const [web, setWeb] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const send = (e?: FormEvent) => { e?.preventDefault(); if (!prompt.trim() || ask.isPending) return; const text = prompt.trim(); setPrompt(''); setMessages((items) => [...items, { role: 'user', text }]); ask.mutate({ courseId, data: { prompt: text, mode: mode as 'explain', useWeb: web } }, { onSuccess: (answer) => setMessages((items) => [...items, { role: 'ai', text: answer.answer, answer }]) }); };
  if (course.isLoading) return <LoadingState label="Warming up your tutor" />;
  if (course.isError || !course.data) return <ErrorState message="This tutor could not find that course." />;
  return <div className="tutor-shell"><header className="tutor-head"><Link href={`/courses/${courseId}`} className="back-link" data-testid="link-back-tutor-course"><ArrowLeft size={14} /> {course.data.name}</Link><span className="eyebrow">Course-aware tutor</span><h1>Ask without<br /><em style={{ color: 'hsl(var(--primary))', fontStyle: 'normal' }}>holding back.</em></h1></header><div className="mode-strip" aria-label="Tutor prompt modes">{modes.map((item) => <button className={`mode-chip ${mode === item.id ? 'selected' : ''}`} key={item.id} onClick={() => setMode(item.id)} data-testid={`button-tutor-mode-${item.id}`}>{item.label}</button>)}</div><div className="chat-feed" data-testid="chat-feed">{messages.length === 0 && <div className="chat-bubble ai animate-in"><strong>I'm here with your {course.data.name} materials.</strong><br />Ask me to explain a tricky idea, connect two concepts, or help you make a practice plan. I'll keep the answer grounded in what you've brought here.</div>}{messages.map((message, index) => <div className={`chat-bubble ${message.role} animate-in`} key={`${message.role}-${index}`} data-testid={`chat-message-${index}`}>{message.text}{message.answer?.sources?.length ? <div className="source-list">{message.answer.sources.map((source, sourceIndex) => <span className="source-label" key={`${source.label}-${sourceIndex}`} data-testid={`source-label-${index}-${sourceIndex}`}>{source.kind === 'web' ? <Search size={11} /> : <FileText size={11} />}{source.label}{source.page ? ` · p. ${source.page}` : ''}{source.slide ? ` · slide ${source.slide}` : ''}</span>)}</div> : null}</div>)}{ask.isPending && <div className="chat-bubble ai" aria-live="polite" data-testid="state-tutor-loading"><Loader2 size={15} style={{ verticalAlign: 'middle', marginRight: 7 }} />Thinking through your materials…</div>}{ask.isError && <div className="error-box" data-testid="error-tutor">The tutor could not answer this one. No answer was invented; try again or switch on web search for broader context.</div>}</div><div className="chat-composer"><form className="composer-row" onSubmit={send}><textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={`Ask your tutor to ${modes.find((m) => m.id === mode)?.label.toLowerCase() ?? 'explain it'}…`} aria-label="Ask your tutor" data-testid="input-tutor-prompt" /><button className="btn btn-primary" type="submit" disabled={!prompt.trim() || ask.isPending} data-testid="button-send-tutor"><Send size={16} /> Send</button></form><label className="toggle-label"><input type="checkbox" checked={web} onChange={(e) => setWeb(e.target.checked)} data-testid="input-tutor-web-search" /> Search the web when your materials need a wider lens</label></div></div>;
}

function Landing() {
  return (
    <div className="auth-page">
      <div className="auth-art">
        <Brand dark />
        <span className="eyebrow" style={{ color: 'hsl(var(--sidebar-primary))' }}>A calmer way to study</span>
        <h1>Understand more.<br />Carry less.</h1>
        <p>Study Buddy turns the materials you already own into a warm, focused place to ask, practice, and grow.</p>
        <div className="form-actions">
          <Link className="btn btn-primary" href="/sign-up" data-testid="button-landing-sign-up">Create your space <ArrowRight size={15} /></Link>
          <Link className="btn btn-ghost" href="/sign-in" data-testid="button-landing-sign-in">Sign in</Link>
        </div>
      </div>
      <main className="auth-main">
        <div className="auth-box">
          <Brand />
          <span className="eyebrow">The study companion</span>
          <h1>Everything you need to keep learning.</h1>
          <p>Bring your courses, materials, calendar, and questions into one private workspace.</p>
          <div className="notice" style={{ marginTop: 24 }}>
            <strong>One subject at a time.</strong>
            <div>Course-specific materials stay separated, so your tutor can keep the right context close.</div>
          </div>
          <div className="form-actions landing-mobile-actions">
            <Link className="btn btn-primary" href="/sign-up" data-testid="button-landing-mobile-sign-up">Create your space <ArrowRight size={15} /></Link>
            <Link className="btn btn-ghost" href="/sign-in" data-testid="button-landing-mobile-sign-in">Sign in</Link>
          </div>
        </div>
      </main>
    </div>
  );
}

function HomeRedirect() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <LoadingState label="Opening your study space" />;
  if (isSignedIn) return <Redirect to="/workspace" />;
  return <Landing />;
}

function ProtectedPage({ children, shell = true }: { children: ReactNode; shell?: boolean }) {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <LoadingState label="Checking your study space" />;
  if (!isSignedIn) return <Redirect to="/" />;
  return shell ? <AppShell>{children}</AppShell> : <>{children}</>;
}

function SignInPage() {
  return <div className="auth-page clerk-auth-page"><div className="auth-art"><Brand dark /><span className="eyebrow" style={{ color: 'hsl(var(--sidebar-primary))' }}>A calmer way to study</span><h1>Pick up your thread.</h1><p>Your courses and progress will be right where you left them.</p></div><main className="auth-main"><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /></main></div>;
}

function SignUpPage() {
  return <div className="auth-page clerk-auth-page"><div className="auth-art"><Brand dark /><span className="eyebrow" style={{ color: 'hsl(var(--sidebar-primary))' }}>Begin gently</span><h1>Make room to learn.</h1><p>Bring your subjects together. Your first course can be small.</p></div><main className="auth-main"><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /></main></div>;
}

function Router() {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}><Switch>
    <Route path="/" component={HomeRedirect} />
    <Route path="/sign-in/*?" component={SignInPage} />
    <Route path="/sign-up/*?" component={SignUpPage} />
    <Route path="/workspace" component={() => <ProtectedPage><Home /></ProtectedPage>} />
    <Route path="/courses" component={() => <ProtectedPage><Courses /></ProtectedPage>} />
    <Route path="/courses/:courseId" component={() => <ProtectedPage><CoursePage /></ProtectedPage>} />
    <Route path="/study" component={() => <ProtectedPage><Study /></ProtectedPage>} />
    <Route path="/tutor/:courseId" component={() => <ProtectedPage shell={false}><Tutor /></ProtectedPage>} />
    <Route component={NotFound} />
  </Switch></ErrorBoundary>;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClient = useQueryClient();
  const previousUser = useRef<string | null | undefined>(undefined);
  useEffect(() => addListener(({ user }) => {
    const userId = user?.id ?? null;
    if (previousUser.current !== undefined && previousUser.current !== userId) queryClient.clear();
    previousUser.current = userId;
  }), [addListener, queryClient]);
  return null;
}

function App() {
  return <WouterRouter base={basePath}><ClerkProviderWithRoutes /></WouterRouter>;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  return <ClerkProvider
    publishableKey={clerkPubKey}
    proxyUrl={clerkProxyUrl}
    appearance={clerkAppearance}
    signInUrl={`${basePath}/sign-in`}
    signUpUrl={`${basePath}/sign-up`}
    routerPush={(to) => setLocation(stripBase(to))}
    routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    localization={{ signIn: { start: { title: 'Welcome back', subtitle: 'Sign in to access your study space' } }, signUp: { start: { title: 'Create your study space', subtitle: 'Bring your learning together' } } }}
  >
    <QueryClientProvider client={queryClient}>
      <TooltipProvider><ClerkQueryClientCacheInvalidator /><Router /><Toaster /></TooltipProvider>
    </QueryClientProvider>
  </ClerkProvider>;
}

export default App;