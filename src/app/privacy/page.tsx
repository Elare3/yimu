import Link from 'next/link';

export const metadata = {
  title: '隐私政策 - 一木 YiMu',
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-cream-50">
      {/* 顶部导航 */}
      <header className="border-b border-cream-200 bg-white">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-[8px] flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #C47D3F, #D4940E)' }}
            >
              <span className="text-white font-serif text-lg font-bold">木</span>
            </div>
            <span className="font-serif text-brown-800 font-bold">一木</span>
          </Link>
          <Link href="/login" className="text-sm text-caramel hover:underline">
            登录
          </Link>
        </div>
      </header>

      {/* 正文 */}
      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="font-serif text-3xl font-bold text-brown-800 mb-2">隐私政策</h1>
        <p className="text-brown-400 text-sm mb-10">最后更新：2026年4月7日</p>

        <div className="prose prose-brown max-w-none space-y-8 text-brown-700 text-[15px] leading-[1.85]">
          {/* 1 */}
          <section>
            <h2 className="font-serif text-xl font-bold text-brown-800 mb-3">一、我们收集的信息</h2>
            <p>一木（以下简称&ldquo;我们&rdquo;）在您使用服务时，可能收集以下信息：</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li><strong>账号信息</strong>：手机号、微信OpenID（用于登录验证）</li>
              <li><strong>个人资料</strong>：昵称、公司名称、头像（由您主动填写）</li>
              <li><strong>业务数据</strong>：客户信息、项目记录、报价单、收支记录、收款节点（由您主动录入）</li>
              <li><strong>使用日志</strong>：小木调用记录（仅记录调用时间、任务类型和意图参数，不记录真实业务数据）</li>
            </ul>
          </section>

          {/* 2 */}
          <section>
            <h2 className="font-serif text-xl font-bold text-brown-800 mb-3">二、小木数据处理说明（语义分离架构）</h2>
            <p>一木采用<strong>语义分离隐私保护架构</strong>，确保小木永远不接触您的真实业务数据。具体工作方式如下：</p>
            <ol className="list-decimal pl-5 space-y-2 mt-3">
              <li>
                <strong>本地理解</strong>：您的真实数据（客户名称、具体金额、联系方式等）在您的设备和我们的服务器上由规则引擎处理，
                转换为不含隐私信息的&ldquo;意图参数&rdquo;（如&ldquo;金额档位：中等&rdquo;、&ldquo;逾期档位：一周&rdquo;）。
              </li>
              <li>
                <strong>云端表达</strong>：小木的云端服务（阿里云百炼/通义千问）仅接收这些抽象的意图参数，生成通用模板文案。
                小木从未见过您的客户姓名、手机号、具体金额或任何可识别个人的信息。
              </li>
              <li>
                <strong>本地填充</strong>：小木返回的模板在我们的服务器上用您的真实数据填充占位符后，再展示给您。
              </li>
            </ol>
            <p className="mt-3">
              此外，相同意图参数会命中模板缓存池，此时完全零云端调用、零数据外发。
              您可以在<strong>设置 → 数据与隐私 → 小木调用记录</strong>中查看每次小木调用发送了哪些参数。
            </p>
            <p className="mt-2">
              如果您希望完全避免云端调用，可切换到<strong>严格隐私模式</strong>，所有功能将使用纯规则引擎的预设模板，永远零云端调用。
            </p>
          </section>

          {/* 3 */}
          <section>
            <h2 className="font-serif text-xl font-bold text-brown-800 mb-3">三、数据存储与安全</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>存储位置</strong>：您的数据存储在您自行部署的 MongoDB 数据库中。一木为自部署应用，数据完全由您掌控。</li>
              <li><strong>字段加密</strong>：客户的电话、邮箱、微信号、地址等敏感字段采用 AES-256-GCM 加密存储，即使数据库被非法访问，也无法读取明文。</li>
              <li><strong>传输安全</strong>：生产环境强制使用 HTTPS，会话Cookie设置 HttpOnly + Secure + SameSite=Lax。</li>
              <li><strong>速率限制</strong>：每用户每分钟最多60次API请求，防止暴力攻击和滥用。</li>
              <li><strong>输入防护</strong>：所有小木相关输入经过注入攻击检测和敏感信息脱敏处理。</li>
            </ul>
          </section>

          {/* 4 */}
          <section>
            <h2 className="font-serif text-xl font-bold text-brown-800 mb-3">四、您的权利</h2>
            <p>您对自己的数据拥有完全控制权：</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li><strong>查看</strong>：随时在设置页面查看您的个人信息、小木调用日志和隐私模式状态。</li>
              <li><strong>导出</strong>：在设置 → 账户操作中一键导出您的全部数据（JSON格式），包括客户、项目、报价、收支记录。</li>
              <li><strong>删除</strong>：在设置 → 账户操作中注销账号，我们将立即、永久、不可恢复地删除您的所有数据。</li>
              <li><strong>隐私控制</strong>：随时在设置中切换标准/严格隐私模式，控制小木功能的数据处理方式。</li>
            </ul>
          </section>

          {/* 5 */}
          <section>
            <h2 className="font-serif text-xl font-bold text-brown-800 mb-3">五、第三方服务</h2>
            <p>一木使用以下第三方服务：</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li><strong>阿里云百炼（通义千问）</strong>：小木文本生成服务。仅接收语义意图参数，不接收您的真实业务数据。</li>
              <li><strong>短信验证码服务</strong>：仅在您使用手机号登录或绑定手机号时向您下发一次性验证码，用于身份验证。</li>
            </ul>
            <p className="mt-2">我们不会向任何第三方出售、出租或以其他方式分享您的个人数据。</p>
          </section>

          {/* 6 */}
          <section>
            <h2 className="font-serif text-xl font-bold text-brown-800 mb-3">六、联系我们</h2>
            <p>
              如果您对本隐私政策有任何疑问，或需要行使您的数据权利，请通过以下方式联系我们：
            </p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>邮箱：privacy@yimu.app</li>
              <li>GitHub：github.com/yimu-app</li>
            </ul>
          </section>
        </div>
      </main>

      {/* 底部 */}
      <footer className="border-t border-cream-200 py-6 text-center text-xs text-brown-300">
        一木 YiMu - 为独立创业者打造的小木经营伙伴
      </footer>
    </div>
  );
}
