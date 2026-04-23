'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { preHashPassword } from '@/lib/client-password';

type Mode = 'password' | 'code';
type Stage = 'input' | 'code' | 'success';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('password');
  const [stage, setStage] = useState<Stage>('input');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [remember, setRemember] = useState(false);
  const codeRefs = useRef<(HTMLInputElement | null)[]>([]);
  const passwordRef = useRef<HTMLInputElement>(null);

  // 登录成功后根据「记住我」重写 cookie：
  //  - false（默认）：session-only cookie，关闭浏览器即登出（共用电脑安全）
  //  - true：持久 30 天
  const persistSession = useCallback(async (shouldRemember: boolean) => {
    try {
      await fetch('/api/auth/persist-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remember: shouldRemember }),
        credentials: 'same-origin',
      });
    } catch {
      // 写 cookie 失败不影响登录；退路是 NextAuth 默认的 30 天持久 cookie
    }
  }, []);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const isPhoneValid = /^1[3-9]\d{9}$/.test(phone);
  const isPasswordValid = password.length >= 6 && password.length <= 64;

  const sendCode = () => {
    setError('');
    setStage('code');
    setCountdown(60);
    setTimeout(() => codeRefs.current[0]?.focus(), 100);
  };

  const handleCodeChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newCode = [...code];
    newCode[index] = value.slice(-1);
    setCode(newCode);

    if (value && index < 5) {
      codeRefs.current[index + 1]?.focus();
    }

    if (index === 5 && value) {
      const fullCode = [...newCode].join('');
      if (fullCode.length === 6) {
        handleCodeLogin(fullCode);
      }
    }
  };

  const handleCodeKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      codeRefs.current[index - 1]?.focus();
    }
  };

  const handleCodeLogin = useCallback(async (codeStr: string) => {
    setLoading(true);
    setError('');

    const res = await signIn('phone', {
      phone,
      code: codeStr,
      redirect: false,
    });

    if (res?.error) {
      setError(res.error);
      setCode(['', '', '', '', '', '']);
      codeRefs.current[0]?.focus();
      setLoading(false);
    } else {
      await persistSession(remember);
      setStage('success');
      setTimeout(() => router.push('/dashboard'), 1500);
    }
  }, [phone, router, persistSession, remember]);

  const handlePasswordSubmit = useCallback(async () => {
    if (isRegister && password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    setLoading(true);
    setError('');

    // 客户端先做一次 SHA-256 预哈希（绑定手机号），避免 DevTools / 代理日志看到明文密码
    const hashedPassword = await preHashPassword(phone, password);

    const res = await signIn('password', {
      phone,
      password: hashedPassword,
      redirect: false,
    });

    if (res?.error) {
      if (res.error.includes('未设置密码')) {
        setError('该手机号已通过验证码注册，请使用验证码登录后在设置中添加密码');
      } else if (res.error.includes('密码错误')) {
        setError('密码错误，请重试');
      } else {
        setError(res.error);
      }
      setLoading(false);
    } else {
      await persistSession(remember);
      setStage('success');
      setTimeout(() => router.push('/dashboard'), 1500);
    }
  }, [phone, password, confirmPassword, isRegister, router, persistSession, remember]);

  const switchMode = (m: Mode) => {
    setMode(m);
    setError('');
    setStage('input');
    setCode(['', '', '', '', '', '']);
    setPassword('');
    setConfirmPassword('');
    setIsRegister(false);
  };

  const toggleRegister = () => {
    setIsRegister(!isRegister);
    setError('');
    setConfirmPassword('');
  };

  const maskedPhone = phone ? `${phone.slice(0, 3)}****${phone.slice(7)}` : '';

  const canSubmit = mode === 'password'
    ? isPhoneValid && isPasswordValid && (!isRegister || confirmPassword.length >= 6)
    : isPhoneValid;

  return (
    <div className="min-h-[100dvh] flex">
      {/* 左侧品牌面板 */}
      <div
        className="hidden lg:flex lg:w-[28%] relative overflow-hidden flex-col justify-between p-12"
        style={{
          backgroundColor: '#2C2420',
          borderRadius: '0 48px 48px 0',
          background: 'radial-gradient(ellipse at 30% 50%, rgba(196,125,63,0.15) 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, rgba(91,140,90,0.10) 0%, transparent 50%), #2C2420',
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-[52px] h-[52px] rounded-[14px] flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #C47D3F, #D4940E)' }}
          >
            <span className="text-white font-serif text-3xl font-extrabold">木</span>
          </div>
          <div>
            <div className="text-white font-serif text-[21px] font-bold">一木</div>
            <div className="text-[#8A7E72] text-[11px] tracking-[0.2em]">YIMU</div>
          </div>
        </div>

        <div className="flex-1 flex flex-col justify-center">
          <h1 className="font-serif text-[50px] leading-tight text-white font-bold mb-6">
            一人成木，
            <br />
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: 'linear-gradient(135deg, #C47D3F, #D4940E)' }}
            >
              独木成林。
            </span>
          </h1>
          <p className="text-[#8A7E72] text-lg leading-[1.8] max-w-[360px] mb-8">
            为独立创业者打造的经营伙伴。
            <br />
            客户管理、项目追踪、小木报价、
            <br />
            轻松记账，一人也能掌控全局。
          </p>

          <div className="grid grid-cols-2 gap-2 max-w-[280px]">
            {['小木报价', '项目看板', '收支管理', '一键催款'].map((tag, i) => (
              <span
                key={tag}
                className="px-5 py-2.5 rounded-full text-base"
                style={{
                  border: '1px solid rgba(196,125,63,0.2)',
                  background: 'rgba(196,125,63,0.06)',
                  color: '#D4956A',
                  animation: `fadeUp 0.5s ease ${300 + i * 100}ms both`,
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-8 h-px bg-[#C47D3F]/30" />
          <p className="text-[#6A5E52] text-base italic font-serif">
            Less is more, One is enough.
          </p>
        </div>
      </div>

      {/* 右侧登录表单 */}
      <div className="flex-1 flex items-center justify-center px-5 sm:px-6 lg:px-16 bg-cream-50">
        <div className="w-full max-w-[400px]">

          {/* ══════════ 输入阶段 ══════════ */}
          {stage === 'input' && (
            <div className="animate-fade-up">
              <h2 className="font-serif text-[30px] font-extrabold text-brown-800 mb-2">
                {mode === 'password'
                  ? (isRegister ? '创建账号' : '欢迎使用')
                  : '验证码登录'}
              </h2>
              <p className="text-brown-500 text-[15px] mb-8">
                {mode === 'password'
                  ? (isRegister
                    ? '输入手机号和密码，即刻开始'
                    : '输入手机号和密码登录')
                  : '输入手机号，获取验证码登录'}
              </p>

              {/* 手机号 */}
              <div className="mb-4">
                <div
                  className="flex items-center bg-white rounded-[14px] border-[2px] transition-all duration-200"
                  style={{
                    borderColor: phone ? '#C47D3F' : '#E8E0D4',
                    boxShadow: phone ? '0 0 0 4px rgba(196,125,63,0.12)' : 'none',
                  }}
                >
                  <span className="pl-4 pr-3 text-brown-500 text-sm border-r border-cream-300">+86</span>
                  <input
                    type="tel"
                    maxLength={11}
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value.replace(/\D/g, ''));
                      setError('');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && isPhoneValid && mode === 'password') {
                        passwordRef.current?.focus();
                      }
                    }}
                    placeholder="请输入手机号"
                    className="flex-1 px-3 py-4 bg-transparent font-serif text-[17px] tracking-[0.05em] text-brown-800 placeholder:text-brown-300 outline-none"
                  />
                </div>
              </div>

              {/* 密码 */}
              {mode === 'password' && (
                <>
                  <div className="mb-4">
                    <div
                      className="flex items-center bg-white rounded-[14px] border-[2px] transition-all duration-200"
                      style={{
                        borderColor: password ? '#C47D3F' : '#E8E0D4',
                        boxShadow: password ? '0 0 0 4px rgba(196,125,63,0.12)' : 'none',
                      }}
                    >
                      <input
                        ref={passwordRef}
                        type="password"
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          setError('');
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && canSubmit && !isRegister) {
                            handlePasswordSubmit();
                          }
                        }}
                        placeholder={isRegister ? '设置密码（6-64位）' : '请输入密码'}
                        className="flex-1 px-4 py-4 bg-transparent text-[15px] text-brown-800 placeholder:text-brown-300 outline-none"
                      />
                    </div>
                  </div>

                  {/* 确认密码（注册模式） */}
                  {isRegister && (
                    <div className="mb-4 animate-fade-up">
                      <div
                        className="flex items-center bg-white rounded-[14px] border-[2px] transition-all duration-200"
                        style={{
                          borderColor: confirmPassword ? '#C47D3F' : '#E8E0D4',
                          boxShadow: confirmPassword ? '0 0 0 4px rgba(196,125,63,0.12)' : 'none',
                        }}
                      >
                        <input
                          type="password"
                          value={confirmPassword}
                          onChange={(e) => {
                            setConfirmPassword(e.target.value);
                            setError('');
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && canSubmit) {
                              handlePasswordSubmit();
                            }
                          }}
                          placeholder="确认密码"
                          className="flex-1 px-4 py-4 bg-transparent text-[15px] text-brown-800 placeholder:text-brown-300 outline-none"
                        />
                      </div>
                    </div>
                  )}
                </>
              )}

              {error && (
                <p className="text-danger text-sm mb-4">{error}</p>
              )}

              {/* 记住我 — 默认关闭，共用电脑保护 */}
              <label className="flex items-center gap-2 mb-4 cursor-pointer select-none group">
                <span
                  className="relative w-[18px] h-[18px] rounded-[5px] border-[1.5px] flex items-center justify-center transition-all duration-150"
                  style={{
                    borderColor: remember ? '#C47D3F' : '#D8CFC2',
                    backgroundColor: remember ? '#C47D3F' : '#fff',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                  {remember && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
                <span className="text-sm text-brown-500 group-hover:text-brown-800 transition-colors">
                  30 天内免登录
                </span>
                <span className="text-xs text-brown-300 ml-1">
                  （公用电脑建议不勾选）
                </span>
              </label>

              {/* 提交按钮 */}
              <button
                onClick={mode === 'code' ? sendCode : handlePasswordSubmit}
                disabled={!canSubmit || loading}
                className="w-full py-4 rounded-button text-white font-semibold text-sm transition-all duration-200 disabled:cursor-not-allowed"
                style={{
                  background: canSubmit
                    ? 'linear-gradient(135deg, #C47D3F, #D4956A)'
                    : '#F5EFE6',
                  color: canSubmit ? '#fff' : '#B5AA9E',
                  boxShadow: canSubmit ? '0 4px 16px rgba(196,125,63,0.3)' : 'none',
                }}
              >
                {loading ? '请稍候...' : (
                  mode === 'code' ? '获取验证码' : (isRegister ? '注册并登录' : '登 录')
                )}
              </button>

              {/* 底部切换 */}
              {mode === 'password' && (
                <div className="flex items-center justify-between mt-5">
                  <button
                    type="button"
                    onClick={toggleRegister}
                    className="text-sm text-caramel hover:text-caramel-dark transition-colors"
                  >
                    {isRegister ? '已有账号？去登录' : '没有账号？去注册'}
                  </button>
                  <button
                    type="button"
                    onClick={() => switchMode('code')}
                    className="text-sm text-brown-400 hover:text-brown-600 transition-colors"
                  >
                    验证码登录
                  </button>
                </div>
              )}

              {mode === 'code' && (
                <div className="text-center mt-5">
                  <button
                    type="button"
                    onClick={() => switchMode('password')}
                    className="text-sm text-caramel hover:text-caramel-dark transition-colors"
                  >
                    使用密码登录
                  </button>
                </div>
              )}

              <p className="text-center text-xs text-brown-300 mt-8">
                登录即表示同意{' '}
                <span className="text-caramel cursor-pointer hover:underline">用户协议</span>
                {' '}和{' '}
                <a href="/privacy" target="_blank" className="text-caramel hover:underline">隐私政策</a>
              </p>
            </div>
          )}

          {/* ══════════ 验证码输入阶段 ══════════ */}
          {stage === 'code' && (
            <div className="animate-fade-up">
              <h2 className="font-serif text-[30px] font-extrabold text-brown-800 mb-2">
                输入验证码
              </h2>
              <p className="text-brown-500 text-[15px] mb-8">
                验证码已发送至{' '}
                <span className="text-caramel font-bold">{maskedPhone}</span>
              </p>

              <div className="flex gap-3 mb-6">
                {code.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => { codeRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleCodeChange(i, e.target.value)}
                    onKeyDown={(e) => handleCodeKeyDown(i, e)}
                    className="w-full h-[60px] text-center text-2xl font-serif font-bold rounded-[14px] border-[2px] outline-none transition-all duration-200"
                    style={{
                      backgroundColor: digit ? '#FDF5ED' : '#fff',
                      borderColor: digit ? '#C47D3F' : '#E8E0D4',
                      color: '#2C2420',
                      transform: digit ? 'scale(1.02)' : 'scale(1)',
                    }}
                  />
                ))}
              </div>

              {error && (
                <p className="text-danger text-sm mb-4">{error}</p>
              )}

              {loading && (
                <div className="flex items-center justify-center gap-2 mb-4">
                  <div className="w-4 h-4 border-2 border-caramel border-t-transparent rounded-full animate-spin" />
                  <span className="text-brown-500 text-sm">登录中...</span>
                </div>
              )}

              <div className="flex items-center justify-between">
                <button
                  onClick={() => {
                    setStage('input');
                    setCode(['', '', '', '', '', '']);
                    setError('');
                  }}
                  className="text-brown-300 text-sm hover:text-caramel transition-colors"
                >
                  ← 更换号码
                </button>
                <button
                  onClick={() => {
                    if (countdown === 0) setCountdown(60);
                  }}
                  disabled={countdown > 0}
                  className="text-sm transition-colors"
                  style={{ color: countdown > 0 ? '#B5AA9E' : '#C47D3F' }}
                >
                  {countdown > 0 ? `${countdown}s 后重新发送` : '重新发送'}
                </button>
              </div>
            </div>
          )}

          {/* ══════════ 登录成功 ══════════ */}
          {stage === 'success' && (
            <div className="animate-fade-up text-center">
              <div
                className="w-[88px] h-[88px] rounded-[22px] mx-auto mb-6 flex items-center justify-center animate-scale-in"
                style={{ background: 'linear-gradient(135deg, #C47D3F, #D4940E)' }}
              >
                <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="font-serif text-[28px] font-extrabold text-brown-800 mb-4">
                {isRegister ? '注册成功！' : '欢迎回来！'}
              </h2>
              <div className="w-[200px] h-1 mx-auto bg-cream-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    background: 'linear-gradient(90deg, #C47D3F, #D4940E)',
                    animation: 'progressFill 1.5s ease forwards',
                  }}
                />
              </div>
              <style jsx>{`
                @keyframes progressFill {
                  from { width: 0; }
                  to { width: 100%; }
                }
              `}</style>
            </div>
          )}

          <div className="hidden lg:block fixed bottom-6 right-8 text-brown-300 text-xs">
            一木 v1.0 · Made with ☕
          </div>
        </div>
      </div>
    </div>
  );
}
