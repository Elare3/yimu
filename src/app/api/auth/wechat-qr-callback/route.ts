import { NextRequest, NextResponse } from 'next/server';
import { encode } from 'next-auth/jwt';
import { prisma } from '@/lib/prisma';

// GET /api/auth/wechat-qr-callback — 微信内嵌二维码扫码回调
// 流程：微信扫码 → 重定向到此接口(带code) → 换token → 建/更新用户 → 写session cookie → 跳转
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=wechat_no_code', req.url));
  }

  try {
    // Step 1: 用 code 换 access_token + openid
    const tokenRes = await fetch(
      `https://api.weixin.qq.com/sns/oauth2/access_token?` +
      `appid=${process.env.WECHAT_APP_ID}` +
      `&secret=${process.env.WECHAT_APP_SECRET}` +
      `&code=${code}` +
      `&grant_type=authorization_code`
    );
    const tokenData = await tokenRes.json();

    if (tokenData.errcode) {
      console.error('[WECHAT_QR] Token exchange failed:', tokenData);
      return NextResponse.redirect(new URL('/login?error=wechat_token_fail', req.url));
    }

    // Step 2: 获取用户信息
    const userRes = await fetch(
      `https://api.weixin.qq.com/sns/userinfo?` +
      `access_token=${tokenData.access_token}` +
      `&openid=${tokenData.openid}` +
      `&lang=zh_CN`
    );
    const profile = await userRes.json();

    if (profile.errcode) {
      console.error('[WECHAT_QR] Userinfo failed:', profile);
      return NextResponse.redirect(new URL('/login?error=wechat_userinfo_fail', req.url));
    }

    // Step 3: 查找或创建用户（逻辑与 auth.ts signIn callback 一致）
    let user = null;

    if (tokenData.unionid) {
      user = await prisma.user.findUnique({
        where: { wechatUnionId: tokenData.unionid },
      });
    }
    if (!user) {
      user = await prisma.user.findUnique({
        where: { wechatOpenId: tokenData.openid },
      });
    }

    let needsOnboarding = false;

    if (user) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          name: profile.nickname || user.name,
          avatarUrl: profile.headimgurl || user.avatarUrl,
          wechatOpenId: tokenData.openid,
          wechatUnionId: tokenData.unionid || user.wechatUnionId,
        },
      });
      needsOnboarding = user.needsOnboarding;
    } else {
      user = await prisma.user.create({
        data: {
          name: profile.nickname || '',
          avatarUrl: profile.headimgurl || '',
          wechatOpenId: tokenData.openid,
          wechatUnionId: tokenData.unionid || null,
          needsOnboarding: true,
        },
      });
      needsOnboarding = true;
    }

    // Step 4: 生成 NextAuth 兼容的 JWT session token
    const sessionToken = await encode({
      token: {
        sub: user.id,
        id: user.id,
        name: user.name,
        phone: user.phone || '',
        avatarUrl: user.avatarUrl || '',
        needsOnboarding,
      },
      secret: process.env.NEXTAUTH_SECRET!,
    });

    // Step 5: 写入 session cookie 并重定向
    const isSecure = process.env.NEXTAUTH_URL?.startsWith('https');
    const cookieName = isSecure
      ? '__Secure-next-auth.session-token'
      : 'next-auth.session-token';

    const redirectUrl = needsOnboarding ? '/onboarding' : '/dashboard';
    const response = NextResponse.redirect(new URL(redirectUrl, req.url));

    response.cookies.set(cookieName, sessionToken, {
      httpOnly: true,
      secure: !!isSecure,
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60, // 30 days，与 auth.ts 一致
    });

    return response;
  } catch (error) {
    console.error('[WECHAT_QR] Callback error:', error);
    return NextResponse.redirect(new URL('/login?error=wechat_server_error', req.url));
  }
}
