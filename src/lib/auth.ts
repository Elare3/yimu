import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { prisma } from '@/lib/prisma';
import { verifyPassword } from '@/lib/password';
import { hmacPhone } from '@/lib/encryption';

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

        // 固定验证码仅在非生产环境生效；生产环境即使误留 ENABLE_TEST_CODE 也不放行
        if (process.env.NODE_ENV !== 'production' && process.env.ENABLE_TEST_CODE === 'true') {
          if (code !== '051029') {
            throw new Error('验证码错误');
          }
        } else {
          // TODO: 对接阿里云SMS验证服务
          throw new Error('短信验证服务未配置');
        }

        let user = await prisma.user.findUnique({ where: { phoneHash: hmacPhone(phone) } });

        if (!user) {
          user = await prisma.user.create({
            data: {
              phone,
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

        const user = await prisma.user.findUnique({ where: { phoneHash: hmacPhone(phone) } });

        // 统一错误文案，避免账号枚举
        if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
          throw new Error('手机号或密码错误');
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
    strategy: 'jwt',
    maxAge: 7 * 24 * 60 * 60, // 7 days
  },
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === 'production'
        ? '__Secure-next-auth.session-token'
        : 'next-auth.session-token',
      options: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
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
