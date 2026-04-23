'use client';

import { useState, useEffect, useRef } from 'react';
import { useSession, signOut } from 'next-auth/react';
import useSWR from 'swr';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/stores/toastStore';
import { preHashPassword } from '@/lib/client-password';

// ── 常量 ──

const BUSINESS_TYPES = [
  { value: 'design', label: '设计' },
  { value: 'development', label: '开发' },
  { value: 'consulting', label: '咨询' },
  { value: 'content', label: '内容创作' },
  { value: 'operations', label: '运营' },
  { value: 'other', label: '其他' },
];

const CURRENCIES = [
  { value: 'CNY', label: '人民币 (CNY)' },
  { value: 'USD', label: '美元 (USD)' },
  { value: 'EUR', label: '欧元 (EUR)' },
  { value: 'GBP', label: '英镑 (GBP)' },
  { value: 'JPY', label: '日元 (JPY)' },
];

const TABS = [
  { id: 'profile', label: '个人资料', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
  { id: 'business', label: '经营设置', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' },
  { id: 'feedback', label: '意见反馈', icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z' },
  { id: 'privacy', label: '数据与隐私', icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z' },
  { id: 'account', label: '账号安全', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
] as const;

const FEEDBACK_TYPES = [
  { value: 'experience', label: '体验反馈' },
  { value: 'feature', label: '功能建议' },
  { value: 'bug', label: '问题报告' },
  { value: 'other', label: '其他' },
];

type TabId = typeof TABS[number]['id'];

const TASK_LABELS: Record<string, string> = {
  reminder: '催款文案',
  quote: '小木报价',
  insight: '经营洞察',
  'transaction.classify': '记账分类',
  'reminder.generate': '催款文案',
  'quote.generate': '小木报价',
  'insight.generate': '经营洞察',
};

// ── 类型 ──

interface UserProfile {
  id: string;
  phone: string;
  name: string;
  companyName: string;
  avatarUrl: string;
  businessType: string;
  entityType: string;
  plan: string;
  privacyMode: string;
  hasPassword: boolean;
  settings: {
    currency: string;
    taxRate: number;
    paymentReminderDays: number[];
    defaultPaymentTerms: string;
  } | null;
}

interface AILogEntry {
  createdAt: string;
  task: string;
  intentParams: Record<string, unknown>;
  dataSent: string;
  cacheHit: boolean;
}

interface AILogStats {
  total: number;
  cacheHitCount: number;
  intentOnlyCount: number;
  noneCount: number;
  days: number;
}

// ── 主组件 ──

export default function SettingsPage() {
  const { data: session, update } = useSession();
  const { data: profileData, mutate } = useSWR('/api/users/profile');
  const profile: UserProfile | null = profileData?.data || null;

  const [activeTab, setActiveTab] = useState<TabId>('profile');

  // 头像
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  // 个人信息表单
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [businessType, setBusinessType] = useState('other');
  const [profileLoading, setProfileLoading] = useState(false);

  // 绑定手机号
  const [showBindPhone, setShowBindPhone] = useState(false);
  const [bindPhone, setBindPhone] = useState('');
  const [bindCode, setBindCode] = useState('');
  const [bindPhoneLoading, setBindPhoneLoading] = useState(false);
  const [bindCountdown, setBindCountdown] = useState(0);

  // 隐私模式 & AI日志
  const [privacyMode, setPrivacyMode] = useState('standard');
  const [privacyLoading, setPrivacyLoading] = useState(false);
  const { data: aiLogsData, mutate: mutateAiLogs } = useSWR('/api/users/ai-logs?days=7');
  const aiLogs: AILogEntry[] = aiLogsData?.data?.logs || [];
  const aiStats: AILogStats | null = aiLogsData?.data?.stats || null;
  const [expandedLogIndex, setExpandedLogIndex] = useState<number | null>(null);

  // 账号删除
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);

  // 退出登录确认
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [signOutLoading, setSignOutLoading] = useState(false);
  const confirmSignOut = async () => {
    setSignOutLoading(true);
    await signOut({ callbackUrl: '/login' });
  };

  // 密码设置
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);

  // 反馈
  const [feedbackType, setFeedbackType] = useState('experience');
  const [feedbackContent, setFeedbackContent] = useState('');
  const [feedbackContact, setFeedbackContact] = useState('');
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);

  // 经营设置表单
  const [currency, setCurrency] = useState('CNY');
  const [taxRate, setTaxRate] = useState('');
  const [reminderDays, setReminderDays] = useState('3, 1, 0');
  const [defaultTerms, setDefaultTerms] = useState('');
  const [settingsLoading, setSettingsLoading] = useState(false);

  // 回填
  useEffect(() => {
    if (profile) {
      setName(profile.name || '');
      setCompanyName(profile.companyName || '');
      setBusinessType(profile.businessType || 'other');
      setPrivacyMode(profile.privacyMode || 'standard');
      if (profile.settings) {
        setCurrency(profile.settings.currency || 'CNY');
        setTaxRate(String(profile.settings.taxRate || ''));
        setReminderDays(profile.settings.paymentReminderDays?.join(', ') || '3, 1, 0');
        setDefaultTerms(profile.settings.defaultPaymentTerms || '');
      }
    }
  }, [profile]);

  // ── handlers ──

  const handleProfileSave = async () => {
    setProfileLoading(true);
    try {
      const res = await fetch('/api/users/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, companyName, businessType }),
      });
      const result = await res.json();
      if (result.success) { toast.success('已保存'); mutate(); await update(); }
      else toast.error(result.error || '更新失败');
    } catch { toast.error('网络错误'); }
    finally { setProfileLoading(false); }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error('图片不能超过 2MB'); return; }
    setAvatarUploading(true);
    try {
      const formData = new FormData();
      formData.append('avatar', file);
      const res = await fetch('/api/users/avatar', { method: 'POST', body: formData });
      const result = await res.json();
      if (result.success) { toast.success('头像已更新'); mutate(); await update(); }
      else toast.error(result.error || '上传失败');
    } catch { toast.error('网络错误'); }
    finally { setAvatarUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  const handleAvatarRemove = async () => {
    try {
      const res = await fetch('/api/users/avatar', { method: 'DELETE' });
      const r = await res.json();
      if (r.success) { toast.success('头像已移除'); mutate(); } else toast.error(r.error || '失败');
    } catch { toast.error('网络错误'); }
  };

  const handleSettingsSave = async () => {
    setSettingsLoading(true);
    try {
      const paymentReminderDays = reminderDays.split(/[,，\s]+/).map(Number).filter(n => !isNaN(n));
      const res = await fetch('/api/users/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currency, taxRate: taxRate || 0, paymentReminderDays, defaultPaymentTerms: defaultTerms }),
      });
      const r = await res.json();
      if (r.success) { toast.success('已保存'); mutate(); } else toast.error(r.error || '更新失败');
    } catch { toast.error('网络错误'); }
    finally { setSettingsLoading(false); }
  };

  const handleBindPhone = async () => {
    if (!bindPhone || !bindCode) return;
    setBindPhoneLoading(true);
    try {
      const res = await fetch('/api/users/bindphone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: bindPhone, code: bindCode }),
      });
      const r = await res.json();
      if (r.success) { toast.success('绑定成功'); setShowBindPhone(false); setBindPhone(''); setBindCode(''); mutate(); await update(); }
      else toast.error(r.error || '绑定失败');
    } catch { toast.error('网络错误'); }
    finally { setBindPhoneLoading(false); }
  };

  const handleSavePassword = async () => {
    if (!newPwd || newPwd.length < 6) { toast.error('新密码至少 6 位'); return; }
    if (newPwd !== confirmPwd) { toast.error('两次输入的密码不一致'); return; }
    if (hasPassword && !currentPwd) { toast.error('请输入当前密码'); return; }
    const phoneForHash = profile?.phone;
    if (!phoneForHash) { toast.error('用户信息缺失，请刷新页面后重试'); return; }
    setPwdLoading(true);
    try {
      // 客户端先做 SHA-256 预哈希（绑定手机号），服务器只收到 64 位 hex，不见明文
      const hashedCurrent = currentPwd ? await preHashPassword(phoneForHash, currentPwd) : '';
      const hashedNew = await preHashPassword(phoneForHash, newPwd);
      const res = await fetch('/api/users/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: hashedCurrent, newPassword: hashedNew }),
      });
      const r = await res.json();
      if (r.success) {
        toast.success(hasPassword ? '密码已修改' : '密码已设置');
        setShowPasswordForm(false);
        setCurrentPwd(''); setNewPwd(''); setConfirmPwd('');
        mutate();
      } else toast.error(r.error || '操作失败');
    } catch { toast.error('网络错误'); }
    finally { setPwdLoading(false); }
  };

  const startBindCountdown = () => {
    setBindCountdown(60);
    const timer = setInterval(() => {
      setBindCountdown((c) => { if (c <= 1) { clearInterval(timer); return 0; } return c - 1; });
    }, 1000);
  };

  const handlePrivacyModeChange = async (mode: string) => {
    setPrivacyLoading(true);
    try {
      const res = await fetch('/api/users/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ privacyMode: mode }),
      });
      const r = await res.json();
      if (r.success) { setPrivacyMode(mode); toast.success(mode === 'strict' ? '已切换到严格模式' : '已切换到标准模式'); mutate(); mutateAiLogs(); }
      else toast.error(r.error || '切换失败');
    } catch { toast.error('网络错误'); }
    finally { setPrivacyLoading(false); }
  };

  const handleDeleteAccount = async () => {
    setDeleteLoading(true);
    try {
      const res = await fetch('/api/users/account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation: deleteConfirmText }),
      });
      const r = await res.json();
      if (r.success) { toast.success('账号已注销'); signOut({ callbackUrl: '/login' }); }
      else toast.error(r.error || '注销失败');
    } catch { toast.error('网络错误'); }
    finally { setDeleteLoading(false); }
  };

  const handleFeedbackSubmit = async () => {
    if (!feedbackContent.trim()) { toast.error('请填写反馈内容'); return; }
    setFeedbackLoading(true);
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: feedbackType, content: feedbackContent, contact: feedbackContact }),
      });
      const result = await res.json();
      if (result.success) {
        toast.success('感谢你的反馈！');
        setFeedbackContent('');
        setFeedbackContact('');
        setFeedbackSent(true);
        setTimeout(() => setFeedbackSent(false), 3000);
      } else {
        toast.error(result.error || '提交失败');
      }
    } catch { toast.error('网络错误'); }
    finally { setFeedbackLoading(false); }
  };

  const maskedPhone = profile?.phone ? `${profile.phone.slice(0, 3)}****${profile.phone.slice(7)}` : '';
  const hasPassword = !!profile?.hasPassword;
  const hasPhone = !!profile?.phone;
  const userName = profile?.name || session?.user?.name || '用户';
  const planLabel = { free: '免费版', pro: '专业版', premium: '旗舰版' }[profile?.plan || 'free'] || '免费版';

  return (
    <div className="max-w-5xl mx-auto">

      {/* ═══ 顶部个人名片 ═══ */}
      <div className="relative bg-white rounded-card border-[1.5px] border-cream-300 overflow-hidden mb-6">
        {/* 装饰背景 */}
        <div className="absolute inset-0 h-28" style={{ background: 'linear-gradient(135deg, #C47D3F12 0%, #D4940E08 50%, #5B8C5A08 100%)' }} />

        <div className="relative px-4 sm:px-6 pt-6 sm:pt-8 pb-5 sm:pb-6 flex items-end gap-3 sm:gap-5">
          {/* 头像 */}
          <div className="relative group shrink-0">
            {profile?.avatarUrl ? (
              <img // eslint-disable-line @next/next/no-img-element
                src={profile.avatarUrl} alt="头像" width={80} height={80}
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-[14px] sm:rounded-[18px] object-cover ring-4 ring-white shadow-sm" />
            ) : (
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-[14px] sm:rounded-[18px] ring-4 ring-white shadow-sm flex items-center justify-center text-white text-xl sm:text-2xl font-bold font-serif"
                style={{ background: 'linear-gradient(135deg, #C47D3F, #D4940E)' }}>
                {userName.charAt(0)}
              </div>
            )}
            {avatarUploading && (
              <div className="absolute inset-0 rounded-[14px] sm:rounded-[18px] bg-black/40 flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            {/* 悬浮操作按钮 */}
            <div className="absolute -bottom-1 -right-1 flex items-center gap-0.5">
              {profile?.avatarUrl && (
                <button
                  onClick={handleAvatarRemove}
                  title="移除头像"
                  className="w-7 h-7 rounded-full bg-white border border-cream-300 shadow-sm flex items-center justify-center hover:bg-red-50 hover:border-red-200 transition-colors sm:opacity-0 sm:group-hover:opacity-100"
                >
                  <svg className="w-3.5 h-3.5 text-brown-400 hover:text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
              <button
                onClick={() => fileInputRef.current?.click()}
                title="上传头像"
                className="w-7 h-7 rounded-full bg-white border border-cream-300 shadow-sm flex items-center justify-center hover:bg-cream-50 transition-colors"
              >
                <svg className="w-3.5 h-3.5 text-brown-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </button>
            </div>
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={handleAvatarUpload} className="hidden" />
          </div>

          {/* 信息 */}
          <div className="flex-1 min-w-0 pb-0.5">
            <div className="flex items-center gap-2.5">
              <h2 className="font-serif text-xl font-bold text-brown-800 truncate">{userName}</h2>
              <span className="shrink-0 text-[11px] px-2 py-0.5 rounded-full font-medium"
                style={{ background: 'linear-gradient(135deg, #C47D3F15, #D4940E15)', color: '#C47D3F' }}>
                {planLabel}
              </span>
            </div>
            <p className="text-brown-400 text-sm mt-0.5 truncate">
              {profile?.companyName || '未设置公司名称'}
              {profile?.companyName && ' · '}
              {BUSINESS_TYPES.find(b => b.value === profile?.businessType)?.label || ''}
            </p>
          </div>

          {/* 右侧状态 */}
          <div className="flex flex-col items-end gap-1.5 sm:gap-2 shrink-0 pb-0.5">
            <button
              onClick={() => setShowSignOutConfirm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 sm:py-1 rounded-full text-xs text-brown-300 hover:text-red-500 hover:bg-red-50 border border-cream-300 hover:border-red-200 transition-all"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              退出
            </button>
            <div className="hidden sm:flex items-center gap-3 text-xs">
              {hasPhone && (
                <span className="text-brown-400 font-mono">{maskedPhone}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ═══ 移动端标签横滚 ═══ */}
      <div className="md:hidden -mx-4 px-4 overflow-x-auto flex gap-2 pb-2 mb-4">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`shrink-0 px-4 py-2.5 rounded-full text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-white text-brown-800 shadow-sm border border-cream-200'
                : 'text-brown-400 hover:text-brown-700 bg-cream-100/60'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ═══ 标签页 + 内容 ═══ */}
      <div className="flex gap-6">
        {/* 左侧导航（PC端） */}
        <nav className="hidden md:block w-48 shrink-0">
          <div className="sticky top-24 space-y-1">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-[12px] text-sm font-medium transition-all duration-150 ${
                  activeTab === tab.id
                    ? 'bg-white text-brown-800 shadow-sm border border-cream-200'
                    : 'text-brown-400 hover:text-brown-700 hover:bg-white/60'
                }`}
              >
                <svg className={`w-[18px] h-[18px] shrink-0 ${activeTab === tab.id ? 'text-caramel' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} />
                  {tab.id === 'business' && <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />}
                </svg>
                {tab.label}
              </button>
            ))}
          </div>
        </nav>

        {/* 右侧内容 */}
        <div className="flex-1 min-w-0 space-y-5">

          {/* ═══ TAB: 个人资料 ═══ */}
          {activeTab === 'profile' && (
            <>
              {/* 基本信息 */}
              <Section title="基本信息" desc="设置你的昵称、公司名和业务类型">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input label="昵称" value={name} onChange={(e) => setName(e.target.value)} placeholder="你的昵称" />
                  <Input label="公司/工作室" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="一人公司的名称" />
                </div>
                <Select label="业务类型" options={BUSINESS_TYPES} value={businessType} onChange={(e) => setBusinessType(e.target.value)} />
                <div className="flex justify-end pt-1">
                  <Button onClick={handleProfileSave} loading={profileLoading} size="sm">保存信息</Button>
                </div>
              </Section>

              {/* 登录方式 */}
              <Section title="登录方式" desc="管理你的手机号和登录密码">
                {/* 手机号 */}
                <div className="py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-[10px] bg-caramel/8 flex items-center justify-center">
                        <svg className="w-5 h-5 text-caramel" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-brown-800">手机号</p>
                        <p className={`text-xs mt-0.5 ${hasPhone ? 'text-green-600' : 'text-brown-300'}`}>
                          {hasPhone ? `已绑定 ${maskedPhone}` : '未绑定'}
                        </p>
                      </div>
                    </div>
                    {!hasPhone && !showBindPhone && (
                      <Button size="sm" variant="ghost" onClick={() => setShowBindPhone(true)}>绑定</Button>
                    )}
                  </div>

                  {showBindPhone && !hasPhone && (
                    <div className="mt-3 p-4 bg-cream-50 rounded-[14px] space-y-3">
                      <input type="tel" maxLength={11} value={bindPhone}
                        onChange={(e) => setBindPhone(e.target.value.replace(/\D/g, ''))}
                        placeholder="输入手机号"
                        className="w-full px-3 py-2.5 rounded-[10px] border border-cream-300 text-sm text-brown-800 outline-none focus:border-caramel" />
                      <div className="flex gap-2">
                        <input type="text" maxLength={6} value={bindCode}
                          onChange={(e) => setBindCode(e.target.value.replace(/\D/g, ''))}
                          placeholder="验证码"
                          className="flex-1 px-3 py-2.5 rounded-[10px] border border-cream-300 text-sm text-brown-800 outline-none focus:border-caramel" />
                        <button type="button" disabled={bindCountdown > 0 || bindPhone.length !== 11} onClick={startBindCountdown}
                          className="px-4 py-2.5 rounded-[10px] border border-caramel text-caramel text-sm whitespace-nowrap disabled:opacity-50">
                          {bindCountdown > 0 ? `${bindCountdown}s` : '发送验证码'}
                        </button>
                      </div>
                      {process.env.NODE_ENV === 'development' && <p className="text-brown-300 text-[11px]">开发模式验证码：051029</p>}
                      <div className="flex gap-2">
                        <Button size="sm" onClick={handleBindPhone} loading={bindPhoneLoading}>确认绑定</Button>
                        <Button size="sm" variant="ghost" onClick={() => { setShowBindPhone(false); setBindPhone(''); setBindCode(''); }}>取消</Button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="h-px bg-cream-100" />

                {/* 登录密码 */}
                <div className="py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-[10px] bg-caramel/8 flex items-center justify-center">
                        <svg className="w-5 h-5 text-caramel" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-brown-800">登录密码</p>
                        <p className={`text-xs mt-0.5 ${hasPassword ? 'text-green-600' : 'text-brown-300'}`}>
                          {hasPassword ? '已设置' : '未设置，当前仅能通过验证码登录'}
                        </p>
                      </div>
                    </div>
                    {!showPasswordForm && (
                      <Button size="sm" variant="ghost" onClick={() => setShowPasswordForm(true)}>
                        {hasPassword ? '修改' : '设置'}
                      </Button>
                    )}
                  </div>

                  {showPasswordForm && (
                    <div className="mt-3 p-4 bg-cream-50 rounded-[14px] space-y-3">
                      {hasPassword && (
                        <input type="password" value={currentPwd}
                          onChange={(e) => setCurrentPwd(e.target.value)}
                          placeholder="当前密码"
                          className="w-full px-3 py-2.5 rounded-[10px] border border-cream-300 text-sm text-brown-800 outline-none focus:border-caramel" />
                      )}
                      <input type="password" value={newPwd}
                        onChange={(e) => setNewPwd(e.target.value)}
                        placeholder="新密码（6-64 位）"
                        className="w-full px-3 py-2.5 rounded-[10px] border border-cream-300 text-sm text-brown-800 outline-none focus:border-caramel" />
                      <input type="password" value={confirmPwd}
                        onChange={(e) => setConfirmPwd(e.target.value)}
                        placeholder="确认新密码"
                        className="w-full px-3 py-2.5 rounded-[10px] border border-cream-300 text-sm text-brown-800 outline-none focus:border-caramel" />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={handleSavePassword} loading={pwdLoading}>
                          {hasPassword ? '确认修改' : '确认设置'}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => {
                          setShowPasswordForm(false);
                          setCurrentPwd(''); setNewPwd(''); setConfirmPwd('');
                        }}>取消</Button>
                      </div>
                    </div>
                  )}
                </div>
              </Section>
            </>
          )}

          {/* ═══ TAB: 经营设置 ═══ */}
          {activeTab === 'business' && (
            <>
              <Section title="财务参数" desc="报价和记账时的默认值">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Select label="默认货币" options={CURRENCIES} value={currency} onChange={(e) => setCurrency(e.target.value)} />
                  <Input label="默认税率 (%)" type="number" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} placeholder="如：6" hint="创建报价时的默认税率" />
                </div>
              </Section>

              <Section title="催款提醒" desc="到期前几天自动提醒">
                <Input label="提醒天数" value={reminderDays} onChange={(e) => setReminderDays(e.target.value)} placeholder="3, 1, 0"
                  hint="逗号分隔，如 3, 1, 0 表示提前3天、1天和当天提醒" />
              </Section>

              <Section title="付款条款" desc="报价单默认付款条款模板">
                <textarea value={defaultTerms} onChange={(e) => setDefaultTerms(e.target.value)}
                  placeholder="如：签订合同后支付 50% 预付款，交付验收后支付剩余 50%"
                  rows={3}
                  className="w-full px-4 py-2.5 text-sm text-brown-800 bg-white rounded-[14px] border-[1.5px] border-cream-300 outline-none transition-all duration-200 focus:border-caramel focus:ring-2 focus:ring-caramel/15 resize-none" />
                <div className="flex justify-end pt-1">
                  <Button onClick={handleSettingsSave} loading={settingsLoading} size="sm">保存设置</Button>
                </div>
              </Section>
            </>
          )}

          {/* ═══ TAB: 意见反馈 ═══ */}
          {activeTab === 'feedback' && (
            <>
              <Section title="意见反馈" desc="你的反馈是我们改进的动力">
                {/* 反馈类型 */}
                <div>
                  <label className="block text-sm font-medium text-brown-800 mb-2">反馈类型</label>
                  <div className="flex flex-wrap gap-2">
                    {FEEDBACK_TYPES.map((ft) => (
                      <button
                        key={ft.value}
                        type="button"
                        onClick={() => setFeedbackType(ft.value)}
                        className={[
                          'px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 border-[1.5px]',
                          feedbackType === ft.value
                            ? 'bg-caramel/10 text-caramel border-caramel/30'
                            : 'bg-cream-50 text-brown-400 border-cream-300 hover:border-caramel/20 hover:text-brown-600',
                        ].join(' ')}
                      >
                        {ft.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 反馈内容 */}
                <div>
                  <label className="block text-sm font-medium text-brown-800 mb-1.5">反馈内容 *</label>
                  <textarea
                    value={feedbackContent}
                    onChange={(e) => setFeedbackContent(e.target.value)}
                    placeholder={
                      feedbackType === 'bug' ? '请描述你遇到的问题，包括操作步骤和预期结果...'
                      : feedbackType === 'feature' ? '请描述你希望添加的功能...'
                      : '请写下你的想法和建议...'
                    }
                    rows={5}
                    className="w-full px-4 py-3 text-sm text-brown-800 bg-white rounded-[14px] border-[1.5px] border-cream-300 outline-none focus:border-caramel focus:ring-2 focus:ring-caramel/15 transition-all duration-200 resize-none"
                  />
                </div>

                {/* 联系方式（可选） */}
                <Input
                  label="联系方式（选填）"
                  placeholder="方便我们与你沟通，如微信号、手机号或邮箱"
                  value={feedbackContact}
                  onChange={(e) => setFeedbackContact(e.target.value)}
                />

                <div className="flex items-center justify-between pt-1">
                  {feedbackSent ? (
                    <p className="text-sm text-olive flex items-center gap-1.5">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      已收到，感谢反馈！
                    </p>
                  ) : (
                    <p className="text-xs text-brown-300">我们会认真阅读每一条反馈</p>
                  )}
                  <Button onClick={handleFeedbackSubmit} loading={feedbackLoading} size="sm">
                    提交反馈
                  </Button>
                </div>
              </Section>
            </>
          )}

          {/* ═══ TAB: 数据与隐私 ═══ */}
          {activeTab === 'privacy' && (
            <>
              {/* 隐私模式 */}
              <Section title="隐私保护模式" desc="控制小木功能如何处理你的数据">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <PrivacyModeCard
                    active={privacyMode === 'standard'}
                    disabled={privacyLoading}
                    onClick={() => handlePrivacyModeChange('standard')}
                    title="标准模式"
                    badge="推荐"
                    desc="小木生成 + 模板缓存，仅发送意图参数（不含隐私数据）"
                    color="caramel"
                  />
                  <PrivacyModeCard
                    active={privacyMode === 'strict'}
                    disabled={privacyLoading}
                    onClick={() => handlePrivacyModeChange('strict')}
                    title="严格模式"
                    desc="纯规则引擎，永远零云端调用"
                    color="green"
                  />
                </div>
              </Section>

              {/* 小木调用记录 */}
              <Section title="小木调用记录" desc="查看最近7天的小木数据处理详情">
                {/* 统计 */}
                {aiStats && aiStats.total > 0 && (
                  <div className="flex flex-wrap gap-3 mb-4">
                    <StatBadge label="总调用" value={aiStats.total} />
                    <StatBadge label="缓存命中" value={aiStats.cacheHitCount} color="green" />
                    <StatBadge label="仅意图参数" value={aiStats.intentOnlyCount} color="blue" />
                  </div>
                )}
                <div className="p-3 rounded-[12px] bg-green-50/60 border border-green-100 flex items-start gap-2 mb-4">
                  <svg className="w-4 h-4 text-green-600 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  <p className="text-xs text-green-700 leading-relaxed">你的客户名称、联系方式、具体金额从未发送给任何第三方服务商。</p>
                </div>

                {/* 日志列表 */}
                {aiLogs.length === 0 ? (
                  <div className="text-center py-8 text-brown-300">
                    <p className="text-2xl mb-1">🔒</p>
                    <p className="text-sm">暂无小木调用记录</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                    {aiLogs.map((log, idx) => (
                      <div key={idx} className="p-3 rounded-[12px] bg-cream-50/60 border border-cream-200 hover:border-cream-300 transition-colors">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[11px] text-brown-400 tabular-nums shrink-0">
                              {new Date(log.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <span className="text-xs font-medium text-brown-800 truncate">{TASK_LABELS[log.task] || log.task}</span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {log.cacheHit && <MicroBadge color="gray">缓存</MicroBadge>}
                            {log.dataSent === 'none' ? (
                              <MicroBadge color="green">零外发</MicroBadge>
                            ) : log.dataSent === 'intent_only' ? (
                              <button type="button" onClick={() => setExpandedLogIndex(expandedLogIndex === idx ? null : idx)}
                                className="text-[10px] px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors leading-none">
                                意图参数 {expandedLogIndex === idx ? '▲' : '▼'}
                              </button>
                            ) : (
                              <MicroBadge color="amber">{log.dataSent}</MicroBadge>
                            )}
                          </div>
                        </div>
                        {expandedLogIndex === idx && log.intentParams && (
                          <div className="mt-2 p-2 bg-white rounded-[8px] border border-cream-200">
                            <div className="space-y-0.5">
                              {Object.entries(log.intentParams).map(([key, value]) => (
                                <div key={key} className="flex gap-2 text-[11px]">
                                  <span className="text-brown-400 font-mono shrink-0">{key}:</span>
                                  <span className="text-brown-700 break-all">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Section>
            </>
          )}

          {/* ═══ TAB: 账号安全 ═══ */}
          {activeTab === 'account' && (
            <>
              <Section title="数据导出" desc="下载你在一木中的全部数据">
                <div className="flex items-center justify-between p-4 rounded-[14px] bg-cream-50 border border-cream-200">
                  <div>
                    <p className="text-sm font-medium text-brown-800">导出完整数据</p>
                    <p className="text-xs text-brown-400 mt-0.5">客户、项目、报价、收支记录，JSON 格式</p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => { window.location.href = '/api/users/export'; }}>
                    下载
                  </Button>
                </div>
              </Section>

              <Section title="退出登录">
                <Button variant="ghost" size="sm" onClick={() => setShowSignOutConfirm(true)}>退出当前账号</Button>
              </Section>

              {/* 危险区域 */}
              <div className="bg-white rounded-card border-[1.5px] border-red-100 p-4 sm:p-5">
                <h3 className="text-sm font-semibold text-red-600 mb-1">危险操作</h3>
                <p className="text-xs text-brown-400 mb-4">删除账号后，所有数据将被永久清除且无法恢复。</p>

                {!showDeleteConfirm ? (
                  <Button variant="danger" size="sm" onClick={() => setShowDeleteConfirm(true)}>删除我的账号</Button>
                ) : (
                  <div className="p-4 bg-red-50 rounded-[14px] space-y-3 animate-fade-up">
                    <p className="text-sm text-red-700">请输入 <span className="font-bold">删除</span> 以确认：</p>
                    <input
                      type="text"
                      value={deleteConfirmText}
                      onChange={(e) => setDeleteConfirmText(e.target.value)}
                      placeholder={'输入"删除"'}
                      className="w-full px-3.5 py-2.5 rounded-[10px] border border-red-200 text-sm text-brown-800 outline-none focus:border-red-400 bg-white"
                    />
                    <div className="flex gap-2">
                      <Button variant="danger" size="sm" loading={deleteLoading} disabled={deleteConfirmText !== '删除'} onClick={handleDeleteAccount}>
                        确认永久删除
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(''); }}>取消</Button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

        </div>
      </div>

      {/* 退出登录确认 */}
      <Modal
        isOpen={showSignOutConfirm}
        onClose={() => !signOutLoading && setShowSignOutConfirm(false)}
        title="退出登录"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-brown-500">
            确认退出当前账号？退出后需要重新登录才能继续使用。
          </p>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setShowSignOutConfirm(false)} disabled={signOutLoading}>
              取消
            </Button>
            <Button variant="danger" onClick={confirmSignOut} loading={signOutLoading}>
              确认退出
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ── 子组件 ──

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-card border-[1.5px] border-cream-300 p-4 sm:p-5">
      <div className="mb-3 sm:mb-4">
        <h3 className="text-sm font-semibold text-brown-800">{title}</h3>
        {desc && <p className="text-xs text-brown-400 mt-0.5">{desc}</p>}
      </div>
      <div className="space-y-3 sm:space-y-4">{children}</div>
    </div>
  );
}

function PrivacyModeCard({ active, disabled, onClick, title, badge, desc, color }: {
  active: boolean; disabled: boolean; onClick: () => void;
  title: string; badge?: string; desc: string; color: 'caramel' | 'green';
}) {
  const ring = active
    ? color === 'caramel' ? 'border-caramel bg-caramel/4' : 'border-green-500 bg-green-50/50'
    : 'border-cream-300 hover:border-cream-400';
  const dot = active
    ? color === 'caramel' ? 'bg-caramel' : 'bg-green-500'
    : 'bg-cream-300';

  return (
    <button type="button" disabled={disabled} onClick={onClick}
      className={`p-4 rounded-[14px] border-[1.5px] text-left transition-all ${ring}`}>
      <div className="flex items-center gap-2 mb-1.5">
        <div className={`w-3 h-3 rounded-full transition-colors ${dot}`} />
        <span className="text-sm font-semibold text-brown-800">{title}</span>
        {badge && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-caramel/10 text-caramel font-medium">{badge}</span>}
      </div>
      <p className="text-xs text-brown-400 ml-5 leading-relaxed">{desc}</p>
    </button>
  );
}

function StatBadge({ label, value, color = 'gray' }: { label: string; value: number; color?: 'gray' | 'green' | 'blue' }) {
  const styles = {
    gray:  'bg-cream-100 text-brown-700',
    green: 'bg-green-50 text-green-700',
    blue:  'bg-blue-50 text-blue-700',
  };
  return (
    <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${styles[color]}`}>
      <span className="font-bold">{value}</span>
      <span className="opacity-70">{label}</span>
    </div>
  );
}

function MicroBadge({ color, children }: { color: 'gray' | 'green' | 'amber'; children: React.ReactNode }) {
  const styles = {
    gray:  'bg-gray-100 text-gray-500',
    green: 'bg-green-50 text-green-600',
    amber: 'bg-amber-50 text-amber-600',
  };
  return <span className={`text-[10px] px-1.5 py-0.5 rounded-md leading-none ${styles[color]}`}>{children}</span>;
}
