'use client';

import { useState, useCallback, memo } from 'react';
import { usePathname } from 'next/navigation';
import useSWR from 'swr';
import { useNotifications } from '@/hooks/useNotifications';
import NotificationPanel from '@/components/business/NotificationPanel';

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': '经营概览',
  '/clients': '客户管理',
  '/projects': '项目看板',
  '/quotes': '报价管理',
  '/finance': '收支记账',
  '/payments': '收款管理',
  '/settings': '个人设置',
};

const MOTTOS = [
  // ── 经典歌词（50条）──
  '没有什么能够阻挡 — 蓝莲花',
  '我还是从前那个少年 — 少年',
  '爱你孤身走暗巷 — 孤勇者',
  '阳光总在风雨后 — 阳光总在风雨后',
  '我的未来不是梦 — 我的未来不是梦',
  '隐形的翅膀带我飞 — 隐形的翅膀',
  '不经历风雨怎么见彩虹 — 真心英雄',
  '最初的梦想紧握在手上 — 最初的梦想',
  '风雨中抱紧自由 — 光辉岁月',
  '心若在梦就在 — 从头再来',
  '随风奔跑自由是方向 — 奔跑',
  '我要飞得更高 — 飞得更高',
  '风雨中这点痛算什么 — 水手',
  '我曾经跨过山和大海 — 平凡之路',
  '请照亮我前行 — 夜空中最亮的星',
  '不怕千万人阻挡，只怕自己投降 — 倔强',
  '曾经多少次跌倒在路上 — 怒放的生命',
  '命运就算颠沛流离 — 红日',
  '好想去流浪 — 突然的自我',
  '相信自己你将赢得胜利 — 相信自己',
  '追逐生命中的光 — 年少有为',
  '我相信自由自在 — 我相信',
  '你就是我的阳光 — 最美的太阳',
  '我曾将青春翻涌成她 — 起风了',
  '时光一逝永不回 — 岁月神偷',
  '如果说你是海上的烟火 — 追光者',
  '我就是我，不一样的烟火 — 我',
  '像风一样自由 — 像风一样自由',
  '给我翅膀让我可以翱翔 — 壮志在我胸',
  '充满鲜花的世界到底在哪里 — 追梦赤子心',
  '平凡才是唯一的答案 — 平凡之路',
  '我和我最后的倔强 — 倔强',
  '每个人都拥有一个梦 — 大梦想家',
  '也许世界就这样 — 你的答案',
  '海阔天空让我飞 — 海阔天空',
  '多远都可以到达 — 星辰大海',
  '认真地过每一分钟 — 我的未来不是梦',
  '有梦的人别怕 — 逆态度',
  '每一天都是新的一页 — 新的一天',
  '对这个世界不要太多抱怨 — 稻香',
  '我们都一样年轻又彷徨 — 我们都一样',
  '逆着光就更坚强 — 逆光',
  '明天你好，声音多渺小 — 明天你好',
  '当你觉得孤独时抬头看看天 — 最好的未来',
  '梦想是注定孤独的旅行 — 追梦赤子心',
  '黑暗中总有一束光 — 光',
  '生活不止眼前的苟且 — 生活不止眼前的苟且',
  '终有一天你会闪闪发光 — 你的答案',
  '你笑起来真好看 — 你笑起来真好看',
  '追光的人自己也会变成光 — 追光者',
];

function getGreeting(): string {
  const today = new Date();
  const dayIndex = today.getFullYear() * 366 + today.getMonth() * 31 + today.getDate();
  return MOTTOS[dayIndex % MOTTOS.length];
}

function formatToday(): string {
  const d = new Date();
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  return `${d.getMonth() + 1}月${d.getDate()}日 周${weekdays[d.getDay()]}`;
}

function HeaderInner() {
  const pathname = usePathname();
  const { data: profileData } = useSWR('/api/users/profile');
  const companyName = profileData?.data?.companyName || '';
  const [showNotifications, setShowNotifications] = useState(false);
  const { unreadCount } = useNotifications();

  const toggleNotifications = useCallback(() => {
    setShowNotifications((prev) => !prev);
  }, []);

  const closeNotifications = useCallback(() => {
    setShowNotifications(false);
  }, []);

  const title = Object.entries(PAGE_TITLES).find(
    ([path]) => pathname === path || pathname?.startsWith(path + '/')
  )?.[1] || '';

  return (
    <header
      className="sticky top-0 z-30 px-6 lg:px-8 py-4"
      style={{
        background: 'linear-gradient(180deg, #FAF6F0 60%, transparent)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <div className="flex items-center justify-between">
        {/* 左侧：标题 + 日期问候 */}
        <div>
          <h1 className="font-serif text-2xl font-extrabold text-brown-800">{title}</h1>
          <p className="text-brown-300 text-sm mt-0.5">
            {formatToday()} · {getGreeting()}
          </p>
        </div>

        {/* 中间：公司名称 */}
        {companyName && (
          <div className="hidden md:block absolute left-1/2 -translate-x-1/2">
            <span
              className="font-serif text-3xl font-extrabold tracking-wider bg-clip-text text-transparent"
              style={{ backgroundImage: 'linear-gradient(135deg, #2C2420 30%, #C47D3F)' }}
            >
              {companyName}
            </span>
          </div>
        )}

        {/* 右侧：通知 */}
        <div className="flex items-center">
          <div className="relative">
            <button
              onClick={toggleNotifications}
              className="relative w-10 h-10 flex items-center justify-center rounded-[12px] transition-all duration-200 group"
              style={{
                background: showNotifications ? 'linear-gradient(135deg, #C47D3F, #D4956A)' : 'rgba(232,224,212,0.5)',
              }}
              aria-label="通知"
            >
              <svg
                className={`w-[18px] h-[18px] transition-colors duration-200 ${showNotifications ? 'text-white' : 'text-brown-500 group-hover:text-brown-700'}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
              </svg>
              {unreadCount > 0 && (
                <span
                  className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-white text-[10px] font-bold leading-none shadow-sm"
                  style={{ background: 'linear-gradient(135deg, #E74C3C, #C0392B)' }}
                >
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>
            <NotificationPanel open={showNotifications} onClose={closeNotifications} />
          </div>
        </div>
      </div>
    </header>
  );
}

const Header = memo(HeaderInner);
export default Header;
