import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { prisma } from '@/lib/prisma';
import { verifyPassword, hashPassword } from '@/lib/password';
import { isPreHashed } from '@/lib/client-password';
import { encrypt, hmacPhone } from '@/lib/encryption';

export const authOptions: NextAuthOptions = {
  providers: [
    // 手机号 + 验证码登录（不存在则自动注册）
    CredentialsProvider({
      id: 'phone',
      name: '手机号验证码登录',
      credentials: {
        phone: { label: '手机号', type: 'text' },
        code: { label: '验证码', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.phone || !credentials?.code) {
          throw new Error('请输入手机号和验证码');
        }

        const { phone, code } = credentials;

        if (!/^1[3-9]\d{9}$/.test(phone)) {
          throw new Error('手机号格式不正确');
        }

        // ── 验证码校验 ──
        // 1) Owner 白名单：仅当 phone 严格等于 OWNER_PHONE，且 code 等于 OWNER_TEST_CODE（默认 051029）时放行
        // 2) 非生产环境 + ENABLE_TEST_CODE=true：老的全员固定验证码（保留给本地开发）
        // 3) 其余全部拒绝，等待接入真实短信网关
        const OWNER_PHONE = process.env.OWNER_PHONE || '';
        const OWNER_TEST_CODE = process.env.OWNER_TEST_CODE || '051029';
        const isOwnerBackdoor = OWNER_PHONE && phone === OWNER_PHONE && code === OWNER_TEST_CODE;
        const isDevTestCode =
          process.env.NODE_ENV !== 'production' &&
          process.env.ENABLE_TEST_CODE === 'true' &&
          code === '051029';

        if (!isOwnerBackdoor && !isDevTestCode) {
          // 生产环境非 owner：等待接入真实短信网关
          throw new Error('短信验证服务未配置');
        }

        let user = await prisma.user.findUnique({ where: { phoneHash: hmacPhone(phone) } });

        if (!user) {
          user = await prisma.user.create({
            data: {
              phone: encrypt(phone),
              phoneHash: hmacPhone(phone),
              name: `用户${phone.slice(-4)}`,
            },
          });
        }

        return {
          id: user.id,
          name: user.name,
          phone: user.phone,
          avatarUrl: user.avatarUrl || '',
        };
      },
    }),

    // 手机号 + 密码登录
    CredentialsProvider({
      id: 'password',
      name: '账号密码登录',
      credentials: {
        phone: { label: '手机号', type: 'text' },
        password: { label: '密码', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.phone || !credentials?.password) {
          throw new Error('请输入手机号和密码');
        }

        const { phone, password } = credentials;

        if (!/^1[3-9]\d{9}$/.test(phone)) {
          throw new Error('手机号格式不正确');
        }
        // 客户端必须先做 SHA-256 预哈希（见 src/lib/client-password.ts），服务器只接受 64 位小写 hex。
        // 这样可以保证 DevTools / 代理日志 / 服务器日志都看不到明文密码。
        if (!isPreHashed(password)) {
          throw new Error('密码格式不正确，请刷新页面后重试');
        }

        let user = await prisma.user.findUnique({ where: { phoneHash: hmacPhone(phone) } });

        // ── 用户不存在：自动注册，密码即为首次设置的密码 ──
        if (!user) {
          user = await prisma.user.create({
            data: {
              phone: encrypt(phone),
              phoneHash: hmacPhone(phone),
              name: `用户${phone.slice(-4)}`,
              passwordHash: hashPassword(password),
            },
          });
          return {
            id: user.id,
            name: user.name,
            phone: user.phone,
            avatarUrl: user.avatarUrl || '',
          };
        }

        // ── 用户已存在但未设置过密码（验证码注册的账号） ──
        // 为避免有人用密码登录接口直接覆盖别人的密码完成账号劫持，这里拒绝
        if (!user.passwordHash) {
          throw new Error('该手机号未设置密码，请先用验证码登录并在设置中添加密码');
        }

        // ── 用户已存在且有密码：核对 ──
        if (!verifyPassword(password, user.passwordHash)) {
          throw new Error('密码错误');
        }

        return {
          id: user.id,
          name: user.name,
          phone: user.phone,
          avatarUrl: user.avatarUrl || '',
        };
      },
    }),
  ],
  session: {
    // JWT 有效期固定 30 天；实际「会话长度」由 cookie 的 Max-Age 控制，
    // 登录成功后通过 /api/auth/persist-session 根据「记住我」改写 cookie：
    //   - 不记住：cookie 为 session-only（关闭浏览器即登出）
    //   - 记住：cookie Max-Age = 30 天
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60,
    // 不自动刷新 cookie，防止 NextAuth 用默认 maxAge 覆盖掉我们改写后的 session-only cookie
    updateAge: 30 * 24 * 60 * 60,
  },
  cookies: {
    sessionToken: {
      name: process.env.ENABLE_HTTPS === 'true'
        ? '__Secure-next-auth.session-token'
        : 'next-auth.session-token',
      options: {
        httpOnly: true,
        secure: process.env.ENABLE_HTTPS === 'true',
        sameSite: 'lax' as const,
        path: '/',
      },
    },
  },
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id;
        token.phone = (user as { phone: string }).phone;
        token.avatarUrl = (user as { avatarUrl?: string }).avatarUrl || '';
      }

      // 当 session 被 update 时刷新资料
      if (trigger === 'update' && token.id) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { name: true, avatarUrl: true, phone: true },
        });
        if (dbUser) {
          token.name = dbUser.name;
          token.avatarUrl = dbUser.avatarUrl;
          token.phone = dbUser.phone;
        }
      }

      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.phone = token.phone || '';
        session.user.avatarUrl = token.avatarUrl || '';
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
  secret: process.env.NEXTAUTH_SECRET,
};
