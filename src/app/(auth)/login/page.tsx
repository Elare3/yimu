'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';

type Stage = 'phone' | 'code' | 'wechat-qr' | 'success';

// 微信登录错误映射
const WECHAT_ERRORS: Record<string, string> = {
  wechat_no_code: '微信授权已取消',
  wechat_token_fail: '微信登录失败，请重试',
  wechat_userinfo_fail: '获取微信信息失败，请重试',
  wechat_server_error: '服务器异常，请稍后重试',
};

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [stage, setStage] = useState<Stage>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const codeRefs = useRef<(HTMLInputElement | null)[]>([]);
  const qrContainerRef = useRef<HTMLDivElement>(null);

  // 检查URL中的微信登录错误
  useEffect(() => {
    const errCode = searchParams.get('error');
    if (errCode && WECHAT_ERRORS[errCode]) {
      setError(WECHAT_ERRORS[errCode]);
    }
  }, [searchParams]);

  // 倒计时
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  // 手机号格式校验
  const isPhoneValid = /^1[3-9]\d{9}$/.test(phone);

  // 发送验证码
  const sendCode = () => {
    setError('');
    setStage('code');
    setCountdown(60);
    setTimeout(() => codeRefs.current[0]?.focus(), 100);
  };

  // 处理验证码输入
  const handleCodeChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newCode = [...code];
    newCode[index] = value.slice(-1);
    setCode(newCode);

    if (value && index < 5) {
      codeRefs.current[index + 1]?.focus();
    }

    // 自动提交
    if (index === 5 && value) {
      const fullCode = [...newCode].join('');
      if (fullCode.length === 6) {
        handleLogin(fullCode);
      }
    }
  };

  // 处理退格
  const handleCodeKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      codeRefs.current[index - 1]?.focus();
    }
  };

  // 记住上次登录方式
  const [lastLogin, setLastLogin] = useState<string | null>(null);
  useEffect(() => {
    setLastLogin(localStorage.getItem('yimu_last_login'));
  }, []);

  // 微信二维码登录 — 内嵌模式
  const handleWechatLogin = useCallback(() => {
    setError('');
    setStage('wechat-qr');
    localStorage.setItem('yimu_last_login', 'wechat');
  }, []);

  // 加载微信二维码 JS SDK 并渲染
  useEffect(() => {
    if (stage !== 'wechat-qr') return;

    const appId = process.env.NEXT_PUBLIC_WECHAT_APP_ID;
    if (!appId || appId === 'wx_your_app_id') {
      // 未配置微信 AppID，降级到 NextAuth 重定向模式
      signIn('wechat', { callbackUrl: '/dashboard' });
      return;
    }

    const containerId = 'wechat-qr-container';
    const container = qrContainerRef.current;
    if (!container) return;

    // 确保容器有 id
    container.id = containerId;

    // 构建回调地址
    const redirectUri = `${window.location.origin}/api/auth/wechat-qr-callback`;

    // 动态加载微信 JS SDK
    const script = document.createElement('script');
    script.src = 'https://res.wx.qq.com/connect/zh_CN/htmledition/js/wxLogin.js';
    script.onload = () => {
      // 清空容器（防止重复渲染）
      container.innerHTML = '';

      // 自定义样式 URL（使 QR 码匹配一木设计风格）
      const cssHref = `${window.location.origin}/wechat-qr.css`;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      new (window as any).WxLogin({
        self_redirect: false,
        id: containerId,
        appid: appId,
        scope: 'snsapi_login',
        redirect_uri: encodeURIComponent(redirectUri),
        state: 'yimu_' + Math.random().toString(36).slice(2, 10),
        style: 'black',
        href: cssHref,
      });
    };
    document.head.appendChild(script);

    return () => {
      // 清理
      if (script.parentNode) script.parentNode.removeChild(script);
    };
  }, [stage]);

  // 手机号登录
  const handleLogin = useCallback(async (codeStr: string) => {
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
      setTimeout(() => {
        router.push('/dashboard');
      }, 1500);
    }
  }, [phone, router]);

  // 掩码手机号
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
        {/* Logo */}
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

        {/* 标语 */}
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

          {/* 功能胶囊标签 */}
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

        {/* 底部引语 */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-px bg-[#C47D3F]/30" />
          <p className="text-[#6A5E52] text-base italic font-serif">
            Less is more, One is enough.
          </p>
        </div>

        {/* 装饰圆点 */}
        <div className="absolute top-20 right-20 w-2 h-2 rounded-full bg-[#C47D3F]/30" />
        <div className="absolute bottom-40 right-12 w-3 h-3 rounded-full bg-[#C47D3F]/20" />
        <div className="absolute top-1/2 right-8 w-1.5 h-1.5 rounded-full bg-[#D4940E]/25" />
      </div>

      {/* 右侧登录表单 */}
      <div className="flex-1 flex items-center justify-center px-6 lg:px-16 bg-cream-50">
        <div className="w-full max-w-[400px]">

          {/* ══════════ 手机号输入阶段 ══════════ */}
          {stage === 'phone' && (
            <div className="animate-fade-up">
              <h2 className="font-serif text-[30px] font-extrabold text-brown-800 mb-2">
                欢迎回来
              </h2>
              <p className="text-brown-500 text-[15px] mb-10">
                输入手机号，开始你的经营之旅
              </p>

              {/* 上次使用微信登录时，显示快捷入口 */}
              {lastLogin === 'wechat' && (
                <button
                  onClick={handleWechatLogin}
                  className="w-full py-3.5 mb-6 rounded-button bg-[#07C160] text-white flex items-center justify-center gap-2 text-sm font-semibold transition-all hover:bg-[#06AD56]"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="white">
                    <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.534c0 2.382 1.274 4.52 3.267 5.936L2.43 17.96l2.762-1.392a9.95 9.95 0 003.499.632c.303 0 .601-.015.898-.042a5.778 5.778 0 01-.233-1.607c0-3.647 3.473-6.608 7.752-6.608.39 0 .775.027 1.152.076C17.513 5.03 13.485 2.188 8.691 2.188z" />
                    <path d="M24 15.55c0-3.297-3.473-5.972-7.752-5.972S8.496 12.253 8.496 15.55c0 3.299 3.473 5.973 7.752 5.973.85 0 1.67-.116 2.44-.33l2.174 1.1-.607-2.005C22.84 19.33 24 17.563 24 15.55z" />
                  </svg>
                  上次使用微信登录，快捷登录
                </button>
              )}

              <div className="mb-6">
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

              {error && (
                <p className="text-danger text-sm mb-4">{error}</p>
              )}

              <button
                onClick={sendCode}
                disabled={!isPhoneValid}
                className="w-full py-4 rounded-button text-white font-semibold text-sm transition-all duration-200"
                style={{
                  background: isPhoneValid
                    ? 'linear-gradient(135deg, #C47D3F, #D4956A)'
                    : '#F5EFE6',
                  color: isPhoneValid ? '#fff' : '#B5AA9E',
                  boxShadow: isPhoneValid ? '0 4px 16px rgba(196,125,63,0.3)' : 'none',
                  transform: isPhoneValid ? 'translateY(0)' : 'none',
                }}
              >
                获取验证码
              </button>
            </div>
          )}

          {/* ══════════ 验证码输入阶段 ══════════ */}
          {stage === 'code' && (
            <div className="animate-fade-up">
              <h2 className="font-serif text-[30px] font-extrabold text-brown-800 mb-2">
                输入验证码
              </h2>
              <p className="text-brown-500 text-[15px] mb-2">
                验证码已发送至{' '}
                <span className="text-caramel font-bold">{maskedPhone}</span>
              </p>
              {process.env.NODE_ENV === 'development' && (
                <p className="text-brown-300 text-xs mb-8">
                </p>
              )}
              {process.env.NODE_ENV !== 'development' && (
                <p className="text-brown-300 text-xs mb-8" />
              )}

              {/* 6格验证码 */}
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
                      borderColor: digit ? '#C47D3F' : (codeRefs.current[i] === document.activeElement ? '#C47D3F' : '#E8E0D4'),
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

              {/* 底部操作 */}
              <div className="flex items-center justify-between">
                <button
                  onClick={() => {
                    setStage('phone');
                    setCode(['', '', '', '', '', '']);
                    setError('');
                  }}
                  className="text-brown-300 text-sm hover:text-caramel transition-colors"
                >
                  ← 更换号码
                </button>
                <button
                  onClick={() => {
                    if (countdown === 0) {
                      setCountdown(60);
                    }
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

          {/* ══════════ 微信扫码阶段 ══════════ */}
          {stage === 'wechat-qr' && (
            <div className="animate-fade-up">
              <h2 className="font-serif text-[30px] font-extrabold text-brown-800 mb-2 text-center">
                微信扫码登录
              </h2>
              <p className="text-brown-500 text-[15px] mb-6 text-center">
                请使用微信扫描下方二维码
              </p>

              {/* 二维码容器 */}
              <div className="flex justify-center mb-6">
                <div
                  className="bg-white rounded-[20px] border-[1.5px] border-cream-300 p-6 shadow-sm"
                  style={{ minWidth: 280, minHeight: 280 }}
                >
                  <div
                    ref={qrContainerRef}
                    className="flex items-center justify-center"
                    style={{ minHeight: 230 }}
                  >
                    {/* 加载中状态 */}
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-8 h-8 border-2 border-[#07C160] border-t-transparent rounded-full animate-spin" />
                      <span className="text-brown-400 text-sm">二维码加载中...</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 提示 */}
              <div className="flex items-center justify-center gap-2 mb-6">
                <svg className="w-4 h-4 text-[#07C160]" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.534c0 2.382 1.274 4.52 3.267 5.936L2.43 17.96l2.762-1.392a9.95 9.95 0 003.499.632c.303 0 .601-.015.898-.042a5.778 5.778 0 01-.233-1.607c0-3.647 3.473-6.608 7.752-6.608.39 0 .775.027 1.152.076C17.513 5.03 13.485 2.188 8.691 2.188z" />
                  <path d="M24 15.55c0-3.297-3.473-5.972-7.752-5.972S8.496 12.253 8.496 15.55c0 3.299 3.473 5.973 7.752 5.973.85 0 1.67-.116 2.44-.33l2.174 1.1-.607-2.005C22.84 19.33 24 17.563 24 15.55z" />
                </svg>
                <span className="text-brown-400 text-xs">
                  打开微信 → 扫一扫 → 确认登录
                </span>
              </div>

              {error && (
                <p className="text-danger text-sm mb-4 text-center">{error}</p>
              )}

              {/* 返回手机登录 */}
              <button
                onClick={() => {
                  setStage('phone');
                  setError('');
                }}
                className="w-full text-center text-brown-300 text-sm hover:text-caramel transition-colors"
              >
                ← 使用手机号登录
              </button>
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
              {/* 进度条动画 */}
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

          {/* ══════════ 分隔线 + 其他登录方式 ══════════ */}
          {(stage === 'phone' || stage === 'code') && (
            <>
              <div className="flex items-center my-8">
                <div className="flex-1 h-px bg-cream-300" />
                <span className="px-4 text-brown-300 text-xs">其他方式</span>
                <div className="flex-1 h-px bg-cream-300" />
              </div>

              <button
                onClick={handleWechatLogin}
                className="w-full py-3 rounded-button bg-white border-[1.5px] border-cream-300 flex items-center justify-center gap-2 text-sm text-brown-800 font-medium hover:border-[#07C160] hover:bg-[#07C160]/5 transition-all duration-200"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#07C160">
                  <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.534c0 2.382 1.274 4.52 3.267 5.936L2.43 17.96l2.762-1.392a9.95 9.95 0 003.499.632c.303 0 .601-.015.898-.042a5.778 5.778 0 01-.233-1.607c0-3.647 3.473-6.608 7.752-6.608.39 0 .775.027 1.152.076C17.513 5.03 13.485 2.188 8.691 2.188zm-2.85 4.19a1.11 1.11 0 110 2.22 1.11 1.11 0 010-2.22zm5.728 0a1.11 1.11 0 110 2.22 1.11 1.11 0 010-2.22z" />
                  <path d="M24 15.55c0-3.297-3.473-5.972-7.752-5.972S8.496 12.253 8.496 15.55c0 3.299 3.473 5.973 7.752 5.973.85 0 1.67-.116 2.44-.33l2.174 1.1-.607-2.005C22.84 19.33 24 17.563 24 15.55zm-10.27-1.03a.87.87 0 110-1.74.87.87 0 010 1.74zm5.035 0a.87.87 0 110-1.74.87.87 0 010 1.74z" />
                </svg>
                微信扫码登录
              </button>

              {/* 用户协议 */}
              <p className="text-center text-xs text-brown-300 mt-8">
                登录即表示同意{' '}
                <span className="text-caramel cursor-pointer hover:underline">用户协议</span>
                {' '}和{' '}
                <a href="/privacy" target="_blank" className="text-caramel hover:underline">隐私政策</a>
              </p>
            </>
          )}

          {/* 右下角版本号 */}
          <div className="fixed bottom-6 right-8 text-brown-300 text-xs">
            一木 v1.0 · Made with ☕
          </div>
        </div>
      </div>
    </div>
  );
}
