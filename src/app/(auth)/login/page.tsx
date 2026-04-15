'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';

type Mode = 'code' | 'password';
type Stage = 'input' | 'code' | 'success';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('code');
  const [stage, setStage] = useState<Stage>('input');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const codeRefs = useRef<(HTMLInputElement | null)[]>([]);

  // 倒计时
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const isPhoneValid = /^1[3-9]\d{9}$/.test(phone);

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
      localStorage.setItem('yimu_last_login', 'phone');
      setStage('success');
      setTimeout(() => router.push('/dashboard'), 1500);
    }
  }, [phone, router]);

  const handlePasswordLogin = useCallback(async () => {
    setLoading(true);
    setError('');

    const res = await signIn('password', {
      phone,
      password,
      redirect: false,
    });

    if (res?.error) {
      setError(res.error);
      setLoading(false);
    } else {
      localStorage.setItem('yimu_last_login', 'password');
      setStage('success');
      setTimeout(() => router.push('/dashboard'), 1500);
    }
  }, [phone, password, router]);

  const switchMode = (m: Mode) => {
    setMode(m);
    setError('');
    setStage('input');
    setCode(['', '', '', '', '', '']);
    setPassword('');
  };

  const maskedPhone = phone ? `${phone.slice(0, 3)}****${phone.slice(7)}` : '';

  return (
    <div className="min-h-screen flex">
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
      <div className="flex-1 flex items-center justify-center px-6 lg:px-16 bg-cream-50">
        <div className="w-full max-w-[400px]">

          {/* 登录方式切换 */}
          {stage !== 'success' && (
            <div className="flex gap-1 p-1 mb-8 bg-cream-100 rounded-[12px]">
              <button
                onClick={() => switchMode('code')}
                className={`flex-1 py-2.5 rounded-[10px] text-sm font-medium transition-all ${
                  mode === 'code' ? 'bg-white text-brown-800 shadow-sm' : 'text-brown-400'
                }`}
              >
                验证码登录
              </button>
              <button
                onClick={() => switchMode('password')}
                className={`flex-1 py-2.5 rounded-[10px] text-sm font-medium transition-all ${
                  mode === 'password' ? 'bg-white text-brown-800 shadow-sm' : 'text-brown-400'
                }`}
              >
                账号密码登录
              </button>
            </div>
          )}

          {/* ══════════ 输入阶段 ══════════ */}
          {stage === 'input' && (
            <div className="animate-fade-up">
              <h2 className="font-serif text-[30px] font-extrabold text-brown-800 mb-2">
                欢迎回来
              </h2>
              <p className="text-brown-500 text-[15px] mb-10">
                {mode === 'code' ? '输入手机号，获取验证码登录' : '输入手机号和密码登录'}
              </p>

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
                    placeholder="请输入手机号"
                    className="flex-1 px-3 py-4 bg-transparent font-serif text-[17px] tracking-[0.05em] text-brown-800 placeholder:text-brown-300 outline-none"
                  />
                </div>
              </div>

              {mode === 'password' && (
                <div className="mb-4">
                  <div
                    className="flex items-center bg-white rounded-[14px] border-[2px] transition-all duration-200"
                    style={{
                      borderColor: password ? '#C47D3F' : '#E8E0D4',
                      boxShadow: password ? '0 0 0 4px rgba(196,125,63,0.12)' : 'none',
                    }}
                  >
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setError('');
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && isPhoneValid && password) {
                          handlePasswordLogin();
                        }
                      }}
                      placeholder="请输入密码"
                      className="flex-1 px-4 py-4 bg-transparent text-[15px] text-brown-800 placeholder:text-brown-300 outline-none"
                    />
                  </div>
                </div>
              )}

              {error && (
                <p className="text-danger text-sm mb-4">{error}</p>
              )}

              <button
                onClick={mode === 'code' ? sendCode : handlePasswordLogin}
                disabled={!isPhoneValid || (mode === 'password' && !password) || loading}
                className="w-full py-4 rounded-button text-white font-semibold text-sm transition-all duration-200 disabled:cursor-not-allowed"
                style={{
                  background: isPhoneValid && (mode === 'code' || password)
                    ? 'linear-gradient(135deg, #C47D3F, #D4956A)'
                    : '#F5EFE6',
                  color: isPhoneValid && (mode === 'code' || password) ? '#fff' : '#B5AA9E',
                  boxShadow: isPhoneValid && (mode === 'code' || password) ? '0 4px 16px rgba(196,125,63,0.3)' : 'none',
                }}
              >
                {loading ? '登录中...' : mode === 'code' ? '获取验证码' : '登 录'}
              </button>

              {mode === 'password' && (
                <p className="text-center text-xs text-brown-400 mt-4">
                  没有账号？使用
                  <button
                    type="button"
                    onClick={() => switchMode('code')}
                    className="text-caramel hover:underline mx-1"
                  >
                    验证码登录
                  </button>
                  将自动注册
                </p>
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
                欢迎回来！
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

          <div className="fixed bottom-6 right-8 text-brown-300 text-xs">
            一木 v1.0 · Made with ☕
          </div>
        </div>
      </div>
    </div>
  );
}
