// 微信扫码登录 OAuth Provider（NextAuth自定义）

import type { OAuthConfig } from 'next-auth/providers/oauth';

interface WechatProfile {
  openid: string;
  unionid?: string;
  nickname: string;
  headimgurl: string;
  sex: number;
  province: string;
  city: string;
  country: string;
}

export function WechatProvider(): OAuthConfig<WechatProfile> {
  return {
    id: 'wechat',
    name: '微信登录',
    type: 'oauth',

    // 微信授权端点（PC扫码模式）
    authorization: {
      url: 'https://open.weixin.qq.com/connect/qrconnect',
      params: {
        appid: process.env.WECHAT_APP_ID,
        response_type: 'code',
        scope: 'snsapi_login',
      },
    },

    // 微信用code换access_token（微信不走标准OAuth，参数名不同）
    token: {
      url: 'https://api.weixin.qq.com/sns/oauth2/access_token',
      async request({ params }) {
        const res = await fetch(
          `https://api.weixin.qq.com/sns/oauth2/access_token?` +
          `appid=${process.env.WECHAT_APP_ID}` +
          `&secret=${process.env.WECHAT_APP_SECRET}` +
          `&code=${params.code}` +
          `&grant_type=authorization_code`
        );
        const data = await res.json();

        if (data.errcode) {
          throw new Error(`WeChat token error: ${data.errcode} ${data.errmsg}`);
        }

        return {
          tokens: {
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            expires_at: Math.floor(Date.now() / 1000) + data.expires_in,
            // 把openid和unionid带过来，后面profile要用
            openid: data.openid,
            unionid: data.unionid,
          },
        };
      },
    },

    // 用access_token获取用户信息
    userinfo: {
      url: 'https://api.weixin.qq.com/sns/userinfo',
      async request({ tokens }) {
        const res = await fetch(
          `https://api.weixin.qq.com/sns/userinfo?` +
          `access_token=${tokens.access_token}` +
          `&openid=${(tokens as any).openid}` +
          `&lang=zh_CN`
        );
        const data = await res.json();

        if (data.errcode) {
          throw new Error(`WeChat userinfo error: ${data.errcode} ${data.errmsg}`);
        }

        return data;
      },
    },

    // 映射微信返回字段到NextAuth标准profile
    profile(profile: WechatProfile) {
      return {
        id: profile.openid,
        name: profile.nickname,
        image: profile.headimgurl,
        openid: profile.openid,
        unionid: profile.unionid,
      } as any;
    },

    clientId: process.env.WECHAT_APP_ID!,
    clientSecret: process.env.WECHAT_APP_SECRET!,
  };
}
