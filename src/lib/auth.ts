import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { WechatProvider } from '@/lib/wechat-provider';
import { prisma } from '@/lib/prisma';

export const authOptions: NextAuthOptions = {
  providers: [
    // 微信扫码登录
    WechatProvider(),

    // 手机号验证码登录
    CredentialsProvider({
      id: 'phone',
      name: '手机号登录',
      credentials: {
        phone: { label: '手机号', type: 'text' },
        code: { label: '验证码', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.phone || !credentials?.code) {
          throw new Error('请输入手机号和验证码');
        }

        const { phone, code } = credentials;

        // 验证手机号格式
        if (!/^1[3-9]\d{9}$/.test(phone)) {
          throw new Error('手机号格式不正确');
        }

        // 开发环境：验证码 123456 即可登录
        // 生产环境：应对接阿里云SMS验证（TODO: 接入真实短信服务）
        if (process.env.NODE_ENV === 'development') {
          if (code !== '123456') {
            throw new Error('验证码错误');
          }
        } else {
          // 生产环境：验证短信验证码
          // TODO: 对接阿里云SMS验证服务
          throw new Error('短信验证服务未配置');
        }

        // 查找或创建用户
        let user = await prisma.user.findUnique({
          where: { phone },
        });

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
          phone: user.phone || '',
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
    async signIn({ account, profile }) {
      // 微信登录时：创建或更新用户
      if (account?.provider === 'wechat' && profile) {
        const wechatProfile = profile as { openid: string; unionid?: string; nickname?: string; headimgurl?: string };

        try {
          // 先查unionid（跨应用唯一），再查openid
          let existingUser = null;

          if (wechatProfile.unionid) {
            existingUser = await prisma.user.findUnique({
              where: { wechatUnionId: wechatProfile.unionid },
            });
          }

          if (!existingUser) {
            existingUser = await prisma.user.findUnique({
              where: { wechatOpenId: wechatProfile.openid },
            });
          }

          if (existingUser) {
            // 老用户：更新昵称和头像
            await prisma.user.update({
              where: { id: existingUser.id },
              data: {
                name: wechatProfile.nickname || existingUser.name,
                avatarUrl: wechatProfile.headimgurl || existingUser.avatarUrl,
                wechatOpenId: wechatProfile.openid,
                wechatUnionId: wechatProfile.unionid || existingUser.wechatUnionId,
              },
            });
          } else {
            // 新用户：创建，标记需要引导设置
            await prisma.user.create({
              data: {
                name: wechatProfile.nickname || '',
                avatarUrl: wechatProfile.headimgurl || '',
                wechatOpenId: wechatProfile.openid,
                wechatUnionId: wechatProfile.unionid,
                needsOnboarding: true,
              },
            });
          }
        } catch (error) {
          console.error('[WECHAT_SIGNIN]', error);
          return false;
        }
      }

      return true;
    },

    async jwt({ token, user, account, profile, trigger }) {
      if (account?.provider === 'wechat' && profile) {
        const wechatProfile = profile as { openid: string; unionid?: string };
        // 微信登录时user.id是openid，需要换成数据库id
        const dbUser = await prisma.user.findUnique({
          where: { wechatOpenId: wechatProfile.openid },
          select: { id: true, phone: true, avatarUrl: true, name: true, needsOnboarding: true },
        });
        if (dbUser) {
          token.id = dbUser.id;
          token.phone = dbUser.phone || '';
          token.avatarUrl = dbUser.avatarUrl;
          token.name = dbUser.name;
          token.needsOnboarding = dbUser.needsOnboarding;
        }
      } else if (user) {
        // 手机号登录
        token.id = user.id;
        token.phone = (user as { phone: string }).phone;
        token.avatarUrl = (user as { avatarUrl?: string }).avatarUrl || '';
        token.needsOnboarding = false;
      }

      // 当 session 被 update 时刷新头像
      if (trigger === 'update') {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { name: true, avatarUrl: true, needsOnboarding: true },
        });
        if (dbUser) {
          token.name = dbUser.name;
          token.avatarUrl = dbUser.avatarUrl;
          token.needsOnboarding = dbUser.needsOnboarding;
        }
      }

      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.phone = token.phone || '';
        session.user.avatarUrl = token.avatarUrl || '';
        session.user.needsOnboarding = token.needsOnboarding ?? false;
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
  secret: process.env.NEXTAUTH_SECRET,
};
