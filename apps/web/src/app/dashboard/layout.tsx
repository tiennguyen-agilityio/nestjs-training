import {
  Sidebar as ContainerSidebar,
  SidebarInset,
  SidebarProvider,
} from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import Sidebar from '@/components/Sidebar'
import HeaderDashboard from '@/layouts/Header/HeaderDashboard'
import FooterDashboard from '@/layouts/Footer/FooterDashboard'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <TooltipProvider delay={0}>
      <SidebarProvider defaultOpen>
        <ContainerSidebar
          collapsible="icon"
          variant="inset"
          className="rounded-xl border-r border-sidebar-border shadow-xl shadow-on-surface/5"
        >
          <Sidebar />
        </ContainerSidebar>
        <SidebarInset className="relative h-full min-h-svh min-w-0 w-full">
          <HeaderDashboard />
          <div className="min-w-0 flex-1 p-6">
            <div className="mx-auto w-full max-w-screen-2xl">{children}</div>
          </div>
          <FooterDashboard />
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
