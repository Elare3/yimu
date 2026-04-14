import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import MobileNav from '@/components/layout/MobileNav';
import { ToastContainer } from '@/components/ui/Toast';
import { SWRProvider } from '@/components/providers/SWRProvider';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SWRProvider>
      <div className="min-h-screen bg-cream-50 flex">
        {/* PC 侧边栏 */}
        <Sidebar />

        {/* 主内容区 */}
        <main className="flex-1 min-w-0 pb-20 md:pb-0">
          <Header />
          <div className="px-4 lg:px-8 pb-8 page-enter">
            {children}
          </div>
        </main>

        {/* 移动端底部导航 */}
        <MobileNav />

        {/* Toast 通知 */}
        <ToastContainer />
      </div>
    </SWRProvider>
  );
}
